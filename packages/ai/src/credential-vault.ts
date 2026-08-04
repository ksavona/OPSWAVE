import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = 1;
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

export interface EncryptedCredentialEnvelope {
  readonly algorithm: string;
  readonly authenticationTag: string;
  readonly ciphertext: string;
  readonly envelopeVersion: number;
  readonly initializationVector: string;
  readonly keyVersion: number;
}

export class CredentialVaultError extends Error {
  public constructor(message = "Credential operation failed.") {
    super(message);
    this.name = "CredentialVaultError";
  }
}

const associatedData = (keyVersion: number): Buffer =>
  Buffer.from(
    `opsweave:ai-credential:v${String(ENVELOPE_VERSION)}:key-v${String(keyVersion)}`,
    "utf8",
  );

const decodeMasterKey = (encodedMasterKey: string): Buffer => {
  const decoded = Buffer.from(encodedMasterKey, "base64");

  if (decoded.length !== KEY_LENGTH_BYTES) {
    throw new CredentialVaultError("Credential vault is not configured.");
  }

  return decoded;
};

export class AesGcmCredentialVault {
  readonly #keyVersion: number;
  readonly #masterKey: Buffer;

  public constructor(encodedMasterKey: string, keyVersion: number) {
    if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
      throw new CredentialVaultError("Credential key version is invalid.");
    }

    this.#masterKey = decodeMasterKey(encodedMasterKey);
    this.#keyVersion = keyVersion;
  }

  public encrypt(plaintext: string): EncryptedCredentialEnvelope {
    if (plaintext.length === 0) {
      throw new CredentialVaultError("Credential must not be empty.");
    }

    const initializationVector = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.#masterKey, initializationVector);
    cipher.setAAD(associatedData(this.#keyVersion));

    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

    return {
      algorithm: ALGORITHM,
      authenticationTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      envelopeVersion: ENVELOPE_VERSION,
      initializationVector: initializationVector.toString("base64"),
      keyVersion: this.#keyVersion,
    };
  }

  public decrypt(envelope: EncryptedCredentialEnvelope): string {
    if (
      envelope.algorithm !== ALGORITHM ||
      envelope.envelopeVersion !== ENVELOPE_VERSION ||
      envelope.keyVersion !== this.#keyVersion
    ) {
      throw new CredentialVaultError();
    }

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.#masterKey,
        Buffer.from(envelope.initializationVector, "base64"),
      );
      decipher.setAAD(associatedData(this.#keyVersion));
      decipher.setAuthTag(Buffer.from(envelope.authenticationTag, "base64"));

      return Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new CredentialVaultError();
    }
  }
}
