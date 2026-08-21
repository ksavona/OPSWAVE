# ADR 0008: AI Credential Protection and Sources

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

Self-hosted operators may inject provider credentials through deployment secrets or manage them through Settings. Database compromise must not expose plaintext keys, and loss of the encryption key must not corrupt operational data.

## Decision

- Support two mutually clear sources:
  1. Environment-managed `OPENAI_API_KEY`, which takes precedence and is read-only in Settings.
  2. Settings-managed ciphertext in PostgreSQL when no environment credential is present.
- Encrypt Settings-managed credentials with Node.js AES-256-GCM, a random 96-bit nonce for every write, a 128-bit authentication tag, and associated data binding envelope/key versions.
- Supply the 32-byte base64 master key outside PostgreSQL as `AI_CREDENTIAL_MASTER_KEY` with a positive version.
- Decrypt only at the trusted provider-call boundary and never place plaintext in a queue payload, response, log, audit patch, export, fixture, screenshot, or browser state.
- Never reuse the owner password, hash, session secret, or database password as the AI master key.
- Fail closed with a safe replacement instruction when key version, authentication, or decryption fails. Operational data remains available.
- Store last-four characters only if a later UI security review approves them; configured/unconfigured status is sufficient by default.

## Consequences

### Positive

- Operators can keep secrets entirely in deployment infrastructure.
- Database backups contain ciphertext, not plaintext provider keys.
- Authenticated envelopes detect modification or wrong keys.

### Negative

- Loss of the separately held master key requires provider-credential replacement.
- Rotation needs multi-version decrypt and controlled re-encryption.

## Validation

- Phase 0 tests round-trip, plaintext absence, invalid configuration, metadata mismatch, wrong-key failure, and safe errors.
- Phase 1 tests add ciphertext persistence, source precedence, wrong/lost-key failure, audit redaction, browser-response plaintext absence, and add/replace/remove behavior.
- Multi-version key rotation and exercised backup/restore remain deployment work; current envelopes record a positive key version and fail closed when it cannot be used.

## References

- [NIST SP 800-38D: GCM](https://csrc.nist.gov/pubs/sp/800/38/d/final)
- [Node.js cryptography API](https://nodejs.org/docs/latest-v24.x/api/crypto.html)
