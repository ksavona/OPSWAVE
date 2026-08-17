import { createEntityDependencyHandler } from "../../../../../server/http-handlers";

export const POST = (request: Request, context: { params: Promise<{ projectId: string }> }) =>
  context.params.then(({ projectId }) =>
    createEntityDependencyHandler(request, "project", projectId),
  );
