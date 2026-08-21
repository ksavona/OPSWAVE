import { describe, expect, it } from "vitest";

import { normalizeUsername, validateNewPassword, validateOwnerUsername } from "./identity.ts";

describe("owner identity validation", () => {
  it("normalizes compatibility characters and case deterministically", () => {
    expect(normalizeUsername("  Ａlice.Example  ")).toBe("alice.example");
    expect(validateOwnerUsername("  Alice.Example ")).toEqual({
      normalizedUsername: "alice.example",
      username: "Alice.Example",
    });
  });

  it.each(["", "ab", "has space", "-starts-wrong", "a".repeat(65)])(
    "rejects invalid username %j",
    (username) => {
      expect(() => validateOwnerUsername(username)).toThrow();
    },
  );

  it("accepts Unicode letters and rejects normalization collisions through the returned key", () => {
    expect(validateOwnerUsername("Élodie_1").normalizedUsername).toBe("élodie_1");
    expect(normalizeUsername("Ålice")).toBe(normalizeUsername("Ålice"));
  });

  it("enforces password length, confirmation, difference, and UTF-8 byte bounds", () => {
    expect(validateNewPassword("synthetic passphrase", "synthetic passphrase")).toBe(
      "synthetic passphrase",
    );
    expect(() => validateNewPassword("too-short", "too-short")).toThrow("at least 12");
    expect(() => validateNewPassword("synthetic passphrase", "different value")).toThrow(
      "does not match",
    );
    expect(() =>
      validateNewPassword("synthetic passphrase", "synthetic passphrase", "synthetic passphrase"),
    ).toThrow("must differ");
    expect(() => validateNewPassword("🙂".repeat(300), "🙂".repeat(300))).toThrow(
      "1024 UTF-8 bytes",
    );
  });
});
