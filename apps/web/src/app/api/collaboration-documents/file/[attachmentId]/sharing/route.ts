import { collaborationDocumentSharingHandler } from "../../../../../../server/collaboration-document-handlers";

export const PATCH = (request: Request, context: { params: Promise<{ attachmentId: string }> }) =>
  context.params.then(({ attachmentId }) =>
    collaborationDocumentSharingHandler(request, attachmentId),
  );
