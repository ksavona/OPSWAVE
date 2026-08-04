import { fileURLToPath, pathToFileURL } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabasePool } from "./client.ts";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export const runMigrations = async (databaseUrl: string): Promise<void> => {
  const pool = createDatabasePool(databaseUrl);

  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
};

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  await runMigrations(databaseUrl);
}
