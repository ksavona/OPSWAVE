import { removeTaskDependencyHandler } from "../../../../../../server/http-handlers";

export const DELETE = (
  request: Request,
  context: { params: Promise<{ dependsOnTaskId: string; taskId: string }> },
) =>
  context.params.then(({ dependsOnTaskId, taskId }) =>
    removeTaskDependencyHandler(request, taskId, dependsOnTaskId),
  );
