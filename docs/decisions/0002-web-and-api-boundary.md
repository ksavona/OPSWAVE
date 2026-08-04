# ADR 0002: Web and API Boundary

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

OpsWeave needs an accessible interactive UI, protected server mutations, and a small self-hostable topology. A separate API service would add deployment and authorization boundaries before evidence requires them.

## Decision

- Use Next.js `16.3.0`, React `19.2.8`, the App Router, Server Components by default, and route handlers/server actions only where their contracts are explicit and testable.
- Keep authentication, authorization, secret access, provider calls, and database access server-only.
- Put reusable validation and business rules in workspace packages rather than page modules.
- Return typed, bounded, user-safe errors; never serialize hashes, session tokens, decrypted credentials, or raw provider errors.
- Do not create a separate REST/GraphQL service in the initial modular monolith.

## Consequences

### Positive

- One web deployment owns UI and server rendering.
- Server-only modules reduce accidental credential exposure.
- The API boundary can be extracted later if measured operational needs justify it.

### Negative

- Route contracts need deliberate documentation because there is no standalone API schema yet.
- Next.js upgrades affect both rendering and server boundaries.

## Validation

- Route unit test for `/health`.
- Component test for foundation state.
- `pnpm --filter @opsweave/web build`.
- Playwright browser and accessibility smoke tests.

## References

- [Next.js App Router documentation](https://nextjs.org/docs/app)
- [Next.js security guidance](https://nextjs.org/docs/app/guides/data-security)
