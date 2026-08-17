import { describe, expect, it } from "vitest";

import {
  containsProtectedTerm,
  createDelegationAlias,
  findProtectedContactMatches,
} from "./anonymisation.ts";

describe("delegation anonymisation", () => {
  it("creates neutral aliases with a three digit suffix", () => {
    const values = [1, 2, 73];
    expect(createDelegationAlias(() => values.shift() ?? 0)).toMatch(
      /^[A-Z][a-z]+ [A-Z][a-z]+-\d{3}$/u,
    );
  });

  it("finds contact details without an LLM", () => {
    expect(
      findProtectedContactMatches("Email person@example.test or call +44 20 1234 5678"),
    ).toEqual(expect.arrayContaining(["person@example.test", "+44 20 1234 5678"]));
  });

  it("matches owner-provided protected terms case-insensitively", () => {
    expect(containsProtectedTerm("Work for ACME Limited", ["Acme Limited"])).toBe(true);
  });
});
