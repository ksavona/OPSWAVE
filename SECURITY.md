# Security Policy

OpsWeave currently provides an unreleased Phase 1 single-owner foundation. Security reports concerning authentication, settings, credential protection, repository content, build tooling, dependencies, or accidental data exposure are welcome.

## Supported versions

There are no supported application versions yet.

| Version                       | Supported          |
| ----------------------------- | ------------------ |
| Unreleased Phase 1 foundation | Best-effort review |

This table will be updated when the first release is published.

## Reporting a vulnerability

Do not open a public issue or discussion for a suspected vulnerability.

Use GitHub's private vulnerability reporting from the repository's **Security** tab and select **Report a vulnerability**. Include:

- the affected file, revision, release, or deployment;
- a clear description of the issue and its impact;
- minimal reproduction steps or a proof of concept;
- any known preconditions; and
- suggested mitigation, if available.

Do not include real credentials, personal data, client data, or production exports. Use synthetic evidence and redact sensitive values.

The maintainer aims to acknowledge a report within five business days and provide an initial assessment within ten business days. Resolution timelines depend on severity, reproducibility, and project maturity. These targets are goals, not service-level guarantees.

## Disclosure process

Please allow reasonable time to investigate and remediate before public disclosure. Confirmed issues will be coordinated through a private GitHub security advisory when possible. Credit will be offered unless the reporter prefers anonymity.

## Security posture

No security or production-readiness claim is made. Phase 1 includes local-only owner bootstrap/recovery, server-side sessions, same-origin mutations, durable rate limits, protected settings, encrypted credential persistence, structured redaction, dependency controls, and automated checks. Live AI, production hardening, key rotation, retention jobs, and operational workflows remain unimplemented. See [docs/security.md](docs/security.md).
