import { updateTaskHandler } from "../../../../server/http-handlers";

export const PUT = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => updateTaskHandler(request, taskId));
