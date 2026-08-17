import { notificationHandler } from "../../../../server/collaboration-handlers";

export const PATCH = (request: Request, context: { params: Promise<{ notificationId: string }> }) =>
  context.params.then(({ notificationId }) => notificationHandler(request, notificationId));
