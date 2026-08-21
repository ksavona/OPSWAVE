import { z } from "zod";

import { MAX_PASSWORD_BYTES } from "./password.ts";

export const MIN_PASSWORD_CHARACTERS = 12;
export const MAX_USERNAME_CHARACTERS = 64;
export const MIN_USERNAME_CHARACTERS = 3;

const usernameCharacters = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;

export interface OwnerIdentityInput {
  readonly normalizedUsername: string;
  readonly username: string;
}

export const normalizeUsername = (value: string): string =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en-US");

export const validateOwnerUsername = (value: unknown): OwnerIdentityInput => {
  const username = z.string().parse(value).normalize("NFKC").trim();
  const length = Array.from(username).length;

  if (
    length < MIN_USERNAME_CHARACTERS ||
    length > MAX_USERNAME_CHARACTERS ||
    !usernameCharacters.test(username)
  ) {
    throw new Error(
      "Username must be 3–64 characters and contain only letters, numbers, dots, underscores, or hyphens.",
    );
  }

  return { normalizedUsername: normalizeUsername(username), username };
};

export const validateNewPassword = (
  password: unknown,
  confirmation: unknown,
  currentPassword?: string,
): string => {
  const parsedPassword = z.string().parse(password);
  const parsedConfirmation = z.string().parse(confirmation);

  if (Array.from(parsedPassword).length < MIN_PASSWORD_CHARACTERS) {
    throw new Error(
      `Password must contain at least ${String(MIN_PASSWORD_CHARACTERS)} characters.`,
    );
  }

  if (Buffer.byteLength(parsedPassword, "utf8") > MAX_PASSWORD_BYTES) {
    throw new Error(`Password must not exceed ${String(MAX_PASSWORD_BYTES)} UTF-8 bytes.`);
  }

  if (parsedPassword !== parsedConfirmation) {
    throw new Error("Password confirmation does not match.");
  }

  if (currentPassword !== undefined && parsedPassword === currentPassword) {
    throw new Error("New password must differ from the current password.");
  }

  return parsedPassword;
};
