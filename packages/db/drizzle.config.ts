import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://opsweave:opsweave-local-only@127.0.0.1:5432/opsweave";

export default defineConfig({
  dbCredentials: {
    url: databaseUrl,
  },
  dialect: "postgresql",
  migrations: {
    prefix: "timestamp",
  },
  out: "./packages/db/drizzle",
  schema: "./packages/db/src/schema.ts",
  strict: true,
  verbose: true,
});
