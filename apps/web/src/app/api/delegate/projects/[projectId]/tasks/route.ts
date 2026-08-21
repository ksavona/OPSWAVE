import { delegateProjectTaskHandler } from "../../../../../../server/collaboration-handlers";

export const POST = (request: Request, context: { params: Promise<{ projectId: string }> }) =>
  context.params.then(({ projectId }) => delegateProjectTaskHandler(request, projectId));
