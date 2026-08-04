import { describe, expect, it } from "vitest";

import {
  SESSION_ACTIVITY_WRITE_INTERVAL_MS,
  SESSION_IDLE_DURATION_MS,
  createSessionTimes,
  getSessionInvalidReason,
  isRecentlyAuthenticated,
  shouldPersistSessionActivity,
} from "./session.ts";

describe("session rules", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");

  it("creates bounded idle, absolute, and recent-authentication times", () => {
    const session = createSessionTimes(now);
    expect(session.idleExpiresAt.getTime() - now.getTime()).toBe(SESSION_IDLE_DURATION_MS);
    expect(getSessionInvalidReason(session, now)).toBeNull();
    expect(isRecentlyAuthenticated(session, new Date(now.getTime() + 14 * 60 * 1_000))).toBe(true);
    expect(isRecentlyAuthenticated(session, new Date(now.getTime() + 16 * 60 * 1_000))).toBe(false);
  });

  it("fails revoked, absolute-expired, and idle-expired sessions in deterministic order", () => {
    const active = createSessionTimes(now);
    expect(getSessionInvalidReason({ ...active, revokedAt: now }, now)).toBe("revoked");
    expect(
      getSessionInvalidReason({ ...active, absoluteExpiresAt: now }, new Date(now.getTime() + 1)),
    ).toBe("absolute_expired");
    expect(
      getSessionInvalidReason({ ...active, idleExpiresAt: now }, new Date(now.getTime() + 1)),
    ).toBe("idle_expired");
  });

  it("throttles activity persistence", () => {
    const session = createSessionTimes(now);
    expect(
      shouldPersistSessionActivity(
        session,
        new Date(now.getTime() + SESSION_ACTIVITY_WRITE_INTERVAL_MS - 1),
      ),
    ).toBe(false);
    expect(
      shouldPersistSessionActivity(
        session,
        new Date(now.getTime() + SESSION_ACTIVITY_WRITE_INTERVAL_MS),
      ),
    ).toBe(true);
  });
});
