import { SafeApplicationError, hashPassword, validateNewPassword } from "@opsweave/domain";
import {
  StoreConflictError,
  type CollaborationStore,
  type PrincipalSessionRecord,
} from "@opsweave/db";

import { digestInvitationToken, DelegationService } from "./delegation-service";

export class InvitationService {
  public constructor(private readonly store: CollaborationStore) {}

  public async inspect(token: unknown) {
    const value = typeof token === "string" ? token : "";
    if (value.length < 32 || value.length > 512) {
      throw new SafeApplicationError("validation_error", "The invitation is invalid.", 400);
    }
    const invitation = await this.store.inspectInvitation(digestInvitationToken(value));
    if (invitation === null) {
      throw new SafeApplicationError(
        "authentication_required",
        "The invitation is unavailable or has expired.",
        401,
      );
    }
    return invitation;
  }

  public async accept(input: {
    fullName: unknown;
    password: unknown;
    passwordConfirmation: unknown;
    session: PrincipalSessionRecord | null;
    token: unknown;
  }) {
    const invitation = await this.inspect(input.token);
    let passwordHash: string | undefined;
    let fullName: string | undefined;
    if (input.session === null) {
      if (invitation.delegateUserId !== null) {
        throw new SafeApplicationError(
          "authentication_required",
          "Sign in with the invited account before accepting.",
          401,
        );
      }
      fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
      if (fullName.length < 1 || fullName.length > 200) {
        throw new SafeApplicationError("validation_error", "Enter your name.", 400);
      }
      try {
        passwordHash = await hashPassword(
          validateNewPassword(input.password, input.passwordConfirmation),
        );
      } catch {
        throw new SafeApplicationError(
          "validation_error",
          "The password requirements were not satisfied.",
          400,
        );
      }
    }
    try {
      const accepted = await this.store.acceptInvitation({
        ...(fullName === undefined ? {} : { fullName }),
        ...(passwordHash === undefined ? {} : { passwordHash }),
        tokenDigest: digestInvitationToken(String(input.token)),
        ...(input.session === null ? {} : { userId: input.session.userId }),
      });
      await new DelegationService(this.store).provisionAliases(
        invitation.workspaceId,
        accepted.userId,
      );
      return { ...accepted, invitedEmail: invitation.delegateEmail };
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  public async decline(token: unknown): Promise<void> {
    await this.inspect(token);
    try {
      await this.store.declineInvitation(digestInvitationToken(String(token)));
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }
}
