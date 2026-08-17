import { attachmentsHandler } from "../../../../../server/http-handlers";

export const GET = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => attachmentsHandler(request, "task", taskId));

export const POST = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => attachmentsHandler(request, "task", taskId));
