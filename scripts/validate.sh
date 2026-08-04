#!/usr/bin/env bash

set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

unset NODE_ENV

export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://opsweave:opsweave-test-only@127.0.0.1:55432/opsweave_test}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"

validation_project="opsweave-validation"
database_started=false

cleanup() {
  if [[ "$database_started" == true && "${OPSWAVE_KEEP_TEST_DATABASE:-false}" != true ]]; then
    docker compose --project-name "$validation_project" --profile test down --volumes --remove-orphans >/dev/null
  fi
}

trap cleanup EXIT

if [[ "${OPSWAVE_SKIP_TEST_DATABASE_START:-false}" != true ]]; then
  docker compose --project-name "$validation_project" --profile test up --detach --wait postgres-test
  database_started=true
fi

pnpm check:repo
pnpm check:secrets
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm check:licenses
pnpm audit:prod

printf 'Full validation passed. Coverage report: coverage/index.html\n'
