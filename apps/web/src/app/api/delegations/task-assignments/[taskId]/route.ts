import { taskAssignmentsHandler } from "../../../../../server/collaboration-handlers";

export const GET = async (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  taskAssignmentsHandler(request, (await context.params).taskId);

export const PATCH = GET;
