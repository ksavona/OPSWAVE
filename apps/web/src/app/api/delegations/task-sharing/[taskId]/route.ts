import { taskDelegateSharingHandler } from "../../../../../server/collaboration-handlers";

export const GET = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => taskDelegateSharingHandler(request, taskId));

export const PATCH = GET;
