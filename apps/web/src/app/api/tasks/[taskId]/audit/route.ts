import { entityAuditHandler } from "../../../../../server/http-handlers";

export const GET = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => entityAuditHandler(request, "task", taskId));
