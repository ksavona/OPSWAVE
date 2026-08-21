import { delegationHandler } from "../../../../server/collaboration-handlers";

export const PATCH = (request: Request, context: { params: Promise<{ grantId: string }> }) =>
  context.params.then(({ grantId }) => delegationHandler(request, grantId));

export const DELETE = PATCH;
