import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const encryptionKey = (): Buffer | null => {
  const raw = process.env.INVITATION_LINK_ENCRYPTION_KEY;
  if (raw === undefined || raw.length === 0) return null;
  const decoded = Buffer.from(raw, "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(raw).digest();
};

export const isInvitationEncryptionAvailable = (): boolean => encryptionKey() !== null;

export const encryptInvitationPayload = (payload: string): string | null => {
  const key = encryptionKey();
  if (key === null) return null;
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, initializationVector);
  const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return [
    initializationVector.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
};

export const decryptInvitationPayload = (payload: string): string => {
  const key = encryptionKey();
  if (key === null) throw new Error("Invitation payload encryption is unavailable.");
  const [initializationVector, authenticationTag, ciphertext] = payload.split(".");
  if (
    initializationVector === undefined ||
    authenticationTag === undefined ||
    ciphertext === undefined
  ) {
    throw new Error("Invitation payload is invalid.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(initializationVector, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authenticationTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
};
