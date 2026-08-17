import { deleteProjectHandler, updateProjectHandler } from "../../../../server/http-handlers";

export const DELETE = (request: Request, context: { params: Promise<{ projectId: string }> }) =>
  context.params.then(({ projectId }) => deleteProjectHandler(request, projectId));

export const PUT = (request: Request, context: { params: Promise<{ projectId: string }> }) =>
  context.params.then(({ projectId }) => updateProjectHandler(request, projectId));
