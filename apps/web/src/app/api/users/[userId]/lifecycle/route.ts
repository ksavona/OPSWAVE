import { userLifecycleHandler } from "../../../../../server/collaboration-handlers";

export const PATCH = (request: Request, context: { params: Promise<{ userId: string }> }) =>
  context.params.then(({ userId }) => userLifecycleHandler(request, userId));
