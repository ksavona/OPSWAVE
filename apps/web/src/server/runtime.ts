import { CollaborationStore, createDatabasePool, OpsWeaveStore } from "@opsweave/db";
import pino from "pino";

const globalRuntime = globalThis as typeof globalThis & {
  opsWeaveStore?: OpsWeaveStore;
  opsWeaveCollaborationStore?: CollaborationStore;
  opsWeavePool?: ReturnType<typeof createDatabasePool>;
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
  globalRuntime.opsWeavePool ??= createDatabasePool(databaseUrl);
  globalRuntime.opsWeaveStore = new OpsWeaveStore(globalRuntime.opsWeavePool);
  return globalRuntime.opsWeaveStore;
};

export const getCollaborationStore = (): CollaborationStore => {
  if (globalRuntime.opsWeaveCollaborationStore !== undefined)
    return globalRuntime.opsWeaveCollaborationStore;
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required at runtime.");
  }
  globalRuntime.opsWeavePool ??= createDatabasePool(databaseUrl);
  globalRuntime.opsWeaveCollaborationStore = new CollaborationStore(globalRuntime.opsWeavePool);
  return globalRuntime.opsWeaveCollaborationStore;
};
