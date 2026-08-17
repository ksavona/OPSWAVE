import {
  SafeApplicationError,
  attachmentSharingSchema,
  containsProtectedTerm,
  findProtectedContactMatches,
} from "@opsweave/domain";
import type { CollaborationStore, PrincipalSessionRecord } from "@opsweave/db";

import { AuthorizationService } from "./authorization-service";

export class DocumentService {
  private readonly authorization: AuthorizationService;

  public constructor(private readonly store: CollaborationStore) {
    this.authorization = new AuthorizationService(store);
  }

  public async list(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
  ) {
    this.authorization.requireCapability(session, "attachments.read");
    await this.authorization.requireSubjectAccess(session, subjectType, subjectId);
    const attachments = await this.store.listAccessibleAttachments({
      subjectId,
      subjectType,
      userId: session.userId,
      viewerRole: session.role,
      workspaceId: session.workspaceId,
    });
    return attachments.map(({ storageKey, uploadedByUserId, ...attachment }) => {
      void storageKey;
      void uploadedByUserId;
      return attachment;
    });
  }

  public async uploadAllowed(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
  ): Promise<boolean> {
    await this.authorization.requireSubjectAccess(session, subjectType, subjectId);
    if (session.role === "owner" || session.role === "admin") return true;
    const flags = await this.store.getCollaborationFlags(session.workspaceId);
    return (
      flags.delegateUploadsEnabled &&
      typeof process.env.ATTACHMENT_SCANNER_ENDPOINT === "string" &&
      process.env.ATTACHMENT_SCANNER_ENDPOINT.length > 0
    );
  }

  public async prepareUpload(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
  ) {
    const access = await this.authorization.requireSubjectAccess(session, subjectType, subjectId);
    if (session.role === "delegate") {
      const flags = await this.store.getCollaborationFlags(session.workspaceId);
      if (!flags.delegateUploadsEnabled) {
        throw new SafeApplicationError("forbidden", "Delegate document uploads are disabled.", 403);
      }
    } else {
      this.authorization.requireCapability(session, "attachments.write");
    }
    return {
      access,
      anonymised: await this.store.isSubjectAnonymised(session.workspaceId, subjectType, subjectId),
    };
  }

  public async create(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
    file: {
      byteSize: number;
      contentHash: string;
      contentType: string;
      originalName: string;
      storageKey: string;
    },
    value: {
      delegateSafeName: string | null;
      originalAttachmentId: string | null;
      selectedUserIds: readonly string[];
      visibility:
        | "internal_only"
        | "redacted_delegate_copy"
        | "shared_all_delegates"
        | "shared_selected_delegates";
    },
  ): Promise<string> {
    const prepared = await this.prepareUpload(session, subjectType, subjectId);
    const owner = session.role === "owner" || session.role === "admin";
    if (!owner && value.visibility === "internal_only") {
      throw new SafeApplicationError(
        "validation_error",
        "Delegates cannot create internal-only documents.",
        400,
      );
    }
    if (value.visibility === "shared_selected_delegates" && value.selectedUserIds.length === 0) {
      throw new SafeApplicationError(
        "validation_error",
        "Select at least one delegate for this document.",
        400,
      );
    }
    if (
      prepared.anonymised &&
      value.visibility !== "internal_only" &&
      value.visibility !== "redacted_delegate_copy"
    ) {
      throw new SafeApplicationError(
        "validation_error",
        "Anonymised work can expose only an approved redacted delegate copy.",
        400,
      );
    }
    if (value.visibility === "redacted_delegate_copy") {
      if (!owner || value.originalAttachmentId === null || value.delegateSafeName === null) {
        throw new SafeApplicationError(
          "validation_error",
          "A redacted copy requires an owner-selected original and a neutral filename.",
          400,
        );
      }
      const original = await this.store.getAttachmentSubject(
        session.workspaceId,
        value.originalAttachmentId,
      );
      if (original?.subjectType !== subjectType || original.subjectId !== subjectId) {
        throw new SafeApplicationError(
          "validation_error",
          "The original document is unavailable.",
          400,
        );
      }
    }
    const participants = await this.store.listSubjectParticipants(
      session.workspaceId,
      session.role,
      subjectType,
      subjectId,
      session.userId,
    );
    const participantIds = new Set(participants.map((participant) => participant.userId));
    if (value.selectedUserIds.some((userId) => !participantIds.has(userId))) {
      throw new SafeApplicationError(
        "validation_error",
        "A selected recipient no longer has access.",
        400,
      );
    }
    const protectedTerms = prepared.anonymised
      ? await this.store.listProtectedTermValues(session.workspaceId, subjectType, subjectId)
      : [];
    const filenameRisk =
      findProtectedContactMatches(file.originalName).length > 0 ||
      (prepared.anonymised && containsProtectedTerm(file.originalName, protectedTerms));
    const approvalStatus = owner && !filenameRisk ? "approved" : "draft";
    return this.store.createCollaborationAttachment({
      actorAlias: prepared.access?.alias ?? null,
      actorUserId: session.userId,
      approvalStatus,
      byteSize: file.byteSize,
      contentHash: file.contentHash,
      contentType: file.contentType,
      delegateSafeName: value.delegateSafeName,
      filenameRisk,
      originalAttachmentId: value.originalAttachmentId,
      originalName: file.originalName,
      selectedUserIds: value.selectedUserIds,
      storageKey: file.storageKey,
      subjectId,
      subjectType,
      visibility: value.visibility,
      workspaceId: session.workspaceId,
    });
  }

