import { entityAuditHandler } from "../../../../../server/http-handlers";

export const GET = (request: Request, context: { params: Promise<{ projectId: string }> }) =>
  context.params.then(({ projectId }) => entityAuditHandler(request, "project", projectId));
