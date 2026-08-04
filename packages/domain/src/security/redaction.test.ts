import { describe, expect, it } from "vitest";

import { REDACTED_VALUE, redactSensitiveValues } from "./redaction.js";

describe("redactSensitiveValues", () => {
  it("redacts nested sensitive fields while preserving safe context", () => {
    const redacted = redactSensitiveValues({
      apiKey: "synthetic-secret-value",
      nested: {
        passwordHash: "synthetic-hash-value",
        provider: "fake",
      },
      tags: [{ sessionToken: "synthetic-session-value" }, "safe"],
    });

    expect(redacted).toEqual({
      apiKey: REDACTED_VALUE,
      nested: {
        passwordHash: REDACTED_VALUE,
        provider: "fake",
      },
      tags: [{ sessionToken: REDACTED_VALUE }, "safe"],
    });
    expect(JSON.stringify(redacted)).not.toContain("synthetic-secret-value");
  });
});
