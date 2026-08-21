import { removeEntityDependencyHandler } from "../../../../../../../server/http-handlers";

export const DELETE = (
  request: Request,
  context: {
    params: Promise<{ blockerId: string; blockerType: string; projectId: string }>;
  },
) =>
  context.params.then(({ blockerId, blockerType, projectId }) =>
    blockerType === "project" || blockerType === "task"
      ? removeEntityDependencyHandler(request, "project", projectId, blockerType, blockerId)
      : Response.json(
          { error: "validation_error", message: "Invalid blocker type." },
          { status: 400 },
        ),
  );
