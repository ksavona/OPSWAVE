import { createProjectDependencyHandler } from "../../../../../server/http-handlers";

export const POST = (request: Request, context: { params: Promise<{ projectId: string }> }) =>
  context.params.then(({ projectId }) => createProjectDependencyHandler(request, projectId));
