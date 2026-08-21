import { collaborationTimesheetsHandler } from "../../../../../../server/collaboration-handlers";

const handler = (
  request: Request,
  context: { params: Promise<{ entryId: string; subjectId: string; subjectType: string }> },
) =>
  context.params.then(({ entryId, subjectId, subjectType }) =>
    collaborationTimesheetsHandler(request, subjectType, subjectId, entryId),
  );

export const DELETE = handler;
export const PATCH = handler;
