# Authentication and Owner Access

OpsWeave Phase 1 supports exactly one owner. It has no registration, default credential, email reset, or web setup route.

## Bootstrap

After configuring `.env` and applying migrations, run:

```bash
pnpm owner:bootstrap
```

The local command securely prompts for a username, workspace name, and confirmed password. Usernames are normalized with Unicode NFKC plus case folding for uniqueness. Passwords require at least 12 characters and are bounded to 1,024 UTF-8 bytes. The command refuses to create a second owner.

## Sessions

Successful login creates a 32-byte opaque token in an HTTP-only, same-site cookie. Production cookies also use `Secure` and the `__Host-` prefix. PostgreSQL stores only a SHA-256 digest. Sessions have a 12-hour idle limit and seven-day absolute limit; activity writes are throttled.

Every protected page and API endpoint checks the session in PostgreSQL. Logout revokes the current session. Password change verifies the current password, replaces the Argon2id hash, revokes every existing session, and creates a rotated current session. Settings can also revoke other active sessions.

## Abuse protection

Login uses PostgreSQL-backed account and network windows. Signals are HMAC-reduced with `AUTH_RATE_LIMIT_PEPPER`; raw passwords and provider credentials never enter rate-limit records. Forwarded client addresses are ignored unless `TRUST_PROXY=true`, which must only be enabled behind a correctly configured trusted proxy. Sensitive actions fail closed if their durable limiter cannot be used.

## Recovery

If the owner password is lost, use `pnpm owner:recover` from the application host. See [backup and recovery](recovery.md). Recovery preserves operational data and revokes every session; there is deliberately no remote recovery API.
