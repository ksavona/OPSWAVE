import { createHash } from "node:crypto";

import {
  ATTACHMENT_VISIBILITIES,
  SafeApplicationError,
  entityIdSchema,
  safeErrorResponse,
} from "@opsweave/domain";

import { DocumentService } from "./document-service";
import { readAttachmentFile, removeAttachmentFile, saveAttachmentFile } from "./attachment-storage";
import { requirePrincipal } from "./collaboration-handlers";
import { assertSameOrigin } from "./request-security";
import { getCollaborationStore, logger } from "./runtime";
import { scanAttachmentUpload } from "./malware-scanner";

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const submittedText = (value: FormDataEntryValue | null, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const json = (value: unknown, status = 200) => Response.json(value, { status });

const run = async (operation: () => Promise<Response>): Promise<Response> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return json({ error: "validation_error", message: "Review the submitted values." }, 400);
    }
    const safe = safeErrorResponse(error);
    if (safe.status === 500) logger.error({ err: error }, "document request failed safely");
    return json(safe.body, safe.status);
  }
};

const selectedUserIds = (value: FormDataEntryValue | null): string[] => {
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.map((candidate) => entityIdSchema.parse(candidate));
  } catch {
    throw new SafeApplicationError("validation_error", "The document audience is invalid.", 400);
  }
};

export const collaborationDocumentsHandler = (
  request: Request,
  subjectTypeValue: string,
  subjectIdValue: string,
) =>
  run(async () => {
    const session = await requirePrincipal(request);
    if (subjectTypeValue !== "project" && subjectTypeValue !== "task") {
      throw new SafeApplicationError("validation_error", "The subject type is invalid.", 400);
    }
    const subjectId = entityIdSchema.parse(subjectIdValue);
    const service = new DocumentService(getCollaborationStore());
    if (request.method === "GET") {
      const [attachments, uploadAllowed] = await Promise.all([
        service.list(session, subjectTypeValue, subjectId),
        service.uploadAllowed(session, subjectTypeValue, subjectId),
      ]);
      return json({ attachments, uploadAllowed });
    }
    assertSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_ATTACHMENT_BYTES + 1_000_000) {
      throw new SafeApplicationError("validation_error", "The document is larger than 25 MB.", 413);
    }
    const submitted = await request.formData();
    const file = submitted.get("file");
    if (!(file instanceof File) || file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
      throw new SafeApplicationError(
        "validation_error",
        "Documents must be between 1 byte and 25 MB.",
        413,
      );
    }
    const prepared = await service.prepareUpload(session, subjectTypeValue, subjectId);
    await scanAttachmentUpload(file, session.role === "delegate");
    const rawVisibility = submittedText(
      submitted.get("visibility"),
      session.role === "delegate" ? "shared_all_delegates" : "internal_only",
    );
    if (!ATTACHMENT_VISIBILITIES.includes(rawVisibility as never)) {
      throw new SafeApplicationError(
        "validation_error",
        "The document visibility is invalid.",
        400,
      );
    }
    const visibility = rawVisibility as (typeof ATTACHMENT_VISIBILITIES)[number];
    const originalName = file.name.split(/[\\/]/u).at(-1)?.trim().slice(0, 500) ?? "document";
    const delegateSafeNameValue = submittedText(submitted.get("delegateSafeName")).trim();
    const originalAttachmentValue = submittedText(submitted.get("originalAttachmentId")).trim();
    const bytes = Buffer.from(await file.arrayBuffer());
    let storageKey: string | undefined;
    try {
      storageKey = await saveAttachmentFile(file);
      const attachmentId = await service.create(
        session,
        subjectTypeValue,
        subjectId,
        {
          byteSize: file.size,
          contentHash: createHash("sha256").update(bytes).digest("hex"),
          contentType: file.type.trim().slice(0, 255) || "application/octet-stream",
          originalName,
          storageKey,
        },
        {
          delegateSafeName: delegateSafeNameValue.length === 0 ? null : delegateSafeNameValue,
          originalAttachmentId:
            originalAttachmentValue.length === 0
              ? null
              : entityIdSchema.parse(originalAttachmentValue),
          selectedUserIds: selectedUserIds(submitted.get("selectedUserIds")),
          visibility,
        },
      );
      return json({ attachmentId, anonymised: prepared.anonymised }, 201);
    } catch (error) {
      if (storageKey !== undefined) await removeAttachmentFile(storageKey);
      throw error;
    }
  });

export const collaborationDocumentHandler = (request: Request, attachmentIdValue: string) =>
  run(async () => {
    const attachmentId = entityIdSchema.parse(attachmentIdValue);
    const session = await requirePrincipal(request);
    const attachment = await new DocumentService(getCollaborationStore()).download(
      session,
      attachmentId,
    );
    const bytes = await readAttachmentFile(attachment.storageKey);
    const encodedName = encodeURIComponent(attachment.displayName).replaceAll("'", "%27");
    const inline =
      new URL(request.url).searchParams.get("inline") === "1" &&
      ["image/gif", "image/jpeg", "image/png", "image/webp"].includes(attachment.contentType);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
        "content-length": String(bytes.byteLength),
        "content-type": attachment.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  });

export const collaborationDocumentSharingHandler = (request: Request, attachmentIdValue: string) =>
  run(async () => {
    assertSameOrigin(request);
    const raw: unknown = await request.json();
    await new DocumentService(getCollaborationStore()).updateSharing(
      await requirePrincipal(request),
      entityIdSchema.parse(attachmentIdValue),
      raw,
    );
    return json({ changed: true });
  });
