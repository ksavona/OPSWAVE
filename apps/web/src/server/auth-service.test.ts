import { hashPassword, type SessionTimes } from "@opsweave/domain";
import type {
  OpsWeaveStore,
  OwnerCredentialRecord,
  PrincipalSessionRecord,
  SessionRecord,
  UserCredentialRecord,
} from "@opsweave/db";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth-service";
import type { RateLimitGate } from "./rate-limits";
import { digestSessionToken } from "./request-security";

const TEST_PARAMETERS = { memoryCost: 1_024, outputLen: 32, parallelism: 1, timeCost: 1 };
const now = new Date("2026-08-04T12:00:00.000Z");
let owner: OwnerCredentialRecord;

beforeAll(async () => {
  owner = {
    credentialVersion: 1,
    normalizedUsername: "synthetic-owner",
    ownerId: "00000000-0000-4000-8000-000000000001",
    passwordChangedAt: now,
    passwordHash: await hashPassword("synthetic owner password", TEST_PARAMETERS),
    username: "Synthetic-Owner",
    workspaceId: "00000000-0000-4000-8000-000000000002",
  };
});

const activeSession = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  absoluteExpiresAt: new Date("2026-08-11T12:00:00.000Z"),
  createdAt: now,
  id: "00000000-0000-4000-8000-000000000003",
  idleExpiresAt: new Date("2026-08-05T00:00:00.000Z"),
  lastSeenAt: now,
  ownerId: owner.ownerId,
  recentAuthenticatedAt: now,
  revokedAt: null,
  tokenDigest: digestSessionToken("synthetic-session-token-long-enough-for-validation"),
  username: owner.username,
  workspaceId: owner.workspaceId,
  ...overrides,
});

const userCredential = (): UserCredentialRecord => ({
  authorizationVersion: 1,
  credentialVersion: owner.credentialVersion,
  email: null,
  fullName: "Synthetic Owner",
  membershipAuthorizationVersion: 1,
  membershipId: "00000000-0000-4000-8000-000000000004",
  membershipStatus: "active",
  normalizedEmail: null,
  normalizedUsername: owner.normalizedUsername,
  ownerId: owner.ownerId,
  passwordChangedAt: owner.passwordChangedAt,
  passwordHash: owner.passwordHash,
  role: "owner",
  userId: "00000000-0000-4000-8000-000000000005",
  userStatus: "active",
  username: owner.username,
  workspaceId: owner.workspaceId,
});

const principalSession = (
  session: SessionRecord,
  overrides: Partial<PrincipalSessionRecord> = {},
): PrincipalSessionRecord => ({
  ...session,
  authorizationVersion: 1,
  email: null,
  fullName: "Synthetic Owner",
  membershipAuthorizationVersion: 1,
  membershipId: "00000000-0000-4000-8000-000000000004",
  membershipStatus: "active",
  role: "owner",
  userId: "00000000-0000-4000-8000-000000000005",
  userStatus: "active",
  ...overrides,
});

const createHarness = () => {
  let session = activeSession();
  const consumeAccount = vi.fn(async () => undefined);
  const store = {
    changeUserPassword: vi.fn(async (input: { times: SessionTimes; tokenDigest: string }) => {
      session = activeSession({ ...input.times, tokenDigest: input.tokenDigest });
      return principalSession(session);
    }),
    createPrincipalSession: vi.fn(async (_owner, tokenDigest: string, times: SessionTimes) => {
      session = activeSession({ ...times, tokenDigest });
      return principalSession(session);
    }),
    findUserForLogin: vi.fn(async (normalized: string) =>
      normalized === owner.normalizedUsername ? userCredential() : null,
    ),
    findPrincipalSessionByDigest: vi.fn(async (digest: string) =>
      digest === session.tokenDigest ? principalSession(session) : null,
    ),
    getUserCredentialById: vi.fn(async () => userCredential()),
    getOnlyOwnerCredential: vi.fn(async () => owner),
    getOnlyUserCredential: vi.fn(async () => userCredential()),
    getWorkspaceOwnerCompatibility: vi.fn(async () => ({
      ownerId: owner.ownerId,
      username: owner.username,
    })),
    recordLoginAttempt: vi.fn(async () => undefined),
    revokeOtherUserSessions: vi.fn(async () => 2),
    revokeSession: vi.fn(async () => undefined),
    touchSession: vi.fn(async () => undefined),
  };
  const rates: RateLimitGate = {
    consumeAccount,
    consumeNetwork: vi.fn(async () => undefined),
    consumeSensitive: vi.fn(async () => undefined),
    resetAccount: vi.fn(async () => undefined),
  };
  return {
    consumeAccount,
    rates,
    service: new AuthService(store as unknown as OpsWeaveStore, rates, () => now),
    store,
  };
};

