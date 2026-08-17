import { DeterministicFakeAiProvider, OpenAiProvider } from "@opsweave/ai";
import { createDatabasePool, OpsWeaveStore } from "@opsweave/db";

import { processOneIntakeJob } from "./intake-job.ts";
import { purgeExpiredIntakeTrash } from "./intake-trash.ts";
import { runScheduledAutomations } from "./automation-scheduler.ts";
import { createWorkerLogger } from "./logger.ts";
import { getWorkerStatus } from "./status.ts";
import { purgeExpiredAttachments } from "./attachment-retention.ts";

const logger = createWorkerLogger();
const apiKey = process.env.OPENAI_API_KEY;
const provider =
  apiKey === undefined || apiKey.length === 0
    ? new DeterministicFakeAiProvider()
    : new OpenAiProvider({
        apiKey,
        model: process.env.OPENAI_DEFAULT_MODEL ?? "gpt-5.6",
      });
const workerStatus = getWorkerStatus(provider.name);

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  logger.info(workerStatus, "Worker ready; DATABASE_URL is required to process intake jobs.");
} else {
  const store = new OpsWeaveStore(createDatabasePool(databaseUrl));
  const drainIntake = async () => {
    while (await processOneIntakeJob(store, logger, provider)) {
      // Drain the durable queue before the next polling interval.
    }
  };
  let intakePollRunning = false;
  let automationPollRunning = false;
  const pollIntake = async () => {
    if (intakePollRunning) return;
    intakePollRunning = true;
    try {
      await drainIntake();
    } finally {
      intakePollRunning = false;
    }
  };
  const pollAutomations = async () => {
    if (automationPollRunning) return;
    automationPollRunning = true;
    try {
      await runScheduledAutomations(store, provider, logger);
    } finally {
      automationPollRunning = false;
    }
  };
  const recoveredCount = await store.recoverStaleIntakeRuns(new Date(Date.now() - 60 * 60 * 1_000));
  if (recoveredCount > 0)
    logger.warn({ recoveredCount }, "stale intake runs returned to the durable queue");
  await pollIntake();
  await pollAutomations();
  await purgeExpiredIntakeTrash(store, logger);
  await purgeExpiredAttachments(store, logger);
  setInterval(() => {
    void pollIntake().catch((error: unknown) => {
      logger.error({ err: error }, "worker poll failed");
    });
  }, 2_000);
  setInterval(
    () => {
      void purgeExpiredIntakeTrash(store, logger).catch((error: unknown) => {
        logger.error({ err: error }, "intake trash purge failed");
      });
    },
    24 * 60 * 60 * 1_000,
  );
  setInterval(
    () => {
      void purgeExpiredAttachments(store, logger).catch((error: unknown) => {
        logger.error({ err: error }, "attachment retention purge failed");
      });
    },
    24 * 60 * 60 * 1_000,
  );
  setInterval(() => {
    void pollAutomations().catch((error: unknown) => {
      logger.error({ err: error }, "automation poll failed");
    });
  }, 30_000);
  logger.info(workerStatus, "Worker is polling durable intake jobs and planning automations.");
}
