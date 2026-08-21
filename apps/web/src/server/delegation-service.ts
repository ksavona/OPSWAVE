import { createHash, randomBytes, randomInt } from "node:crypto";

import {
  SafeApplicationError,
  createDelegationAlias,
  collaborationFlagsSchema,
  delegatePresentationSchema,
  delegationCreateSchema,
  delegationUpdateSchema,
  emailDeliveryConfigurationSchema,
  taskDelegateSharingSchema,
} from "@opsweave/domain";
import {
  StoreConflictError,
  type CollaborationStore,
  type PrincipalSessionRecord,
} from "@opsweave/db";

import { AuthorizationService } from "./authorization-service";
import { encryptInvitationPayload, isInvitationEncryptionAvailable } from "./invitation-crypto";
import { malwareScannerStatus } from "./malware-scanner";

const INVITATION_LIFETIME_MS = 72 * 60 * 60 * 1_000;
const tokenDigest = (token: string): string => createHash("sha256").update(token).digest("hex");

export class DelegationService {
  private readonly authorization: AuthorizationService;

  public constructor(private readonly store: CollaborationStore) {
    this.authorization = new AuthorizationService(store);
  }

  public async list(
    session: PrincipalSessionRecord,
    subject?: { id: string; type: "project" | "task" },
  ) {
    this.authorization.requireOwnerOrAdmin(session);
    return this.store.listAccessGrants(session.workspaceId, subject);
  }

  public async users(session: PrincipalSessionRecord) {
    this.authorization.requireOwnerOrAdmin(session);
    return this.store.listUsers(session.workspaceId);
  }

  public async taskProgress(session: PrincipalSessionRecord, taskId: string) {
    this.authorization.requireOwnerOrAdmin(session);
    return this.store.listTaskDelegationProgress(session.workspaceId, taskId);
  }

