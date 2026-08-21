import { removeEntityDependencyHandler } from "../../../../../../../server/http-handlers";

export const DELETE = (
  request: Request,
  context: {
    params: Promise<{ blockerId: string; blockerType: string; taskId: string }>;
  },
) =>
  context.params.then(({ blockerId, blockerType, taskId }) =>
    blockerType === "project" || blockerType === "task"
      ? removeEntityDependencyHandler(request, "task", taskId, blockerType, blockerId)
      : Response.json(
          { error: "validation_error", message: "Invalid blocker type." },
          { status: 400 },
        ),
  );
