import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AesGcmCredentialVault, CredentialVaultError } from "./credential-vault.js";

describe("AesGcmCredentialVault", () => {
  it("round-trips a synthetic credential without placing plaintext in the envelope", () => {
    const secret = "synthetic-provider-credential-never-real";
    const vault = new AesGcmCredentialVault(randomBytes(32).toString("base64"), 1);
    const envelope = vault.encrypt(secret);

    expect(JSON.stringify(envelope)).not.toContain(secret);
    expect(vault.decrypt(envelope)).toBe(secret);
  });

  it("fails closed with a safe error for the wrong key", () => {
    const secret = "another-synthetic-provider-credential";
    const firstVault = new AesGcmCredentialVault(randomBytes(32).toString("base64"), 1);
    const secondVault = new AesGcmCredentialVault(randomBytes(32).toString("base64"), 1);
    const envelope = firstVault.encrypt(secret);

    expect(() => secondVault.decrypt(envelope)).toThrow(CredentialVaultError);

    try {
      secondVault.decrypt(envelope);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain(envelope.ciphertext);
    }
  });

  it("rejects invalid configuration and empty credentials", () => {
    expect(() => new AesGcmCredentialVault("not-a-32-byte-key", 1)).toThrow("not configured");
    expect(() => new AesGcmCredentialVault(randomBytes(32).toString("base64"), 0)).toThrow(
      "key version is invalid",
    );

    const vault = new AesGcmCredentialVault(randomBytes(32).toString("base64"), 1);
    expect(() => vault.encrypt("")).toThrow("must not be empty");
  });

  it("rejects unsupported and mismatched envelope metadata before decryption", () => {
    const vault = new AesGcmCredentialVault(randomBytes(32).toString("base64"), 1);
    const envelope = vault.encrypt("synthetic-provider-credential");

    expect(() => vault.decrypt({ ...envelope, algorithm: "unsupported" })).toThrow(
      CredentialVaultError,
    );
    expect(() => vault.decrypt({ ...envelope, envelopeVersion: 2 })).toThrow(CredentialVaultError);
    expect(() => vault.decrypt({ ...envelope, keyVersion: 2 })).toThrow(CredentialVaultError);
  });
});
