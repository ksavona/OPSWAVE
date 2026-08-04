# ADR 0005: Owner Bootstrap, Password Hashing, and Recovery

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

The application has one owner, no email service, and no safe reason to expose registration or remote password recovery. Password protection must resist offline database compromise without making tests impractical.

## Decision

- Create the first owner through an explicit local CLI that prompts securely and refuses to run when an owner exists. Ship no default username or password and no remote setup route.
- Provide a separate local recovery CLI that replaces the credential atomically and revokes all sessions without deleting operational data.
- Use `@node-rs/argon2` `2.0.2` with Argon2id, version 19, 19,456 KiB memory, two iterations, one lane, and 32-byte output as the initial production profile.
- Store the encoded hash and parameter/version metadata. Rehash after a successful login when parameters change.
- Bound hash input to 1,024 UTF-8 bytes. Phase 1 adds the 12-character owner policy and confirmation workflow.
- Lower hashing cost only through an explicit test call; production defaults never inspect `NODE_ENV` to weaken themselves.

## Consequences

### Positive

- Host access, rather than an HTTP backdoor, controls bootstrap and recovery.
- Encoded hashes carry salts and parameters.
- Tests remain fast without changing production defaults.

### Negative

- Losing host access removes the supported recovery path.
- Native Argon2 packages require controlled install scripts and platform validation.

## Validation

- Unit tests verify Argon2id, matching/non-matching passwords, malformed hashes, and input bounds.
- PostgreSQL integration tests verify single-use bootstrap, recovery, audit metadata, operational-data preservation, and session revocation transactionally.
- Browser tests verify password change, cookie rotation, logout, and login with the replacement credential.

## References

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [RFC 9106: Argon2](https://www.rfc-editor.org/rfc/rfc9106)
