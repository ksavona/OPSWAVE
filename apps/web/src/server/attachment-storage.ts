import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_LLM_ATTACHMENT_TEXT_BYTES = 40_000;

interface AttachmentTextSource {
  readonly byteSize: number;
  readonly contentType: string;
  readonly originalName: string;
  readonly storageKey: string;
}

const storageRoot = (): string =>
  process.env.ATTACHMENT_STORAGE_PATH ?? path.join(process.cwd(), "storage", "attachments");

const storagePath = (storageKey: string): string => {
  if (!/^[0-9a-f-]{36}$/u.test(storageKey)) throw new Error("Invalid attachment storage key.");
  return path.join(/* turbopackIgnore: true */ storageRoot(), storageKey);
};

export const saveAttachmentFile = async (file: File): Promise<string> => {
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES)
    throw new Error("Attachments must be between 1 byte and 25 MB.");
  const key = randomUUID();
  // The root is operator-controlled and the key is a generated UUID.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await mkdir(storageRoot(), { recursive: true, mode: 0o700 });
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await writeFile(storagePath(key), new Uint8Array(await file.arrayBuffer()), {
    flag: "wx",
    mode: 0o600,
  });
  return key;
};

export const readAttachmentFile = (storageKey: string): Promise<Buffer> =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  readFile(/* turbopackIgnore: true */ storagePath(storageKey));

const textualExtension =
  /\.(?:csv|htm|html|json|log|md|markdown|sql|text|toml|ts|tsx|txt|xml|ya?ml)$/iu;

export const readAttachmentTextContext = async (
  attachment: AttachmentTextSource,
): Promise<{ content: string | null; contentStatus: string }> => {
  const isText =
    attachment.contentType.startsWith("text/") ||
    /(?:json|javascript|sql|toml|xml|yaml)/iu.test(attachment.contentType) ||
    textualExtension.test(attachment.originalName);
  if (!isText)
    return {
      content: null,
      contentStatus: "Binary document metadata is available; no safe text extraction is available.",
    };
  try {
    const bytes = await readAttachmentFile(attachment.storageKey);
    const bounded = bytes.subarray(0, MAX_LLM_ATTACHMENT_TEXT_BYTES).toString("utf8");
    return {
      content: bounded,
      contentStatus:
        attachment.byteSize > MAX_LLM_ATTACHMENT_TEXT_BYTES
          ? `Text truncated after ${String(MAX_LLM_ATTACHMENT_TEXT_BYTES)} bytes.`
          : "Complete text included.",
    };
  } catch {
    return { content: null, contentStatus: "Document content is currently unavailable." };
  }
};

export const removeAttachmentFile = async (storageKey: string): Promise<void> => {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await unlink(storagePath(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};
