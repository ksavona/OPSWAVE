import { splitMegaTaskHandler } from "../../../../../server/http-handlers";

export const POST = (request: Request, context: { params: Promise<{ taskId: string }> }) =>
  context.params.then(({ taskId }) => splitMegaTaskHandler(request, taskId));
