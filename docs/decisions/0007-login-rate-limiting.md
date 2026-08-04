# ADR 0007: Login and Sensitive-Action Rate Limiting

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

Login, password change, recovery, and provider verification invite brute force and denial-of-service. A permanent account lock is unsafe for the only owner, while an in-memory limiter alone fails across processes and restarts.

## Decision

- Use `rate-limiter-flexible` (reviewed at `11.2.0`) with PostgreSQL-backed counters.
- Combine normalized-account and privacy-reduced network signals. Do not store raw passwords, authorization headers, or provider credentials with counters.
- Begin with progressive short delays and temporary windows rather than permanent lockout; exact thresholds are configuration with bounded safe ranges and Phase 1 tests.
- Return generic authentication errors and a safe retry time after throttling.
- Bound retention and periodically remove expired counters/security events.
- If the durable limiter is unavailable, login uses a conservative bounded in-process fallback and emits a safe operational event. Recovery, password change, and provider verification fail closed.

## Consequences

### Positive

- Limits survive restarts and apply across web replicas.
- The owner is not permanently locked out by remote traffic.
- Failure behavior distinguishes availability-sensitive login from high-risk mutations.

### Negative

- PostgreSQL availability affects sensitive actions.
- Network signals behind proxies require trusted-proxy configuration.

## Validation

Phase 1 must test existing/nonexistent usernames, account/network interactions, retry timing, concurrent attempts, cleanup, proxy parsing, store failure, fallback bounds, and successful owner recovery.

## References

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible)
