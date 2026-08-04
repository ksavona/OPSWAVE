export type SafeErrorCode =
  | "authentication_required"
  | "conflict"
  | "configuration_error"
  | "forbidden"
  | "invalid_credentials"
  | "rate_limited"
  | "validation_error";

export class SafeApplicationError extends Error {
  public constructor(
    public readonly code: SafeErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "SafeApplicationError";
  }
}

export const safeErrorResponse = (
  error: unknown,
): { readonly body: Record<string, unknown>; readonly status: number } => {
  if (error instanceof SafeApplicationError) {
    return {
      body: {
        error: error.code,
        message: error.message,
        ...(error.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: error.retryAfterSeconds }),
      },
      status: error.status,
    };
  }

  return {
    body: { error: "server_error", message: "The request could not be completed." },
    status: 500,
  };
};
