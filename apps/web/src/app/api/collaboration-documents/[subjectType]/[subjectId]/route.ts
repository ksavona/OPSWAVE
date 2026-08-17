import { collaborationDocumentsHandler } from "../../../../../server/collaboration-document-handlers";

const handler = (
  request: Request,
  context: { params: Promise<{ subjectId: string; subjectType: string }> },
) =>
  context.params.then(({ subjectId, subjectType }) =>
    collaborationDocumentsHandler(request, subjectType, subjectId),
  );

export const GET = handler;
export const POST = handler;
