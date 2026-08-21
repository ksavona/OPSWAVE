import { deleteTaskHandler, updateTaskHandler } from "../../../../server/http-handlers";

export const DELETE = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => deleteTaskHandler(request, taskId));

export const PUT = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => updateTaskHandler(request, taskId));
