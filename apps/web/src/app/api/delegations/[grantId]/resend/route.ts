import { resendDelegationHandler } from "../../../../../server/collaboration-handlers";

export const POST = (request: Request, context: { params: Promise<{ grantId: string }> }) =>
  context.params.then(({ grantId }) => resendDelegationHandler(request, grantId));
