import { createWorkerLogger } from "./logger.js";
import { getWorkerStatus } from "./status.js";

const logger = createWorkerLogger();

logger.info(getWorkerStatus(), "Worker scaffold initialized; no live jobs are registered.");
