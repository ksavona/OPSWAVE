import { retryIntakeRunHandler } from "../../../../../../server/http-handlers";

export const POST = (request: Request, context: { params: Promise<{ runId: string }> }) =>
  context.params.then(({ runId }) => retryIntakeRunHandler(request, runId));
