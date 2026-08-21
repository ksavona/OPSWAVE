# Contributing to OpsWeave

Thank you for helping improve OpsWeave. The repository currently contains the Phase 0 engineering foundation; product workflows remain unimplemented. Contributions must be clearly scoped, reviewable, and supported by public repository evidence.

## Before contributing

1. Search existing issues and pull requests for related work.
2. Open or identify a public issue for material changes.
3. Agree on scope before implementing a new feature or consequential architecture decision.
4. Never include secrets, private operational data, client data, employer data, or identifying production data.

Security vulnerabilities must follow [SECURITY.md](SECURITY.md), not the public issue tracker.

## Development workflow

1. Create a focused branch from `main`.
2. Make the smallest coherent change that satisfies the issue.
3. Update documentation alongside the behavior it describes.
4. Add or update tests when executable behavior changes.
5. Run every repository-supported validation command relevant to the change.
6. Open a pull request using the repository template.

Use short, imperative commit subjects. A scope is welcome when it improves clarity, for example:

```text
docs: clarify security reporting
ci: add repository hygiene check
```

Avoid mixing feature work, refactoring, formatting, and unrelated documentation changes in one pull request.

## Setup and validation

Follow [docs/development.md](docs/development.md) for the pinned toolchain and local setup. Run the complete quality gate before opening a pull request:

```bash
pnpm validate
```

This command runs repository/secret checks, formatting, Markdown and code linting, strict type-checking, coverage, PostgreSQL migration tests, production builds, browser/accessibility smoke tests, license review, and the production dependency audit. Report the exact result and review `coverage/index.html` when executable code changes.

## Pull request expectations

Pull requests should explain:

- the problem and why the change is needed;
- the approach and meaningful tradeoffs;
- user, security, privacy, and operational impact;
- exact validation that was run and its result;
- screenshots for visible changes; and
- limitations or follow-up work.

Mark unrun or unavailable checks honestly. Do not describe planned capabilities as implemented.

## Documentation standards

- Keep commands copyable and verified.
- Prefer plain language and define project-specific terminology.
- Distinguish implemented, planned, experimental, and unsupported behavior.
- Use synthetic examples only.
- Keep links, headings, diagrams, screenshots, and configuration examples current.
- Record consequential and difficult-to-reverse decisions as architecture decision records.

## Code standards

- Use the pinned Node.js, pnpm, TypeScript, PostgreSQL, and framework versions.
- Keep application-to-package dependency direction described in the architecture overview.
- Use strict TypeScript; do not bypass checks with `any`, broad assertions, or disabled rules without a documented reason.
- Generate and review database migrations; never edit an applied migration.
- Keep provider-specific code behind `packages/ai` and database access behind `packages/db`.
- Use deterministic fakes for external services in required tests.
- Update the full validation command when executable paths, test scope, commands, or dependencies change.

## Review and conduct

All contributions are reviewed for correctness, scope, maintainability, documentation, validation evidence, security, and privacy. Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
