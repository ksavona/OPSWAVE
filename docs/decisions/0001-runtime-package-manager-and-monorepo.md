# ADR 0001: Runtime, Package Manager, and Monorepo

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

The empty repository needed one supported runtime, reproducible dependency resolution, strict TypeScript, and boundaries that can serve a web process and worker without premature services.

## Decision

- Use Node.js `24.19.0` LTS as the canonical runtime.
- Use Corepack-managed pnpm `11.20.0`, exact dependency versions, a committed lockfile, strict peers, approved build scripts, and a 24-hour release-age policy with explicit exceptions for deliberately selected current packages.
- Use TypeScript `6.0.3`, the newest version supported by the selected TypeScript ESLint line.
- Use pnpm workspaces with `apps/web`, `apps/worker`, `packages/domain`, `packages/db`, `packages/ai`, and `packages/testing`.
- Keep a modular monolith. Do not introduce networked internal services without a later ADR and evidence.

## Consequences

### Positive

- One install and lockfile cover all modules.
- Shared rules remain framework-independent and testable.
- Web and worker can deploy independently without distributed-system complexity.

### Negative

- Contributors must use the pinned Node and pnpm major versions.
- Workspace boundaries require deliberate dependency-direction review.
- Node upgrades require CI, native-module, and deployment validation.

## Validation

- `pnpm install --frozen-lockfile`
- `pnpm peers check`
- `pnpm typecheck`
- `pnpm build`

## References

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [TypeScript 6 migration information](https://aka.ms/ts6)
