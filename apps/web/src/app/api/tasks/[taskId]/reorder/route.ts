import { reorderTaskHandler } from "../../../../../server/http-handlers";

export const POST = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => reorderTaskHandler(request, taskId));
