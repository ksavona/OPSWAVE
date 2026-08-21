export const SESSION_IDLE_DURATION_MS = 12 * 60 * 60 * 1_000;
export const SESSION_ABSOLUTE_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;
export const SESSION_RECENT_AUTH_DURATION_MS = 15 * 60 * 1_000;
export const SESSION_ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1_000;

export interface SessionTimes {
  readonly absoluteExpiresAt: Date;
  readonly createdAt: Date;
  readonly idleExpiresAt: Date;
  readonly lastSeenAt: Date;
  readonly recentAuthenticatedAt: Date;
  readonly revokedAt: Date | null;
}

export type SessionInvalidReason = "absolute_expired" | "idle_expired" | "revoked";

export const createSessionTimes = (now: Date): SessionTimes => ({
  absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_DURATION_MS),
  createdAt: now,
  idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_DURATION_MS),
  lastSeenAt: now,
  recentAuthenticatedAt: now,
  revokedAt: null,
});

export const getSessionInvalidReason = (
  session: Pick<SessionTimes, "absoluteExpiresAt" | "idleExpiresAt" | "revokedAt">,
  now: Date,
): SessionInvalidReason | null => {
  if (session.revokedAt !== null) return "revoked";
  if (session.absoluteExpiresAt.getTime() <= now.getTime()) return "absolute_expired";
  if (session.idleExpiresAt.getTime() <= now.getTime()) return "idle_expired";
  return null;
};

export const isRecentlyAuthenticated = (
  session: Pick<SessionTimes, "recentAuthenticatedAt">,
  now: Date,
): boolean =>
  now.getTime() - session.recentAuthenticatedAt.getTime() <= SESSION_RECENT_AUTH_DURATION_MS;

export const shouldPersistSessionActivity = (
  session: Pick<SessionTimes, "lastSeenAt">,
  now: Date,
): boolean => now.getTime() - session.lastSeenAt.getTime() >= SESSION_ACTIVITY_WRITE_INTERVAL_MS;
