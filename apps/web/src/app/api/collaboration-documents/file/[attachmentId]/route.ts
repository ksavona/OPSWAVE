import { collaborationDocumentHandler } from "../../../../../server/collaboration-document-handlers";

export const GET = (request: Request, context: { params: Promise<{ attachmentId: string }> }) =>
  context.params.then(({ attachmentId }) => collaborationDocumentHandler(request, attachmentId));
