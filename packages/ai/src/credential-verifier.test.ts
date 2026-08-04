import { describe, expect, it } from "vitest";

import { DeterministicFakeCredentialVerifier } from "./credential-verifier.ts";

describe("DeterministicFakeCredentialVerifier", () => {
  const verifier = new DeterministicFakeCredentialVerifier();

  it.each([
    ["synthetic-valid-example", "verified"],
    ["synthetic-invalid-example", "invalid"],
    ["synthetic-rate-limited-example", "rate_limited"],
    ["synthetic-outage-example", "unavailable"],
  ] as const)(
    "maps the synthetic credential without external calls",
    async (credential, status) => {
      await expect(verifier.verify(credential)).resolves.toBe(status);
    },
  );
});
