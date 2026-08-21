import type { OpsWeaveStore } from "@opsweave/db";
import type { Logger } from "pino";

/** Idempotently removes intake sources whose owner-declined drafts passed retention. */
export const purgeExpiredIntakeTrash = async (
  store: OpsWeaveStore,
  logger: Logger,
  now = new Date(),
): Promise<number> => {
  const purgedCount = await store.purgeExpiredIntakeDrafts(now);
  if (purgedCount > 0) logger.info({ purgedCount }, "expired intake trash purged");
  return purgedCount;
};
