import { collaborationTimesheetsHandler } from "../../../../../server/collaboration-handlers";

export const GET = (
  request: Request,
  context: { params: Promise<{ subjectId: string; subjectType: string }> },
) =>
  context.params.then(({ subjectId, subjectType }) =>
    collaborationTimesheetsHandler(request, subjectType, subjectId),
  );

export const POST = GET;
