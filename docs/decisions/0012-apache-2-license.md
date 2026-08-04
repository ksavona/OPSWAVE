# ADR 0012: Apache 2.0 License

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

The public repository had no license, so its contents were visible but not open-source licensed. Phase 0 requires a deliberate license and dependency-compatibility review.

## Decision

- License OpsWeave under Apache License 2.0.
- Prefer dependencies with permissive SPDX licenses.
- Enforce a reviewed allowlist for production dependency licenses.
- Accept `CC-BY-4.0` for caniuse compatibility data and `LGPL-3.0-or-later` for the separately packaged libvips binary used by optional Next.js image tooling; the repository does not modify those works and package notices remain intact.
- Re-review the license report when production dependencies change. A passing allowlist is evidence of known identifiers, not legal advice.

## Consequences

### Positive

- Users receive explicit copyright, redistribution, and patent terms.
- Contributors grant the license terms described by Apache 2.0.
- CI rejects new unreviewed production license identifiers.

### Negative

- Redistributors must follow Apache notice and modified-file obligations.
- Dependency license review remains an ongoing maintenance task.

## Validation

- Root `LICENSE` contains the Apache 2.0 text.
- `pnpm check:licenses` reports only reviewed production identifiers.
- README and package manifests identify Apache 2.0.

## References

- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [SPDX Apache-2.0 identifier](https://spdx.org/licenses/Apache-2.0.html)
