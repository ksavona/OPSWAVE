import { delegateSubtasksHandler } from "../../../../../../../server/collaboration-handlers";

export const PATCH = (
  request: Request,
  context: { params: Promise<{ subtaskId: string; taskId: string }> },
) =>
  context.params.then(({ subtaskId, taskId }) =>
    delegateSubtasksHandler(request, taskId, subtaskId),
  );

export const DELETE = PATCH;
