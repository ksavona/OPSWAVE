import { describe, expect, it } from "vitest";

import { MAX_PASSWORD_BYTES, hashPassword, verifyPassword } from "./password.ts";

const TEST_PARAMETERS = Object.freeze({
  memoryCost: 1_024,
  outputLen: 32,
  parallelism: 1,
  timeCost: 1,
});

describe("password hashing", () => {
  it("uses Argon2id and verifies only the matching password", async () => {
    const password = "synthetic owner password";
    const encodedHash = await hashPassword(password, TEST_PARAMETERS);

    expect(encodedHash).toMatch(/^\$argon2id\$/u);
    await expect(verifyPassword(encodedHash, password)).resolves.toBe(true);
    await expect(verifyPassword(encodedHash, "different synthetic password")).resolves.toBe(false);
  });

  it("returns false for malformed encoded hashes", async () => {
    await expect(verifyPassword("not-an-argon2-hash", "synthetic owner password")).resolves.toBe(
      false,
    );
  });

  it("rejects empty and excessive inputs before hashing", async () => {
    await expect(hashPassword("", TEST_PARAMETERS)).rejects.toThrow("must not be empty");
    await expect(hashPassword("x".repeat(MAX_PASSWORD_BYTES + 1), TEST_PARAMETERS)).rejects.toThrow(
      "must not exceed",
    );
  });
});
