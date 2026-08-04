import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { systemMetadata } from "./schema.ts";
import { OpsWeaveStore, StoreConflictError, type SessionTimes } from "./store.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;

const assertIsolatedTestDatabase = (value: string | undefined): string => {
  if (value === undefined) throw new Error("TEST_DATABASE_URL is required.");
  const parsed = new URL(value);
  if (
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    parsed.pathname !== "/opsweave_test" ||
    parsed.port !== "55432"
  ) {
    throw new Error("Integration tests refuse to use a non-isolated database.");
  }
  return value;
};

describe("Phase 1 database and repositories", () => {
  const isolatedDatabaseUrl = assertIsolatedTestDatabase(databaseUrl);
  const pool = new Pool({ connectionString: isolatedDatabaseUrl, max: 4 });
  const database = createDatabase(pool);
  const store = new OpsWeaveStore(pool);

  beforeAll(async () => {
    await pool.query("DROP SCHEMA IF EXISTS opsweave CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await runMigrations(isolatedDatabaseUrl);
  });

  afterAll(async () => pool.end());

  it("builds every migration from zero and supports the foundation round trip", async () => {
    const tables = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='opsweave'",
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "owners",
        "owner_credentials",
        "sessions",
        "workspace_settings",
        "workspace_working_hours",
        "encrypted_provider_credentials",
        "projects",
        "tasks",
        "audit_events",
        "trash_records",
      ]),
    );
    await database.insert(systemMetadata).values({ key: "phase", value: { value: 1 } });
    expect(
      await database
        .select({ key: systemMetadata.key })
        .from(systemMetadata)
        .where(sql`${systemMetadata.key}=${"phase"}`),
    ).toEqual([{ key: "phase" }]);
  });

  it("bootstraps exactly one owner and rejects replay", async () => {
    const owner = await store.bootstrapOwner({
      normalizedUsername: "synthetic-owner",
      passwordHash: "$argon2id$synthetic-hash-never-used-for-verification",
      username: "Synthetic-Owner",
      workspaceDisplayName: "Synthetic workspace",
    });
    expect(owner.passwordHash).not.toContain("password");
    expect((await store.getWorkspaceConfiguration(owner.workspaceId)).workingDays).toHaveLength(7);
    await expect(
      store.bootstrapOwner({
        normalizedUsername: "second-owner",
        passwordHash: "synthetic-hash",
        username: "Second-Owner",
        workspaceDisplayName: "Second workspace",
      }),
    ).rejects.toBeInstanceOf(StoreConflictError);
  });

  it("persists, expires, and revokes only digested session tokens", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected bootstrapped owner.");
    const rawToken = "synthetic-session-token-not-for-storage";
    const tokenDigest = createHash("sha256").update(rawToken).digest("hex");
    const now = new Date("2026-08-04T12:00:00.000Z");
    const times: SessionTimes = {
      absoluteExpiresAt: new Date("2026-08-11T12:00:00.000Z"),
      createdAt: now,
      idleExpiresAt: new Date("2026-08-05T00:00:00.000Z"),
      lastSeenAt: now,
      recentAuthenticatedAt: now,
      revokedAt: null,
    };
    const session = await store.createSession(owner, tokenDigest, times);
    const serialized = JSON.stringify(await store.findSessionByDigest(tokenDigest));
    expect(serialized).not.toContain(rawToken);
    await store.revokeSession(session.id);
    expect((await store.findSessionByDigest(tokenDigest))?.revokedAt).toBeInstanceOf(Date);
  });

  it("enforces optimistic settings versions and database ranges", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected owner.");
    const current = await store.getWorkspaceConfiguration(owner.workspaceId);
    const version = await store.updateGeneral(owner.workspaceId, owner.ownerId, {
      ...current.general,
      displayName: "Updated synthetic workspace",
    });
    expect(version).toBe(current.general.version + 1);
    await expect(
      store.updateGeneral(owner.workspaceId, owner.ownerId, current.general),
    ).rejects.toBeInstanceOf(StoreConflictError);
    await expect(
      pool.query(
        `UPDATE opsweave.workspace_working_hours SET available_hours=25
         WHERE workspace_id=$1 AND weekday='monday'`,
        [owner.workspaceId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("stores provider credentials as ciphertext and redacts audit metadata", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected owner.");
    const plaintext = "synthetic-provider-secret-never-store";
    await store.saveCredential({
      envelope: {
        algorithm: "aes-256-gcm",
        authenticationTag: "synthetic-tag",
        ciphertext: Buffer.from("encrypted synthetic value").toString("base64"),
        envelopeVersion: 1,
        initializationVector: "synthetic-iv",
        keyVersion: 1,
      },
      ownerId: owner.ownerId,
      provider: "fake",
      workspaceId: owner.workspaceId,
    });
    expect(JSON.stringify(await store.credentialEnvelope(owner.workspaceId, "fake"))).not.toContain(
      plaintext,
    );
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='opsweave' AND table_name='encrypted_provider_credentials'`,
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain("plaintext");
    expect(JSON.stringify(await store.listAuditMetadata(owner.workspaceId))).not.toContain(
      plaintext,
    );
    await store.removeCredential(owner.workspaceId, owner.ownerId, "fake");
    expect((await store.credentialStatus(owner.workspaceId, "fake")).configured).toBe(false);
  });

  it("recovers credentials, revokes sessions, and preserves operational data", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected owner.");
    await pool.query(
      "INSERT INTO opsweave.projects (workspace_id,name) VALUES ($1,'Preserved project')",
      [owner.workspaceId],
    );
    await store.recoverOwner("synthetic-owner", "$argon2id$replacement-synthetic-hash");
    expect(
      Number(
        (
          await pool.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM opsweave.projects",
          )
        ).rows[0]?.count,
      ),
    ).toBe(1);
    expect((await store.getOnlyOwnerCredential())?.credentialVersion).toBeGreaterThan(1);
  });
});
