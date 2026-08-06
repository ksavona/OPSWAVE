import { createDatabasePool, OpsWeaveStore } from "@opsweave/db";

import { processOneIntakeJob } from "./intake-job.ts";
import { createWorkerLogger } from "./logger.ts";
import { getWorkerStatus } from "./status.ts";

const logger = createWorkerLogger();

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  logger.info(getWorkerStatus(), "Worker ready; DATABASE_URL is required to process intake jobs.");
} else {
  const store = new OpsWeaveStore(createDatabasePool(databaseUrl));
  const run = async () => {
    while (await processOneIntakeJob(store, logger)) {
      // Drain the durable queue before the next polling interval.
    }
  };
  await run();
  setInterval(() => {
    void run().catch((error: unknown) => {
      logger.error({ err: error }, "worker poll failed");
    });
  }, 2_000);
  logger.info(getWorkerStatus(), "Worker is polling durable intake jobs.");
}
