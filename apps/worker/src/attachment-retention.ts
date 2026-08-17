import { unlink } from "node:fs/promises";
import path from "node:path";

import type { OpsWeaveStore } from "@opsweave/db";

const storageRoot = (): string =>
  process.env.ATTACHMENT_STORAGE_PATH ?? path.join(process.cwd(), "storage", "attachments");

export const purgeExpiredAttachments = async (
  store: OpsWeaveStore,
  logger: {
    error: (value: unknown, message: string) => void;
    info: (value: unknown, message: string) => void;
  },
  now = new Date(),
): Promise<number> => {
  const expired = await store.listExpiredAttachments(now);
  let purged = 0;
  for (const attachment of expired) {
    if (!/^[0-9a-f-]{36}$/u.test(attachment.storageKey)) {
      logger.error({ attachmentId: attachment.id }, "invalid attachment storage key skipped");
      continue;
    }
    try {
      // The root is operator-controlled and storage keys are validated UUIDs.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await unlink(path.join(storageRoot(), attachment.storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.error({ attachmentId: attachment.id, err: error }, "attachment purge failed");
        continue;
      }
    }
    if (await store.deleteExpiredAttachmentRecord(attachment.id, now)) purged += 1;
  }
  if (purged > 0) logger.info({ purged }, "expired attachments purged");
  return purged;
};
