import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { input, password } from "@inquirer/prompts";
import {
  hashPassword,
  validateNewPassword,
  validateOwnerUsername,
} from "../packages/domain/src/index.ts";
import { createDatabasePool } from "../packages/db/src/client.ts";
import { OpsWeaveStore } from "../packages/db/src/store.ts";

if (existsSync(".env")) loadEnvFile(".env");
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0)
  throw new Error("DATABASE_URL is required.");

const store = new OpsWeaveStore(createDatabasePool(databaseUrl));
try {
  const username = validateOwnerUsername(await input({ message: "Existing owner username:" }));
  const nextPassword = await password({ mask: "*", message: "Replacement password:" });
  const confirmation = await password({ mask: "*", message: "Confirm replacement password:" });
  await store.recoverOwner(
    username.normalizedUsername,
    await hashPassword(validateNewPassword(nextPassword, confirmation)),
  );
  process.stdout.write(
    "Owner credentials replaced and every session revoked. Operational data was preserved.\n",
  );
} finally {
  await store.pool.end();
}
