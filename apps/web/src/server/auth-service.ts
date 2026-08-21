import { createHash, randomBytes } from "node:crypto";

import {
  SESSION_ABSOLUTE_DURATION_MS,
  SESSION_IDLE_DURATION_MS,
  SafeApplicationError,
  createSessionTimes,
  getSessionInvalidReason,
  hashPassword,
  normalizeUsername,
  shouldPersistSessionActivity,
  validateNewPassword,
  validateOwnerUsername,
  verifyPassword,
} from "@opsweave/domain";
import {
  StoreConflictError,
  type OpsWeaveStore,
  type PrincipalSessionRecord,
  type SessionRecord,
  type UserCredentialRecord,
} from "@opsweave/db";

import type { RateLimitGate } from "./rate-limits";
import { digestRateLimitSignal, digestSessionToken } from "./request-security";

const INVALID_LOGIN_MESSAGE = "The username or password is invalid.";

export interface CreatedSession {
  readonly maxAgeSeconds: number;
  readonly record: PrincipalSessionRecord;
  readonly token: string;
}

const createToken = () => randomBytes(32).toString("base64url");

export class AuthService {
  public constructor(
    private readonly store: OpsWeaveStore,
    private readonly rateLimits: RateLimitGate,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async login(usernameValue: unknown, passwordValue: unknown, networkSignal: string) {
    const rawUsername = typeof usernameValue === "string" ? usernameValue : "";
    const password = typeof passwordValue === "string" ? passwordValue : "";
    const normalized = normalizeUsername(rawUsername).slice(0, 320);
    const accountDigest = digestRateLimitSignal(`account:${normalized}`);
    const networkDigest = digestRateLimitSignal(`network:${networkSignal}`);
    try {
      await Promise.all([
        this.rateLimits.consumeAccount(accountDigest),
        this.rateLimits.consumeNetwork(networkDigest),
      ]);
    } catch (error) {
      const retryAfterSeconds = (error as { retryAfterSeconds?: number }).retryAfterSeconds ?? 60;
      await this.store.recordLoginAttempt(accountDigest, networkDigest, "limited");
      throw new SafeApplicationError(
        "rate_limited",
        "Too many login attempts. Try again later.",
        429,
        retryAfterSeconds,
      );
    }

    const candidate = await this.store.findUserForLogin(normalized);
    const timingOwner = candidate ?? (await this.store.getOnlyUserCredential());
    const passwordMatches =
      timingOwner === null
        ? false
        : await verifyPassword(timingOwner.passwordHash, password || "invalid");
    if (
      candidate === null ||
      !passwordMatches ||
      candidate.userStatus !== "active" ||
      candidate.membershipStatus !== "active"
    ) {
      await this.store.recordLoginAttempt(accountDigest, networkDigest, "failed");
      throw new SafeApplicationError("invalid_credentials", INVALID_LOGIN_MESSAGE, 401);
    }

    await this.rateLimits.resetAccount(accountDigest);
    await this.store.recordLoginAttempt(accountDigest, networkDigest, "succeeded");
    return this.createSession(candidate);
  }

  private async createSession(user: UserCredentialRecord) {
    const now = this.clock();
    const token = createToken();
    const record = await this.store.createPrincipalSession(
      user,
      digestSessionToken(token),
      createSessionTimes(now),
    );
    return {
      maxAgeSeconds: Math.floor(SESSION_ABSOLUTE_DURATION_MS / 1_000),
      record,
      token,
    } satisfies CreatedSession;
  }

  public async authenticatePrincipalToken(token: string | null): Promise<PrincipalSessionRecord> {
    if (token === null || token.length < 32 || token.length > 128) {
      throw new SafeApplicationError("authentication_required", "Authentication is required.", 401);
    }
    const session = await this.store.findPrincipalSessionByDigest(digestSessionToken(token));
    if (session === null) {
      throw new SafeApplicationError("authentication_required", "Authentication is required.", 401);
    }
    const now = this.clock();
    if (getSessionInvalidReason(session, now) !== null) {
      await this.store.revokeSession(session.id);
      throw new SafeApplicationError("authentication_required", "Authentication is required.", 401);
    }
    if (session.userStatus !== "active" || session.membershipStatus !== "active") {
      await this.store.revokeSession(session.id);
      throw new SafeApplicationError("authentication_required", "Authentication is required.", 401);
    }
    if (shouldPersistSessionActivity(session, now)) {
      const idleExpiresAt = new Date(
        Math.min(now.getTime() + SESSION_IDLE_DURATION_MS, session.absoluteExpiresAt.getTime()),
      );
      await this.store.touchSession(session.id, now, idleExpiresAt);
    }
    return session;
  }

  public async authenticateToken(token: string | null): Promise<SessionRecord> {
    const principal = await this.authenticatePrincipalToken(token);
    if (principal.role !== "owner" && principal.role !== "admin") {
      throw new SafeApplicationError(
        "forbidden",
        "This area is available to workspace owners and admins.",
        403,
      );
    }
    const compatibility =
      principal.ownerId !== null && principal.username !== null
        ? { ownerId: principal.ownerId, username: principal.username }
        : await this.store.getWorkspaceOwnerCompatibility(principal.workspaceId);
    if (compatibility === null) {
      throw new SafeApplicationError("authentication_required", "Authentication is required.", 401);
    }
    return {
      absoluteExpiresAt: principal.absoluteExpiresAt,
      createdAt: principal.createdAt,
      id: principal.id,
      idleExpiresAt: principal.idleExpiresAt,
      lastSeenAt: principal.lastSeenAt,
      ownerId: compatibility.ownerId,
      recentAuthenticatedAt: principal.recentAuthenticatedAt,
      revokedAt: principal.revokedAt,
      tokenDigest: principal.tokenDigest,
      username:
        principal.username ?? principal.email ?? principal.fullName ?? compatibility.username,
      workspaceId: principal.workspaceId,
    };
  }

  public async logout(session: PrincipalSessionRecord | SessionRecord): Promise<void> {
    await this.store.revokeSession(session.id);
  }

  public async changePassword(input: {
    currentPassword: unknown;
    newPassword: unknown;
    newPasswordConfirmation: unknown;
    session: PrincipalSessionRecord;
  }): Promise<CreatedSession> {
    await this.consumeSensitiveAction(input.session.userId);
    const user = await this.store.getUserCredentialById(
      input.session.workspaceId,
      input.session.userId,
    );
    if (user === null) {
      throw new SafeApplicationError("authentication_required", "Authentication is required.", 401);
    }
    const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
    const currentMatches = await verifyPassword(user.passwordHash, currentPassword || "invalid");
    let newPassword: string;
    try {
      newPassword = validateNewPassword(
        input.newPassword,
        input.newPasswordConfirmation,
        currentPassword,
      );
    } catch {
      throw new SafeApplicationError(
        "validation_error",
        "The current password or new password requirements were not satisfied.",
        400,
      );
    }
    if (!currentMatches) {
      throw new SafeApplicationError(
        "validation_error",
        "The current password or new password requirements were not satisfied.",
        400,
      );
    }
    const newPasswordHash = await hashPassword(newPassword);
    const now = this.clock();
    const token = createToken();
    try {
      const record = await this.store.changeUserPassword({
        newPasswordHash,
        times: createSessionTimes(now),
        tokenDigest: digestSessionToken(token),
        user,
      });
      return {
        maxAgeSeconds: Math.floor(SESSION_ABSOLUTE_DURATION_MS / 1_000),
        record,
        token,
      };
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  public async revokeOthers(session: PrincipalSessionRecord): Promise<number> {
    await this.consumeSensitiveAction(session.userId);
    return this.store.revokeOtherUserSessions(session.userId, session.workspaceId, session.id);
  }

  public async consumeSensitiveAction(signal: string): Promise<void> {
    try {
      await this.rateLimits.consumeSensitive(digestRateLimitSignal(`sensitive:${signal}`));
    } catch (error) {
      throw new SafeApplicationError(
        "rate_limited",
        "Too many sensitive requests. Try again later.",
        429,
        (error as { retryAfterSeconds?: number }).retryAfterSeconds ?? 60,
      );
    }
  }

  public async bootstrap(input: {
    password: unknown;
    passwordConfirmation: unknown;
    username: unknown;
    workspaceDisplayName: unknown;
  }) {
    const identity = validateOwnerUsername(input.username);
    const password = validateNewPassword(input.password, input.passwordConfirmation);
    const displayName = String(input.workspaceDisplayName).trim();
    if (displayName.length < 1 || displayName.length > 100)
      throw new Error("Invalid workspace name.");
    return this.store.bootstrapOwner({
      ...identity,
      passwordHash: await hashPassword(password),
      workspaceDisplayName: displayName,
    });
  }

  public async recover(username: unknown, password: unknown, confirmation: unknown): Promise<void> {
    const identity = validateOwnerUsername(username);
    const nextPassword = validateNewPassword(password, confirmation);
    await this.store.recoverOwner(identity.normalizedUsername, await hashPassword(nextPassword));
  }
}

export const hashPublicSignal = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
