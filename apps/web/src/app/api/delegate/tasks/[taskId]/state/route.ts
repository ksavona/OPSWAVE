import { delegateTaskStateHandler } from "../../../../../../server/collaboration-handlers";

export const PATCH = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => delegateTaskStateHandler(request, taskId));
