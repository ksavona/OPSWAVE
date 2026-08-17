# ADR 0012: Apache 2.0 License

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

The public repository had no license, so its contents were visible but not open-source licensed. Phase 0 requires a deliberate license and dependency-compatibility review.

The intended contribution model is a public repository that anyone can download, use, modify, and redistribute. The owner also expressed a preference that anyone monetizing the project contact the maintainer. That preference cannot be made a condition of either MIT or Apache-2.0: both are permissive open-source licenses, and Apache-2.0 expressly permits commercial transfer of the work.

## Decision

- License OpsWeave under Apache License 2.0.
- Commercial use of the code is permitted without additional permission when the Apache-2.0 conditions are met. Contact is optional for commercial partnerships, hosted offerings, support, or trademark permission; it is not a license requirement.
- Prefer dependencies with permissive SPDX licenses.
- Enforce a reviewed allowlist for production dependency licenses.
- Accept `CC-BY-4.0` for caniuse compatibility data and `LGPL-3.0-or-later` for the separately packaged libvips binary used by optional Next.js image tooling; the repository does not modify those works and package notices remain intact.
- Re-review the license report when production dependencies change. A passing allowlist is evidence of known identifiers, not legal advice.

### Alternatives considered

| Criterion                | MIT                                                   | Apache-2.0                                                    | Decision                                    |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| Simplicity               | Shorter and easier to read                            | More detailed notice and redistribution terms                 | Apache-2.0 accepted                         |
| Patent terms             | No express patent grant                               | Express contributor patent grant and termination provision    | Apache-2.0 accepted                         |
| Dependency compatibility | Compatible with the planned permissive dependency set | Compatible with the planned permissive dependency set         | Tie                                         |
| Contribution model       | Simple permissive contributions                       | Permissive contributions with clearer notice and patent terms | Apache-2.0 accepted                         |
| Commercial use           | Permitted; no contact requirement                     | Permitted; no contact requirement                             | Neither meets a mandatory contact condition |

If a mandatory contact or approval step before monetization is non-negotiable, this decision must be superseded before release with a lawyer-reviewed source-available or commercial-license model. That model would not be an OSI-approved open-source license.

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
- `pnpm check:licenses` reports only reviewed production identifiers: Apache-2.0, MIT, ISC, BSD-3-Clause, 0BSD, `(MPL-2.0 OR Apache-2.0)`, CC-BY-4.0, LGPL-3.0-or-later, and Unlicense, plus the documented MIT `khroma@2.1.0` metadata exception.
- README and package manifests identify Apache 2.0.

## References

- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [SPDX Apache-2.0 identifier](https://spdx.org/licenses/Apache-2.0.html)
