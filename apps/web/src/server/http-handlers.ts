import { SafeApplicationError, safeErrorResponse } from "@opsweave/domain";

import { AuthService } from "./auth-service";
import { createRateLimitGate } from "./rate-limits";
import {
  assertSameOrigin,
  clearSessionCookie,
  createSessionCookie,
  getNetworkSignal,
  readCookie,
} from "./request-security";
import { getStore, logger } from "./runtime";
import { SettingsService } from "./settings-service";

let authService: AuthService | undefined;
let settingsService: SettingsService | undefined;
const auth = () => (authService ??= new AuthService(getStore(), createRateLimitGate()));
const settings = () => (settingsService ??= new SettingsService(getStore()));

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, ...(headers === undefined ? {} : { headers }) });

const body = async (request: Request): Promise<unknown> => {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 16_384) {
    throw new SafeApplicationError("validation_error", "The request body is too large.", 413);
  }
  const text = await request.text();
  if (text.length > 16_384) {
    throw new SafeApplicationError("validation_error", "The request body is too large.", 413);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SafeApplicationError("validation_error", "The request body is invalid.", 400);
  }
};

const objectBody = async (request: Request): Promise<Record<string, unknown>> => {
  const value = await body(request);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SafeApplicationError("validation_error", "The request body is invalid.", 400);
  }
  return value as Record<string, unknown>;
};

const run = async (operation: () => Promise<Response>): Promise<Response> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return json({ error: "validation_error", message: "Review the submitted values." }, 400);
    }
    const safe = safeErrorResponse(error);
    if (safe.status === 500) logger.error({ err: error }, "request failed safely");
    return json(safe.body, safe.status);
  }
};

const requireSession = async (request: Request) => auth().authenticateToken(readCookie(request));

export const loginHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const input = await objectBody(request);
    const session = await auth().login(input.username, input.password, getNetworkSignal(request));
    return json({ authenticated: true, username: session.record.username }, 200, {
      "set-cookie": createSessionCookie(session.token, session.maxAgeSeconds),
    });
  });

export const logoutHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    await auth().logout(await requireSession(request));
    return json({ authenticated: false }, 200, { "set-cookie": clearSessionCookie() });
  });

export const sessionHandler = (request: Request) =>
  run(async () => {
    const session = await requireSession(request);
    return json({
      authenticated: true,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      username: session.username,
    });
  });

export const settingsHandler = (request: Request) =>
  run(async () => json(await settings().read(await requireSession(request))));

export const generalSettingsHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const version = await settings().updateGeneral(
      await requireSession(request),
      await body(request),
    );
    return json({ saved: true, version });
  });

export const workingTimeHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    return json({
      ...(await settings().updateWorkingTime(await requireSession(request), await body(request))),
      saved: true,
    });
  });

export const prioritizationHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const version = await settings().updatePrioritization(
      await requireSession(request),
      await body(request),
    );
    return json({ saved: true, version });
  });

export const saveCredentialHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const input = await objectBody(request);
    const session = await requireSession(request);
    await auth().consumeSensitiveAction(`provider:${session.ownerId}`);
    return json(await settings().saveCredential(session, input.credential));
  });

export const removeCredentialHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    await auth().consumeSensitiveAction(`provider:${session.ownerId}`);
    return json(await settings().removeCredential(session));
  });

export const testCredentialHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    await auth().consumeSensitiveAction(`provider:${session.ownerId}`);
    return json(await settings().testCredential(session));
  });

export const changePasswordHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const input = await objectBody(request);
    const rotated = await auth().changePassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      newPasswordConfirmation: input.newPasswordConfirmation,
      session: await requireSession(request),
    });
    return json({ changed: true }, 200, {
      "set-cookie": createSessionCookie(rotated.token, rotated.maxAgeSeconds),
    });
  });

export const revokeOtherSessionsHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const revokedCount = await auth().revokeOthers(await requireSession(request));
    return json({ revokedCount });
  });

export const securitySettingsHandler = (request: Request) =>
  run(async () => {
    const session = await requireSession(request);
    const owner = await getStore().getOnlyOwnerCredential();
    if (owner === null) throw new Error("Owner record missing.");
    return json({
      otherActiveSessionCount: await getStore().countOtherActiveSessions(
        session.ownerId,
        session.id,
        new Date(),
      ),
      passwordChangedAt: owner.passwordChangedAt,
      sessionCreatedAt: session.createdAt,
      sessionLastSeenAt: session.lastSeenAt,
      username: session.username,
    });
  });

export const resetHttpServicesForTests = () => {
  authService = undefined;
  settingsService = undefined;
};

export const configureHttpServicesForTests = (services: {
  readonly auth?: AuthService;
  readonly settings?: SettingsService;
}) => {
  authService = services.auth;
  settingsService = services.settings;
};
