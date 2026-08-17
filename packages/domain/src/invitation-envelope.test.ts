import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decryptInvitationPayload,
  encryptInvitationPayload,
  isInvitationEncryptionAvailable,
} from "./invitation-envelope.ts";

describe("invitation payload envelope", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed when encryption is not configured", () => {
    vi.stubEnv("INVITATION_LINK_ENCRYPTION_KEY", "");
    expect(isInvitationEncryptionAvailable()).toBe(false);
    expect(encryptInvitationPayload("secret invitation")).toBeNull();
    expect(() => decryptInvitationPayload("invalid")).toThrow("unavailable");
  });

  it("round-trips with a base64 key and derives a key from legacy text", () => {
    vi.stubEnv("INVITATION_LINK_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
    const encrypted = encryptInvitationPayload("single-use invitation");
    expect(encrypted).not.toBeNull();
    expect(decryptInvitationPayload(encrypted ?? "")).toBe("single-use invitation");

    vi.stubEnv("INVITATION_LINK_ENCRYPTION_KEY", "existing-non-base64-key");
    const derivedEncrypted = encryptInvitationPayload("derived-key invitation");
    expect(decryptInvitationPayload(derivedEncrypted ?? "")).toBe("derived-key invitation");
  });

  it("rejects malformed and unauthenticated envelopes", () => {
    vi.stubEnv("INVITATION_LINK_ENCRYPTION_KEY", Buffer.alloc(32, 4).toString("base64"));
    expect(() => decryptInvitationPayload("missing.parts")).toThrow("invalid");
    const encrypted = encryptInvitationPayload("protected");
    if (encrypted === null) throw new Error("Expected encryption.");
    const parts = encrypted.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptInvitationPayload(parts.join("."))).toThrow();
  });
});
