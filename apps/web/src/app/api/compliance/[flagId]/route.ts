import { complianceFlagHandler } from "../../../../server/collaboration-handlers";

export const PATCH = (request: Request, context: { params: Promise<{ flagId: string }> }) =>
  context.params.then(({ flagId }) => complianceFlagHandler(request, flagId));
