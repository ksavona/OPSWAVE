import {
  archiveProjectStageHandler,
  updateProjectStageHandler,
} from "../../../../server/http-handlers";

export const PUT = (request: Request, context: { params: Promise<{ stageId: string }> }) =>
  context.params.then(({ stageId }) => updateProjectStageHandler(request, stageId));

export const DELETE = (request: Request, context: { params: Promise<{ stageId: string }> }) =>
  context.params.then(({ stageId }) => archiveProjectStageHandler(request, stageId));
