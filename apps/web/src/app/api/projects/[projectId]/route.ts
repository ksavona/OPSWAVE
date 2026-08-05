import { updateProjectHandler } from "../../../../server/http-handlers";

export const PUT = (request: Request, context: { params: Promise<{ projectId: string }> }) =>
  context.params.then(({ projectId }) => updateProjectHandler(request, projectId));
