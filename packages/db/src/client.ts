import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export const createDatabasePool = (databaseUrl: string): Pool =>
  new Pool({
    application_name: "opsweave",
    connectionString: databaseUrl,
    max: 10,
  });

export const createDatabase = (pool: Pool) => drizzle(pool, { schema });

export type OpsWeaveDatabase = ReturnType<typeof createDatabase>;
