import { attachmentHandler } from "../../../../server/http-handlers";

export const DELETE = (request: Request, context: { params: Promise<{ attachmentId: string }> }) =>
  context.params.then(({ attachmentId }) => attachmentHandler(request, attachmentId));

export const GET = (request: Request, context: { params: Promise<{ attachmentId: string }> }) =>
  context.params.then(({ attachmentId }) => attachmentHandler(request, attachmentId));
