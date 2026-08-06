import { DeterministicFakeAiProvider, type AiProvider } from "@opsweave/ai";
import { INTAKE_SCHEMA_VERSION, intakeDraftSchema } from "@opsweave/domain";
import type { OpsWeaveStore } from "@opsweave/db";
import type { Logger } from "pino";

/** Processes one durable intake run. Source text remains inside this trusted worker boundary. */
export const processOneIntakeJob = async (
  store: OpsWeaveStore,
  logger: Logger,
  provider: AiProvider = new DeterministicFakeAiProvider(),
): Promise<boolean> => {
  const run = await store.nextQueuedIntakeRun();
  if (run === null) return false;
  try {
    const result = await provider.extract({
      content: run.content,
      schemaVersion: INTAKE_SCHEMA_VERSION,
    });
    await store.completeIntakeRun(run.id, intakeDraftSchema.parse(result.draft));
    logger.info({ provider: result.provider, runId: run.id }, "intake extraction completed");
  } catch (error) {
    await store.failIntakeRun(
      run.id,
      "Extraction could not be completed. Retry the intake request.",
    );
    logger.warn({ err: error, runId: run.id }, "intake extraction failed safely");
  }
  return true;
};
