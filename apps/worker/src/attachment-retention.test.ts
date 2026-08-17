import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { OpsWeaveStore } from "@opsweave/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { purgeExpiredAttachments } from "./attachment-retention.ts";

describe("attachment retention", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "opsweave-retention-"));
    vi.stubEnv("ATTACHMENT_STORAGE_PATH", root);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { force: true, recursive: true });
  });

  it("purges expired files, tolerates missing files, and skips invalid keys", async () => {
    const storedKey = "11111111-1111-4111-8111-111111111111";
    const missingKey = "22222222-2222-4222-8222-222222222222";
    // The test root is a fresh OS temporary directory and the key is a fixed UUID.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(path.join(root, storedKey), "expired");
    const deleteExpiredAttachmentRecord = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const store = {
      deleteExpiredAttachmentRecord,
      listExpiredAttachments: vi.fn().mockResolvedValue([
        { id: "stored", storageKey: storedKey },
        { id: "missing", storageKey: missingKey },
        { id: "invalid", storageKey: "../unsafe" },
      ]),
    } as unknown as OpsWeaveStore;
    const logger = { error: vi.fn(), info: vi.fn() };
    const now = new Date("2026-08-17T07:00:00.000Z");

    await expect(purgeExpiredAttachments(store, logger, now)).resolves.toBe(1);
    // The test root is a fresh OS temporary directory and the key is a fixed UUID.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await expect(readFile(path.join(root, storedKey))).rejects.toMatchObject({ code: "ENOENT" });
    expect(deleteExpiredAttachmentRecord).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      { attachmentId: "invalid" },
      "invalid attachment storage key skipped",
    );
    expect(logger.info).toHaveBeenCalledWith({ purged: 1 }, "expired attachments purged");
  });

  it("keeps the record when file deletion fails and stays quiet when nothing is purged", async () => {
    const directoryKey = "33333333-3333-4333-8333-333333333333";
    // The test root is a fresh OS temporary directory and the key is a fixed UUID.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(path.join(root, directoryKey));
    const deleteExpiredAttachmentRecord = vi.fn();
    const store = {
      deleteExpiredAttachmentRecord,
      listExpiredAttachments: vi
        .fn()
        .mockResolvedValue([{ id: "directory", storageKey: directoryKey }]),
    } as unknown as OpsWeaveStore;
    const logger = { error: vi.fn(), info: vi.fn() };

    await expect(purgeExpiredAttachments(store, logger)).resolves.toBe(0);
    expect(deleteExpiredAttachmentRecord).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentId: "directory" }),
      "attachment purge failed",
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});
