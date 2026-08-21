import {
  SafeApplicationError,
  taskTimeEntryCreateSchema,
  timeEntryUpdateSchema,
} from "@opsweave/domain";
import {
  StoreConflictError,
  type CollaborationStore,
  type PrincipalSessionRecord,
} from "@opsweave/db";

import { AuthorizationService } from "./authorization-service";

export class TimesheetService {
  private readonly authorization: AuthorizationService;

  public constructor(private readonly store: CollaborationStore) {
    this.authorization = new AuthorizationService(store);
  }

  private async access(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
  ) {
    this.authorization.requireCapability(session, "timesheet.read");
    return this.authorization.requireSubjectAccess(session, subjectType, subjectId);
  }

  public async list(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
  ) {
    await this.access(session, subjectType, subjectId);
    const entries = await this.store.listTimeEntries({
      subjectId,
      subjectType,
      viewerUserId: session.userId,
      viewerRole: session.role,
      workspaceId: session.workspaceId,
    });
    const canManageAll = session.role === "owner" || session.role === "admin";
    return entries.map(({ userId, ...entry }) => ({
      ...entry,
      canEdit: canManageAll || userId === session.userId,
    }));
  }

  public async create(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
    value: unknown,
  ): Promise<void> {
    this.authorization.requireCapability(session, "timesheet.write");
    const access = await this.access(session, subjectType, subjectId);
    const input = taskTimeEntryCreateSchema.parse(value);
    await this.store.createTimeEntry({
      accessGrantId: access?.grantId ?? null,
      actorAlias: access?.alias ?? null,
      actorUserId: session.userId,
      description: input.description,
      entryDate: input.entryDate,
      hours: input.hours,
      subjectId,
      subjectType,
      workspaceId: session.workspaceId,
    });
  }

  public async update(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
    entryId: string,
    value: unknown,
  ): Promise<void> {
    this.authorization.requireCapability(session, "timesheet.write");
    await this.access(session, subjectType, subjectId);
    const input = timeEntryUpdateSchema.parse(value);
    try {
      await this.store.updateTimeEntry({
        actorUserId: session.userId,
        canManageAll: session.role === "owner" || session.role === "admin",
        description: input.description,
        entryDate: input.entryDate,
        entryId,
        hours: input.hours,
        subjectId,
        subjectType,
        version: input.version,
        workspaceId: session.workspaceId,
      });
    } catch (error) {
      if (error instanceof StoreConflictError)
        throw new SafeApplicationError("conflict", error.message, 409);
      throw error;
    }
  }

  public async delete(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
    entryId: string,
  ): Promise<void> {
    this.authorization.requireCapability(session, "timesheet.write");
    await this.access(session, subjectType, subjectId);
    try {
      await this.store.deleteTimeEntry({
        actorUserId: session.userId,
        canManageAll: session.role === "owner" || session.role === "admin",
        entryId,
        subjectId,
        subjectType,
        workspaceId: session.workspaceId,
      });
    } catch (error) {
      if (error instanceof StoreConflictError)
        throw new SafeApplicationError("conflict", error.message, 409);
      throw error;
    }
  }
}
