import { attachmentsHandler } from "../../../../../server/http-handlers";

export const GET = (request: Request, context: { params: Promise<{ projectId: string }> }) =>
  context.params.then(({ projectId }) => attachmentsHandler(request, "project", projectId));

export const POST = (request: Request, context: { params: Promise<{ projectId: string }> }) =>
  context.params.then(({ projectId }) => attachmentsHandler(request, "project", projectId));
