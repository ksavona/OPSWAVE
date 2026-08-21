import { deleteTaskTimeEntryHandler } from "../../../../../../server/http-handlers";

export const DELETE = (
  request: Request,
  context: { params: Promise<{ entryId: string; taskId: string }> },
) =>
  context.params.then(({ entryId, taskId }) =>
    deleteTaskTimeEntryHandler(request, taskId, entryId),
  );
