import { delegateSubtasksHandler } from "../../../../../../server/collaboration-handlers";

export const GET = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => delegateSubtasksHandler(request, taskId));

export const POST = GET;
