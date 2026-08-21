import { removeProjectDependencyHandler } from "../../../../../../server/http-handlers";

export const DELETE = (
  request: Request,
  context: { params: Promise<{ dependsOnProjectId: string; projectId: string }> },
) =>
  context.params.then(({ dependsOnProjectId, projectId }) =>
    removeProjectDependencyHandler(request, projectId, dependsOnProjectId),
  );
