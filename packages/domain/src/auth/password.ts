import { hash, verify } from "@node-rs/argon2";

// Numeric values mirror the package's ambient const enums, which cannot be imported
// when TypeScript's verbatimModuleSyntax protection is enabled.
const ARGON2ID_ALGORITHM = 2;
const ARGON2_VERSION_19 = 1;

export interface Argon2Parameters {
  readonly memoryCost: number;
  readonly outputLen: number;
  readonly parallelism: number;
  readonly timeCost: number;
}

export const PRODUCTION_ARGON2_PARAMETERS: Readonly<Argon2Parameters> = Object.freeze({
  memoryCost: 19_456,
  outputLen: 32,
  parallelism: 1,
  timeCost: 2,
});

export const MAX_PASSWORD_BYTES = 1_024;

const assertHashablePassword = (password: string): void => {
  const byteLength = Buffer.byteLength(password, "utf8");

  if (byteLength === 0) {
    throw new Error("Password must not be empty.");
  }

  if (byteLength > MAX_PASSWORD_BYTES) {
    throw new Error(`Password must not exceed ${String(MAX_PASSWORD_BYTES)} UTF-8 bytes.`);
  }
};

export const hashPassword = async (
  password: string,
  parameters: Readonly<Argon2Parameters> = PRODUCTION_ARGON2_PARAMETERS,
): Promise<string> => {
  assertHashablePassword(password);

  return hash(password, {
    algorithm: ARGON2ID_ALGORITHM,
    memoryCost: parameters.memoryCost,
    outputLen: parameters.outputLen,
    parallelism: parameters.parallelism,
    timeCost: parameters.timeCost,
    version: ARGON2_VERSION_19,
  });
};

export const verifyPassword = async (encodedHash: string, password: string): Promise<boolean> => {
  assertHashablePassword(password);

  try {
    return await verify(encodedHash, password);
  } catch {
    return false;
  }
};
