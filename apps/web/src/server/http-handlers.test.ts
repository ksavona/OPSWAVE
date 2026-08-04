import type { SessionRecord } from "@opsweave/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthService } from "./auth-service";
import {
  configureHttpServicesForTests,
  generalSettingsHandler,
  loginHandler,
  logoutHandler,
  resetHttpServicesForTests,
  sessionHandler,
} from "./http-handlers";
import { SESSION_COOKIE_NAME } from "./request-security";
import type { SettingsService } from "./settings-service";

const session = {
  createdAt: new Date("2026-08-04T12:00:00.000Z"),
  lastSeenAt: new Date("2026-08-04T12:00:00.000Z"),
  ownerId: "owner",
  username: "Synthetic-Owner",
  workspaceId: "workspace",
} as SessionRecord;

const request = (path: string, method: string, value?: unknown, cookie?: string) =>
  new Request(`http://localhost:3000${path}`, {
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    headers: {
      ...(cookie === undefined ? {} : { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }),
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    method,
  });

const configure = () => {
  const auth = {
    authenticateToken: vi.fn(async (token: string | null) => {
      if (token !== "valid-token-long-enough-for-authentication")
        throw new Error("not authenticated");
      return session;
    }),
    login: vi.fn(async () => ({ maxAgeSeconds: 60, record: session, token: "new-token" })),
    logout: vi.fn(async () => undefined),
  };
  const settings = { updateGeneral: vi.fn(async () => 2) };
  configureHttpServicesForTests({
    auth: auth as unknown as AuthService,
    settings: settings as unknown as SettingsService,
  });
  return { auth, settings };
};

afterEach(resetHttpServicesForTests);

describe("HTTP authentication and settings contracts", () => {
  it("sets an HTTP-only session cookie after a valid login without returning the token", async () => {
    configure();
    const response = await loginHandler(
      request("/api/auth/login", "POST", {
        password: "synthetic password",
        username: "Synthetic-Owner",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(await response.text()).not.toContain("new-token");
  });

  it("rejects cross-origin mutations", async () => {
    configure();
    const crossOrigin = request("/api/auth/login", "POST", {});
    crossOrigin.headers.set("origin", "https://attacker.invalid");
    const response = await loginHandler(crossOrigin);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "forbidden" });
  });

  it("returns bounded session metadata and clears the cookie on logout", async () => {
    configure();
    const token = "valid-token-long-enough-for-authentication";
    const sessionResponse = await sessionHandler(
      request("/api/auth/session", "GET", undefined, token),
    );
    expect(await sessionResponse.json()).toEqual({
      authenticated: true,
      createdAt: "2026-08-04T12:00:00.000Z",
      lastSeenAt: "2026-08-04T12:00:00.000Z",
      username: "Synthetic-Owner",
    });
    const logoutResponse = await logoutHandler(request("/api/auth/logout", "POST", {}, token));
    expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("requires a session and accepts a versioned General settings mutation", async () => {
    const { settings } = configure();
    const token = "valid-token-long-enough-for-authentication";
    const response = await generalSettingsHandler(
      request("/api/settings/general", "PUT", { version: 1 }, token),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, version: 2 });
    expect(settings.updateGeneral).toHaveBeenCalledWith(session, { version: 1 });
  });
});
