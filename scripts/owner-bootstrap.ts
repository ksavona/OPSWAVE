import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { input, password } from "@inquirer/prompts";
import {
  hashPassword,
  validateNewPassword,
  validateOwnerUsername,
} from "../packages/domain/src/index.ts";
import { createDatabasePool } from "../packages/db/src/client.ts";
import { runMigrations } from "../packages/db/src/migrate.ts";
import { OpsWeaveStore } from "../packages/db/src/store.ts";

if (existsSync(".env")) loadEnvFile(".env");
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0)
  throw new Error("DATABASE_URL is required.");

await runMigrations(databaseUrl);
const store = new OpsWeaveStore(createDatabasePool(databaseUrl));
try {
  if (await store.ownerExists()) throw new Error("Owner setup has already been completed.");
  const username = validateOwnerUsername(await input({ message: "Owner username:" }));
  const workspaceDisplayName = await input({
    default: "My OpsWeave workspace",
    message: "Workspace display name:",
  });
  const nextPassword = await password({
    mask: "*",
    message: "Owner password (minimum 12 characters):",
  });
  const confirmation = await password({ mask: "*", message: "Confirm owner password:" });
  const validatedPassword = validateNewPassword(nextPassword, confirmation);
  await store.bootstrapOwner({
    ...username,
    passwordHash: await hashPassword(validatedPassword),
    workspaceDisplayName: workspaceDisplayName.trim(),
  });
  process.stdout.write("Owner setup completed. No password was printed or stored in plaintext.\n");
} finally {
  await store.pool.end();
}
