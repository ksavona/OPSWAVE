import { updateIntakeDraftHandler } from "../../../../server/http-handlers";

export const PUT = (request: Request, context: { params: Promise<{ draftId: string }> }) =>
  context.params.then(({ draftId }) => updateIntakeDraftHandler(request, draftId));
