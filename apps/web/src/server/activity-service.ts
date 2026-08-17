import {
  SafeApplicationError,
  activityCreateSchema,
  activityQuerySchema,
  containsProtectedTerm,
  findProtectedContactMatches,
} from "@opsweave/domain";
import type { CollaborationStore, PrincipalSessionRecord } from "@opsweave/db";

import { AuthorizationService } from "./authorization-service";

const unique = (values: readonly string[]) => [...new Set(values)];

export class ActivityService {
  private readonly authorization: AuthorizationService;

  public constructor(private readonly store: CollaborationStore) {
    this.authorization = new AuthorizationService(store);
  }

  public async participants(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
  ) {
    this.authorization.requireCapability(session, "activity.read");
    await this.authorization.requireSubjectAccess(session, subjectType, subjectId);
    return this.store.listSubjectParticipants(
      session.workspaceId,
      session.role,
      subjectType,
      subjectId,
      session.userId,
    );
  }

  public async list(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
    value: unknown,
  ) {
    this.authorization.requireCapability(session, "activity.read");
    await this.authorization.requireSubjectAccess(session, subjectType, subjectId);
    const query = activityQuerySchema.parse(value);
    const events = await this.store.listActivity({
      ...(query.category === undefined ? {} : { category: query.category }),
      ...(query.dateFrom === undefined ? {} : { dateFrom: query.dateFrom }),
      ...(query.dateTo === undefined ? {} : { dateTo: query.dateTo }),
      ...(query.query === undefined ? {} : { query: query.query }),
      subjectId,
      subjectType,
      ...(query.userGenerated === undefined ? {} : { userGenerated: query.userGenerated }),
      ...(query.userId === undefined ? {} : { userId: query.userId }),
      viewerRole: session.role,
      viewerUserId: session.userId,
      workspaceId: session.workspaceId,
    });
    return session.role === "owner" || session.role === "admin"
      ? events
      : events.map((event) => ({ ...event, metadata: {} }));
  }

  public async create(session: PrincipalSessionRecord, value: unknown): Promise<string> {
    this.authorization.requireCapability(session, "activity.write");
    const input = activityCreateSchema.parse(value);
    const access = await this.authorization.requireSubjectAccess(
      session,
      input.subjectType,
      input.subjectId,
    );
    const participants = await this.store.listSubjectParticipants(
      session.workspaceId,
      session.role,
      input.subjectType,
      input.subjectId,
      session.userId,
    );
    const participantIds = new Set(participants.map((participant) => participant.userId));
    const mentionedUserIds = unique(input.mentionedUserIds);
    const explicitlyNotifiedUserIds = unique(input.notifyUserIds);
    if (
      [...mentionedUserIds, ...explicitlyNotifiedUserIds].some(
        (userId) => !participantIds.has(userId),
      )
    ) {
      throw new SafeApplicationError(
        "validation_error",
        "A selected recipient no longer has access to this item.",
        400,
      );
    }

    const anonymised = await this.store.isSubjectAnonymised(
      session.workspaceId,
      input.subjectType,
      input.subjectId,
    );
    const protectedTerms = anonymised
      ? await this.store.listProtectedTermValues(
          session.workspaceId,
          input.subjectType,
          input.subjectId,
        )
      : [];
    const contactMatches = findProtectedContactMatches(input.body);
    const protectedTermFound = anonymised && containsProtectedTerm(input.body, protectedTerms);
    const delegatePolicyViolation = session.role === "delegate" && contactMatches.length > 0;
    const quarantine = delegatePolicyViolation || protectedTermFound;
    const notificationUserIds =
      input.kind === "message"
        ? mentionedUserIds.length > 0
          ? mentionedUserIds
          : participants.map((participant) => participant.userId)
        : explicitlyNotifiedUserIds;

    return this.store.createActivity({
      actorAlias: access?.alias ?? null,
      actorUserId: session.userId,
      body: input.body,
      contentStatus: quarantine ? "quarantined" : "approved",
      kind: input.kind,
      mentionedUserIds,
      notificationUserIds: unique(notificationUserIds),
      quarantineReason: quarantine
        ? "Potential protected identity or contact information requires owner review."
        : null,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
      workspaceId: session.workspaceId,
    });
  }
}
