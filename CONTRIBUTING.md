# Contributing to OpsWeave

Thank you for helping improve OpsWeave. The repository is currently in pre-implementation planning, so contributions should focus on clearly scoped, reviewable improvements supported by public repository evidence.

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

## Current validation

The only current automated check validates repository hygiene:

```bash
./scripts/check-repository.sh
```

It does not test application behavior or produce code coverage because no application exists yet. Application build, format, lint, type-check, test, coverage, and security-audit commands must be documented only after the relevant tooling is implemented and verified.

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

Language- and framework-specific standards are not defined because the application stack has not been selected. When implementation begins, the repository must add and document reproducible formatting, linting, type-checking, testing, coverage, build, and dependency-management rules.

## Review and conduct

All contributions are reviewed for correctness, scope, maintainability, documentation, validation evidence, security, and privacy. Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
