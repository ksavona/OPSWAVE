import { delegateStageHandler } from "../../../../../server/collaboration-handlers";

export const PATCH = async (request: Request, context: { params: Promise<{ stageId: string }> }) =>
  delegateStageHandler(request, (await context.params).stageId);
