# Testing and Validation

## Full command

```bash
pnpm validate
```

This is the single supported full validation command locally and in CI. It exits non-zero on any failed gate.

## Gates

| Gate               | Command                 | Output                                                           |
| ------------------ | ----------------------- | ---------------------------------------------------------------- |
| Repository hygiene | `pnpm check:repo`       | Required files, private-file exclusion, whitespace, line endings |
| Secret scan        | `pnpm check:secrets`    | High-confidence scan of public files                             |
| Format             | `pnpm format:check`     | Prettier result                                                  |
| Lint               | `pnpm lint`             | ESLint and Markdownlint result                                   |
| Type check         | `pnpm typecheck`        | Strict root and workspace TypeScript result                      |
| Coverage           | `pnpm test:coverage`    | Text summary plus `coverage/index.html`                          |
| Migrations         | `pnpm test:integration` | PostgreSQL migration and round-trip result                       |
| Build              | `pnpm build`            | Next.js and TypeScript production artifacts                      |
| Browser            | `pnpm test:e2e`         | Playwright functional/accessibility result                       |
| Licenses           | `pnpm check:licenses`   | Reviewed production SPDX identifiers                             |
| Dependencies       | `pnpm audit:prod`       | High-severity production audit                                   |

Global unit coverage thresholds are 80% for statements, branches, functions, and lines. Database repositories and migrations are excluded from the unit denominator because the PostgreSQL integration suite executes their real transactional behavior. Thin Next.js route/page/runtime adapters are validated through the production build and browser suite. Authentication, credential, and request-security services remain in unit coverage; adequacy is reviewed from the actual line and branch report, not inferred from a passing percentage.

## Test database safety

Full validation starts `postgres-test` under the Compose project `opsweave-validation`, binds it only to loopback port `55432`, and removes its temporary storage on completion. Migration and browser setup reject any URL that is not loopback, port `55432`, and database `opsweave_test`.

Set `OPSWAVE_KEEP_TEST_DATABASE=true` to retain the container for debugging. Set `OPSWAVE_SKIP_TEST_DATABASE_START=true` only when an equivalent isolated database is already running.

## Browser tests

Install Chromium once:

```bash
pnpm exec playwright install --with-deps chromium
```

Local developers may set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a compatible existing binary. CI uses Playwright's pinned browser runtime.

Browser setup resets only the guarded isolated test database, applies migrations, and bootstraps a synthetic owner. Tests cover anonymous redirects, authentication, every Phase 1 settings section, credential response redaction, password rotation, logout/re-login, and axe scans.

## External services

Required tests must not call OpenAI or any paid/external service. Provider behavior is represented by deterministic fakes. Optional live checks must use synthetic content, explicit opt-in, and separately documented cost and data-handling assumptions.