  public async download(session: PrincipalSessionRecord, attachmentId: string) {
    const subject = await this.store.getAttachmentSubject(session.workspaceId, attachmentId);
    if (subject === null)
      throw new SafeApplicationError("validation_error", "The document is unavailable.", 404);
    await this.authorization.requireSubjectAccess(session, subject.subjectType, subject.subjectId);
    const attachments = await this.store.listAccessibleAttachments({
      subjectId: subject.subjectId,
      subjectType: subject.subjectType,
      userId: session.userId,
      viewerRole: session.role,
      workspaceId: session.workspaceId,
    });
    const attachment = attachments.find((candidate) => candidate.id === attachmentId);
    if (attachment === undefined)
      throw new SafeApplicationError("validation_error", "The document is unavailable.", 404);
    return attachment;
  }

  public async updateSharing(
    session: PrincipalSessionRecord,
    attachmentId: string,
    value: unknown,
  ): Promise<void> {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    const input = attachmentSharingSchema.parse(value);
    const subject = await this.store.getAttachmentSubject(principal.workspaceId, attachmentId);
    if (subject === null)
      throw new SafeApplicationError("validation_error", "The document is unavailable.", 404);
    const anonymised = await this.store.isSubjectAnonymised(
      principal.workspaceId,
      subject.subjectType,
      subject.subjectId,
    );
    if (
      anonymised &&
      input.visibility !== "internal_only" &&
      input.visibility !== "redacted_delegate_copy"
    ) {
      throw new SafeApplicationError(
        "validation_error",
        "Anonymised work can expose only an approved redacted delegate copy.",
        400,
      );
    }
    if (input.visibility === "redacted_delegate_copy") {
      const current = (
        await this.store.listAccessibleAttachments({
          subjectId: subject.subjectId,
          subjectType: subject.subjectType,
          userId: principal.userId,
          viewerRole: principal.role,
          workspaceId: principal.workspaceId,
        })
      ).find((attachment) => attachment.id === attachmentId);
      if (
        current?.originalAttachmentId === null ||
        input.delegateSafeName === null ||
        input.delegateSafeName.length === 0
      ) {
        throw new SafeApplicationError(
          "validation_error",
          "Upload a separate redacted copy with its original and neutral filename.",
          400,
        );
      }
    }
    const participants = await this.store.listSubjectParticipants(
      principal.workspaceId,
      principal.role,
      subject.subjectType,
      subject.subjectId,
      principal.userId,
    );
    const participantIds = new Set(participants.map((participant) => participant.userId));
    if (input.selectedUserIds.some((userId) => !participantIds.has(userId))) {
      throw new SafeApplicationError(
        "validation_error",
        "A selected recipient no longer has access.",
        400,
      );
    }
    await this.store.updateAttachmentSharing({
      actorUserId: principal.userId,
      approvalStatus: input.approvalStatus,
      attachmentId,
      delegateSafeName: input.delegateSafeName,
      selectedUserIds: input.selectedUserIds,
      visibility: input.visibility,
      workspaceId: principal.workspaceId,
    });
  }
}
