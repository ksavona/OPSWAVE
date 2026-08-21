import { restoreIntakeDraftHandler } from "../../../../../server/http-handlers";

export const POST = (request: Request, context: { params: Promise<{ draftId: string }> }) =>
  context.params.then(({ draftId }) => restoreIntakeDraftHandler(request, draftId));
