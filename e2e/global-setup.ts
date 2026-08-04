import { hashPassword } from "@opsweave/domain";
import { createDatabasePool, OpsWeaveStore } from "@opsweave/db";
import { runMigrations } from "../packages/db/src/migrate.ts";

const isolatedDatabaseUrl = process.env.TEST_DATABASE_URL;

export default async function globalSetup(): Promise<void> {
  if (isolatedDatabaseUrl === undefined) throw new Error("TEST_DATABASE_URL is required.");
  const parsed = new URL(isolatedDatabaseUrl);
  if (
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    parsed.pathname !== "/opsweave_test" ||
    parsed.port !== "55432"
  ) {
    throw new Error("Browser setup refuses to use a non-isolated database.");
  }

  const pool = createDatabasePool(isolatedDatabaseUrl);
  await pool.query("DROP SCHEMA IF EXISTS opsweave CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.end();
  await runMigrations(isolatedDatabaseUrl);

  const store = new OpsWeaveStore(createDatabasePool(isolatedDatabaseUrl));
  try {
    await store.bootstrapOwner({
      normalizedUsername: "synthetic-owner",
      passwordHash: await hashPassword("synthetic owner password"),
      username: "Synthetic-Owner",
      workspaceDisplayName: "Synthetic workspace",
    });
  } finally {
    await store.pool.end();
  }
}
