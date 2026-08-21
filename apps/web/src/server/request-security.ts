import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";

import { SafeApplicationError } from "@opsweave/domain";

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-opsweave_session" : "opsweave_session";

export const digestSessionToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const digestRateLimitSignal = (signal: string): string => {
  const pepper = process.env.AUTH_RATE_LIMIT_PEPPER;
  if (pepper === undefined || pepper.length < 32) {
    throw new Error("AUTH_RATE_LIMIT_PEPPER must contain at least 32 characters.");
  }
  return createHmac("sha256", pepper).update(signal).digest("hex");
};

export const readCookie = (request: Request, name = SESSION_COOKIE_NAME): string | null => {
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader === null) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
};

export const createSessionCookie = (token: string, maxAgeSeconds: number): string =>
  [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    `Max-Age=${String(maxAgeSeconds)}`,
  ].join("; ");

export const clearSessionCookie = (): string =>
  [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    "Max-Age=0",
  ].join("; ");

export const assertSameOrigin = (request: Request): void => {
  const origin = request.headers.get("origin");
  let expectedOrigin: string;
  let suppliedOrigin: string;
  try {
    expectedOrigin = new URL(process.env.APP_BASE_URL ?? request.url).origin;
    suppliedOrigin = origin === null ? "" : new URL(origin).origin;
  } catch {
    throw new SafeApplicationError("forbidden", "The request origin was rejected.", 403);
  }
  if (origin === null || suppliedOrigin !== expectedOrigin) {
    throw new SafeApplicationError("forbidden", "The request origin was rejected.", 403);
  }
};

export const getNetworkSignal = (request: Request): string => {
  if (process.env.TRUST_PROXY !== "true") return "direct-client";
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded !== undefined && isIP(forwarded) !== 0 ? forwarded : "untrusted-proxy-client";
};
