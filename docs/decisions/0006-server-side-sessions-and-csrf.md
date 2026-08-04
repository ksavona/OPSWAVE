# ADR 0006: Server-Side Sessions and CSRF

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

A single-owner application needs revocable sessions, password-change invalidation, idle expiry, and no client-readable authorization state. Stateless bearer JWTs would make immediate revocation and safe credential changes harder.

## Decision

- Generate 32 random bytes with Node.js cryptography for each opaque session token.
- Send the token only in a `__Host-opsweave_session` cookie: `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, and no `Domain`.
- Store only a SHA-256 token digest with owner/workspace, creation, activity, idle expiry, absolute expiry, and revocation timestamps.
- Use 12-hour idle expiry, seven-day absolute expiry, and 15-minute recent-authentication validity initially.
- Rotate on login, password change, privilege-sensitive action, and recovery. Password change/recovery revokes other sessions.
- Validate same-origin `Origin`/`Host` for every state-changing request and add synchronizer CSRF tokens where browser behavior or route shape makes origin validation insufficient.
- Keep authorization server-side; session presence alone never grants access to a record.

## Consequences

### Positive

- Sessions are immediately revocable and inspectable.
- Browser state contains no credential hash or authorization claims.
- Password recovery has a clear invalidation mechanism.

### Negative

- Every protected request needs a session-store lookup or bounded cache.
- Activity updates require write-throttling to avoid excessive database churn.

## Validation

Phase 1 must cover creation, fixation prevention, rotation, idle/absolute expiry, logout, password change, recovery, concurrent revocation, CSRF/origin rejection, and production cookie attributes.

## References

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
