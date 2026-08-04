import { describe, expect, it } from "vitest";

import { SafeApplicationError, safeErrorResponse } from "./errors.ts";

describe("safe error mapping", () => {
  it("maps expected failures without dropping safe retry metadata", () => {
    expect(
      safeErrorResponse(new SafeApplicationError("rate_limited", "Try again later.", 429, 30)),
    ).toEqual({
      body: { error: "rate_limited", message: "Try again later.", retryAfterSeconds: 30 },
      status: 429,
    });
  });

  it("hides unexpected error details", () => {
    expect(safeErrorResponse(new Error("database password synthetic-secret"))).toEqual({
      body: { error: "server_error", message: "The request could not be completed." },
      status: 500,
    });
  });
});
