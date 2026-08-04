import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "./client.js";
import { runMigrations } from "./migrate.js";
import { systemMetadata } from "./schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

const assertIsolatedTestDatabase = (value: string | undefined): string => {
  if (value === undefined) {
    throw new Error("TEST_DATABASE_URL is required for migration integration tests.");
  }

  const parsed = new URL(value);
  const isLoopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  const isExpectedDatabase = parsed.pathname === "/opsweave_test";
  const isExpectedPort = parsed.port === "55432";

  if (!isLoopback || !isExpectedDatabase || !isExpectedPort) {
    throw new Error("Integration tests refuse to use a non-isolated database.");
  }

  return value;
};

describe("database migrations", () => {
  const isolatedDatabaseUrl = assertIsolatedTestDatabase(databaseUrl);
  const pool = new Pool({ connectionString: isolatedDatabaseUrl, max: 2 });
  const database = createDatabase(pool);

  beforeAll(async () => {
    await pool.query("DROP SCHEMA IF EXISTS opsweave CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await runMigrations(isolatedDatabaseUrl);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("builds the foundation schema from zero and supports a round trip", async () => {
    const tableResult = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'opsweave'",
    );

    expect(tableResult.rows.map((row) => row.table_name)).toContain("system_metadata");

    await database.insert(systemMetadata).values({
      key: "foundation",
      value: { phase: 0, status: "validated" },
    });

    const rows = await database
      .select({ key: systemMetadata.key, value: systemMetadata.value })
      .from(systemMetadata)
      .where(sql`${systemMetadata.key} = ${"foundation"}`);

    expect(rows).toEqual([
      {
        key: "foundation",
        value: { phase: 0, status: "validated" },
      },
    ]);
  });
});