  public async taskSharing(session: PrincipalSessionRecord, taskId: string) {
    this.authorization.requireOwnerOrAdmin(session);
    try {
      return await this.store.getTaskDelegateSharing(session.workspaceId, taskId);
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("forbidden", error.message, 404);
      }
      throw error;
    }
  }

  public async anonymisation(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
  ) {
    this.authorization.requireOwnerOrAdmin(session);
    try {
      return await this.store.getSubjectAnonymisation(session.workspaceId, subjectType, subjectId);
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("forbidden", error.message, 404);
      }
      throw error;
    }
  }

  public async updateAnonymisation(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
    value: unknown,
  ) {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    if (
      value === null ||
      typeof value !== "object" ||
      typeof (value as { enabled?: unknown }).enabled !== "boolean"
    ) {
      throw new SafeApplicationError(
        "validation_error",
        "The anonymisation setting is invalid.",
        400,
      );
    }
    await this.store.setSubjectAnonymisation({
      actorUserId: principal.userId,
      enabled: (value as { enabled: boolean }).enabled,
      subjectId,
      subjectType,
      workspaceId: principal.workspaceId,
    });
    return this.anonymisation(session, subjectType, subjectId);
  }

  public async updateTaskSharing(session: PrincipalSessionRecord, taskId: string, value: unknown) {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    const input = taskDelegateSharingSchema.parse(value);
    try {
      return await this.store.updateTaskDelegateSharing({
        actorUserId: principal.userId,
        selectedUserIds: input.selectedUserIds,
        taskId,
        visibility: input.visibility,
        workspaceId: principal.workspaceId,
      });
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  public async flags(session: PrincipalSessionRecord) {
    this.authorization.requireOwnerOrAdmin(session);
    return this.store.getCollaborationFlags(session.workspaceId);
  }

  public async updateFlags(session: PrincipalSessionRecord, value: unknown): Promise<void> {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    const input = collaborationFlagsSchema.parse(value);
    if (input.invitationEmailEnabled) {
      const storedEmail = await this.store.getEmailDeliveryConfiguration(principal.workspaceId);
      const environmentEmail = (process.env.EMAIL_DELIVERY_WEBHOOK_URL?.length ?? 0) > 0;
      if (!isInvitationEncryptionAvailable() || (!environmentEmail && !storedEmail.configured)) {
        throw new SafeApplicationError(
          "configuration_error",
          "Configure invitation encryption and email delivery before enabling invitation emails.",
          400,
        );
      }
    }
    if (input.delegateUploadsEnabled && !malwareScannerStatus().configured) {
      throw new SafeApplicationError(
        "configuration_error",
        "Configure the malware scanner before enabling delegate uploads.",
        400,
      );
    }
    await this.store.updateCollaborationFlags(principal.workspaceId, principal.userId, input);
  }

  public async runtimeConfiguration(session: PrincipalSessionRecord) {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    const storedEmail = await this.store.getEmailDeliveryConfiguration(principal.workspaceId);
    const environmentEndpoint = process.env.EMAIL_DELIVERY_WEBHOOK_URL?.trim();
    const publicBaseUrl = process.env.APP_BASE_URL?.trim();
    return {
      email: environmentEndpoint
        ? {
            configured: true,
            endpoint: environmentEndpoint,
            source: "environment" as const,
            tokenConfigured: (process.env.EMAIL_DELIVERY_WEBHOOK_TOKEN?.length ?? 0) > 0,
            updatedAt: null,
          }
        : { ...storedEmail, source: "settings" as const },
      invitationEncryptionReady: isInvitationEncryptionAvailable(),
      malwareScanner: malwareScannerStatus(),
      publicBaseUrl:
        publicBaseUrl === undefined || publicBaseUrl.length === 0 ? null : publicBaseUrl,
    };
  }

  public async saveEmailConfiguration(session: PrincipalSessionRecord, value: unknown) {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    if ((process.env.EMAIL_DELIVERY_WEBHOOK_URL?.length ?? 0) > 0) {
      throw new SafeApplicationError(
        "conflict",
        "Email delivery is managed by the deployment environment.",
        409,
      );
    }
    const input = emailDeliveryConfigurationSchema.parse(value);
    const token = input.token?.trim();
    let encryptedToken: string | undefined;
    if (token !== undefined && token.length > 0) {
      encryptedToken = encryptInvitationPayload(token) ?? undefined;
      if (encryptedToken === undefined) {
        throw new SafeApplicationError(
          "configuration_error",
          "Configure INVITATION_LINK_ENCRYPTION_KEY before saving an email token.",
          503,
        );
      }
    }
    await this.store.saveEmailDeliveryConfiguration({
      actorUserId: principal.userId,
      ...(encryptedToken === undefined ? {} : { encryptedToken }),
      endpoint: input.endpoint,
      workspaceId: principal.workspaceId,
    });
    return this.runtimeConfiguration(session);
  }

  public async deleteEmailConfiguration(session: PrincipalSessionRecord): Promise<void> {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    if ((process.env.EMAIL_DELIVERY_WEBHOOK_URL?.length ?? 0) > 0) {
      throw new SafeApplicationError(
        "conflict",
        "Email delivery is managed by the deployment environment.",
        409,
      );
    }
    await this.store.deleteEmailDeliveryConfiguration({
      actorUserId: principal.userId,
      workspaceId: principal.workspaceId,
    });
  }

  public async create(session: PrincipalSessionRecord, value: unknown, origin: string) {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    const input = delegationCreateSchema.parse(value);
    const token = randomBytes(32).toString("base64url");
    const invitationExpiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
    const invitationUrl = `${origin}/invitations/accept#token=${encodeURIComponent(token)}`;
    const flags = await this.store.getCollaborationFlags(principal.workspaceId);
    try {
      const created = await this.store.createAccessGrant({
        accessRole: input.accessRole,
        actorUserId: principal.userId,
        anonymise: input.anonymise,
        delegateEmail: input.delegateEmail,
        delegationNote: input.delegationNote,
        privacyKeywords: input.privacyKeywords,
        profileDescription: input.profileDescription,
        encryptedInvitationPayload: encryptInvitationPayload(
          JSON.stringify({ invitationUrl, version: 1 }),
        ),
        expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt),
        invitationExpiresAt,
        invitationTokenDigest: tokenDigest(token),
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        workspaceId: principal.workspaceId,
      });
      return {
        delivery:
          flags.invitationEmailEnabled && isInvitationEncryptionAvailable() ? "queued" : "manual",
        grant: created.grant,
        invitationUrl,
      } as const;
    } catch (error) {
      if (error instanceof StoreConflictError || (error as { code?: string }).code === "23505") {
        throw new SafeApplicationError(
          "conflict",
          error instanceof Error ? error.message : "This delegate already has live access.",
          409,
        );
      }
      throw error;
    }
  }

  public async update(
    session: PrincipalSessionRecord,
    grantId: string,
    value: unknown,
    origin: string,
  ) {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    const input = delegationUpdateSchema.parse(value);
    if (input.delegateEmail !== undefined) {
      const token = randomBytes(32).toString("base64url");
      const invitationUrl = `${origin}/invitations/accept#token=${encodeURIComponent(token)}`;
      const flags = await this.store.getCollaborationFlags(principal.workspaceId);
      try {
        const replacement = await this.store.replaceAccessGrant({
          actorUserId: principal.userId,
          delegateEmail: input.delegateEmail,
          encryptedInvitationPayload: encryptInvitationPayload(
            JSON.stringify({ invitationUrl, version: 1 }),
          ),
          grantId,
          invitationExpiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
          invitationTokenDigest: tokenDigest(token),
          version: input.version,
          workspaceId: principal.workspaceId,
          ...(input.accessRole === undefined ? {} : { accessRole: input.accessRole }),
          ...(input.delegationNote === undefined ? {} : { delegationNote: input.delegationNote }),
          ...(input.privacyKeywords === undefined
            ? {}
            : { privacyKeywords: input.privacyKeywords }),
          ...(input.profileDescription === undefined
            ? {}
            : { profileDescription: input.profileDescription }),
          ...(input.expiresAt === undefined
            ? {}
            : { expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt) }),
        });
        return {
          delivery:
            flags.invitationEmailEnabled && isInvitationEncryptionAvailable() ? "queued" : "manual",
          grant: replacement.grant,
          invitationUrl,
          replaced: true,
        } as const;
      } catch (error) {
        if (error instanceof StoreConflictError || (error as { code?: string }).code === "23505") {
          throw new SafeApplicationError(
            "conflict",
            error instanceof Error ? error.message : "The replacement delegate already has access.",
            409,
          );
        }
        throw error;
      }
    }
    return this.store.updateAccessGrant({
      actorUserId: principal.userId,
      grantId,
      version: input.version,
      workspaceId: principal.workspaceId,
      ...(input.accessRole === undefined ? {} : { accessRole: input.accessRole }),
      ...(input.delegationNote === undefined ? {} : { delegationNote: input.delegationNote }),
      ...(input.privacyKeywords === undefined ? {} : { privacyKeywords: input.privacyKeywords }),
      ...(input.profileDescription === undefined
        ? {}
        : { profileDescription: input.profileDescription }),
      ...(input.expiresAt === undefined
        ? {}
        : { expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt) }),
    });
  }

  public async resend(session: PrincipalSessionRecord, grantId: string, origin: string) {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    const token = randomBytes(32).toString("base64url");
    const invitationUrl = `${origin}/invitations/accept#token=${encodeURIComponent(token)}`;
    try {
      await this.store.reissueInvitation({
        actorUserId: principal.userId,
        encryptedInvitationPayload: encryptInvitationPayload(
          JSON.stringify({ invitationUrl, version: 1 }),
        ),
        grantId,
        invitationExpiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
        invitationTokenDigest: tokenDigest(token),
        workspaceId: principal.workspaceId,
      });
      return { invitationUrl };
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  public async revoke(session: PrincipalSessionRecord, grantId: string): Promise<void> {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    try {
      await this.store.revokeAccessGrant(principal.workspaceId, principal.userId, grantId);
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  public async provisionAliases(workspaceId: string, userId: string): Promise<void> {
    await this.store.ensureAliasesForUser(workspaceId, userId, () =>
      createDelegationAlias((maximum) => randomInt(maximum)),
    );
  }

  public async getPresentation(
    session: PrincipalSessionRecord,
    subjectType: "project" | "task",
    subjectId: string,
  ) {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    return this.store.getDelegatePresentation(principal.workspaceId, subjectType, subjectId);
  }

  public async savePresentation(session: PrincipalSessionRecord, value: unknown) {
    const principal = this.authorization.requireOwnerOrAdmin(session);
    const input = delegatePresentationSchema.parse(value);
    return this.store.saveDelegatePresentation({
      actorUserId: principal.userId,
      neutralClientLabel: input.neutralClientLabel,
      neutralProjectLabel: input.neutralProjectLabel,
      safeDefinitionOfDone: input.safeDefinitionOfDone,
      safeDescription: input.safeDescription,
      safeNotes: input.safeNotes,
      safeTitle: input.safeTitle,
      safeWorkDescription: input.safeWorkDescription,
      status: input.status,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
      version: input.version,
      workspaceId: principal.workspaceId,
    });
  }
}

export { tokenDigest as digestInvitationToken };
