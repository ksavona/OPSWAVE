import pino, { type DestinationStream, type Logger } from "pino";

const REDACTION_PATHS = [
  "apiKey",
  "authorization",
  "credential",
  "password",
  "passwordHash",
  "req.headers.authorization",
  "sessionToken",
  "token",
];

export const createWorkerLogger = (destination?: DestinationStream): Logger =>
  pino(
    {
      base: {
        service: "opsweave-worker",
      },
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        censor: "[REDACTED]",
        paths: REDACTION_PATHS,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