describe("AuthService", () => {
  it("creates a new opaque session for valid normalized credentials", async () => {
    const { service, store } = createHarness();
    const result = await service.login(" SYNTHETIC-OWNER ", "synthetic owner password", "client");
    expect(result.token).toHaveLength(43);
    expect(store.createPrincipalSession).toHaveBeenCalledOnce();
    expect(store.recordLoginAttempt).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      "succeeded",
    );
  });

  it("uses the same generic response for wrong and nonexistent credentials", async () => {
    const results = await Promise.allSettled([
      createHarness().service.login("synthetic-owner", "wrong password", "client"),
      createHarness().service.login("nonexistent-owner", "wrong password", "client"),
    ]);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        const reason: unknown = result.reason;
        expect(reason).toMatchObject({ code: "invalid_credentials", status: 401 });
        expect(reason).toBeInstanceOf(Error);
        if (!(reason instanceof Error)) throw new Error("Expected a rejected Error.");
        expect(reason.message).toContain("username or password is invalid");
      }
    }
  });

  it("returns bounded retry metadata when a login limiter rejects", async () => {
    const harness = createHarness();
    harness.consumeAccount.mockRejectedValueOnce({ retryAfterSeconds: 42 });
    await expect(
      harness.service.login("synthetic-owner", "synthetic owner password", "client"),
    ).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 42, status: 429 });
  });

  it("accepts active sessions and rejects unknown, revoked, and expired tokens", async () => {
    const harness = createHarness();
    const login = await harness.service.login(
      "synthetic-owner",
      "synthetic owner password",
      "client",
    );
    await expect(harness.service.authenticateToken(login.token)).resolves.toMatchObject({
      ownerId: owner.ownerId,
    });
    harness.store.findPrincipalSessionByDigest.mockResolvedValueOnce(
      principalSession(activeSession(), {
        email: "admin@example.test",
        ownerId: null,
        role: "admin",
        username: null,
      }),
    );
    await expect(harness.service.authenticateToken(login.token)).resolves.toMatchObject({
      ownerId: owner.ownerId,
      username: "admin@example.test",
    });
    await expect(harness.service.authenticateToken(null)).rejects.toMatchObject({ status: 401 });
    harness.store.findPrincipalSessionByDigest.mockResolvedValueOnce(
      principalSession(activeSession({ revokedAt: now })),
    );
    await expect(harness.service.authenticateToken(login.token)).rejects.toMatchObject({
      status: 401,
    });
    harness.store.findPrincipalSessionByDigest.mockResolvedValueOnce(
      principalSession(activeSession({ idleExpiresAt: now })),
    );
    await expect(harness.service.authenticateToken(login.token)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("requires the current password, rotates the current session, and revokes others", async () => {
    const harness = createHarness();
    const session = principalSession(activeSession());
    await expect(
      harness.service.changePassword({
        currentPassword: "wrong password",
        newPassword: "new synthetic password",
        newPasswordConfirmation: "new synthetic password",
        session,
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    const changed = await harness.service.changePassword({
      currentPassword: "synthetic owner password",
      newPassword: "new synthetic password",
      newPasswordConfirmation: "new synthetic password",
      session,
    });
    expect(changed.token).not.toBe("");
    expect(harness.store.changeUserPassword).toHaveBeenCalledOnce();
    await expect(harness.service.revokeOthers(session)).resolves.toBe(2);
  });
});
