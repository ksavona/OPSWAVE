import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_ATTACHMENT_BYTES,
  readAttachmentFile,
  readAttachmentTextContext,
  removeAttachmentFile,
  saveAttachmentFile,
} from "./attachment-storage";

describe("attachment storage", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "opsweave-attachments-"));
    vi.stubEnv("ATTACHMENT_STORAGE_PATH", root);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { force: true, recursive: true });
  });

  it("stores, reads, extracts, truncates, and removes attachment content", async () => {
    const textKey = await saveAttachmentFile(
      new File(["complete context"], "context.md", { type: "text/markdown" }),
    );
    expect((await readAttachmentFile(textKey)).toString("utf8")).toBe("complete context");
    await expect(
      readAttachmentTextContext({
        byteSize: 16,
        contentType: "application/octet-stream",
        originalName: "context.md",
        storageKey: textKey,
      }),
    ).resolves.toEqual({ content: "complete context", contentStatus: "Complete text included." });

    const largeText = "x".repeat(45_000);
    const largeKey = await saveAttachmentFile(
      new File([largeText], "large.txt", { type: "text/plain" }),
    );
    const truncated = await readAttachmentTextContext({
      byteSize: largeText.length,
      contentType: "text/plain",
      originalName: "large.txt",
      storageKey: largeKey,
    });
    expect(truncated.content).toHaveLength(40_000);
    expect(truncated.contentStatus).toContain("truncated");

    await removeAttachmentFile(textKey);
    await expect(readAttachmentFile(textKey)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(removeAttachmentFile(textKey)).resolves.toBeUndefined();
  });

  it("reports unsupported, missing, invalid, empty, and oversized files safely", async () => {
    const binary = await readAttachmentTextContext({
      byteSize: 3,
      contentType: "application/pdf",
      originalName: "document.pdf",
      storageKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(binary.content).toBeNull();
    expect(binary.contentStatus).toContain("Binary");
    const missing = await readAttachmentTextContext({
      byteSize: 3,
      contentType: "text/plain",
      originalName: "missing.txt",
      storageKey: "22222222-2222-4222-8222-222222222222",
    });
    expect(missing.content).toBeNull();
    expect(missing.contentStatus).toContain("unavailable");
    expect(() => readAttachmentFile("unsafe-key")).toThrow("Invalid attachment storage key");
    const directoryKey = "33333333-3333-4333-8333-333333333333";
    // The test root is a fresh OS temporary directory and the key is a fixed UUID.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(path.join(root, directoryKey));
    await expect(removeAttachmentFile(directoryKey)).rejects.toMatchObject({ code: "EISDIR" });
    await expect(saveAttachmentFile(new File([], "empty.txt"))).rejects.toThrow(
      "between 1 byte and 25 MB",
    );
    await expect(saveAttachmentFile({ size: MAX_ATTACHMENT_BYTES + 1 } as File)).rejects.toThrow(
      "between 1 byte and 25 MB",
    );
  });
});
