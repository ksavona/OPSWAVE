import type { AiProvider } from "@opsweave/ai";
import type { CollaborationStore } from "@opsweave/db";
import type { Logger } from "pino";

export const processOneComplianceJob = async (
  store: CollaborationStore,
  provider: AiProvider,
  logger: Logger,
  model = process.env.OPENAI_DEFAULT_MODEL ?? "gpt-5.6",
): Promise<boolean> => {
  const job = await store.claimComplianceJob();
  if (job === null) return false;
  try {
    if (provider.assessCompliance === undefined)
      throw new Error("The configured provider does not support compliance review.");
    const result = await provider.assessCompliance({
      content: job.content,
      contentKind: job.contentKind,
      neutralSubjectLabel: job.neutralSubjectLabel,
    });
    await store.completeComplianceJob({
      categories: result.categories,
      flagged: result.flagged,
      job,
      model,
      provider: result.provider,
      reason: result.reason,
      riskLevel: result.riskLevel,
    });
    logger.info({ flagged: result.flagged, jobId: job.id }, "compliance job completed");
  } catch (error) {
    await store.failComplianceJob(job.id, "Compliance review was temporarily unavailable.");
    logger.warn({ err: error, jobId: job.id }, "compliance job will be retried safely");
  }
  return true;
};
