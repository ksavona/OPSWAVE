import { createWorkerLogger } from "./logger.ts";
import { getWorkerStatus } from "./status.ts";

const logger = createWorkerLogger();

logger.info(getWorkerStatus(), "Worker scaffold initialized; no live jobs are registered.");
