import { createDatabasePool, OpsWeaveStore } from "@opsweave/db";
import pino from "pino";

const globalRuntime = globalThis as typeof globalThis & {
  opsWeaveStore?: OpsWeaveStore;
};

export const logger = pino({
  base: { service: "opsweave-web" },
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    censor: "[REDACTED]",
    paths: [
      "apiKey",
      "authorization",
      "credential",
      "password",
      "passwordHash",
      "req.headers.authorization",
      "sessionToken",
      "token",
    ],
  },
});

export const getStore = (): OpsWeaveStore => {
  if (globalRuntime.opsWeaveStore !== undefined) return globalRuntime.opsWeaveStore;
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required at runtime.");
  }
  globalRuntime.opsWeaveStore = new OpsWeaveStore(createDatabasePool(databaseUrl));
  return globalRuntime.opsWeaveStore;
};
