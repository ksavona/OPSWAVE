import { createEntityDependencyHandler } from "../../../../../server/http-handlers";

export const POST = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => createEntityDependencyHandler(request, "task", taskId));
