#!/usr/bin/env bash

set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

required_files=(
  ".editorconfig"
  ".env.example"
  ".gitattributes"
  ".github/CODEOWNERS"
  ".github/ISSUE_TEMPLATE/bug.yml"
  ".github/ISSUE_TEMPLATE/config.yml"
  ".github/ISSUE_TEMPLATE/documentation.yml"
  ".github/ISSUE_TEMPLATE/feature.yml"
  ".github/PULL_REQUEST_TEMPLATE.md"
  ".github/workflows/ci.yml"
  ".github/workflows/repository-hygiene.yml"
  ".gitignore"
  "CHANGELOG.md"
  "CODE_OF_CONDUCT.md"
  "CONTRIBUTING.md"
  "LICENSE"
  "README.md"
  "SECURITY.md"
  "docs/README.md"
  "docs/architecture/README.md"
  "docs/architecture/overview.md"
  "docs/deployment.md"
  "docs/development.md"
  "docs/decisions/0000-template.md"
  "docs/decisions/0001-runtime-package-manager-and-monorepo.md"
  "docs/decisions/0002-web-and-api-boundary.md"
  "docs/decisions/0003-postgresql-drizzle-and-migrations.md"
  "docs/decisions/0004-worker-queue-and-schedules.md"
  "docs/decisions/0005-owner-bootstrap-password-hashing-and-recovery.md"
  "docs/decisions/0006-server-side-sessions-and-csrf.md"
  "docs/decisions/0007-login-rate-limiting.md"
  "docs/decisions/0008-ai-credential-protection-and-sources.md"
  "docs/decisions/0009-ai-provider-and-responses-api.md"
  "docs/decisions/0010-ui-interaction-and-visualization-libraries.md"
  "docs/decisions/0011-deployment-and-backup-boundary.md"
  "docs/decisions/0012-apache-2-license.md"
  "docs/decisions/README.md"
  "docs/environment.md"
  "docs/recovery.md"
  "docs/security.md"
  "docs/synthetic-data.md"
  "docs/testing.md"
  "package.json"
  "pnpm-lock.yaml"
  "scripts/check-licenses.mjs"
  "scripts/check-repository.sh"
  "scripts/check-secrets.mjs"
  "scripts/validate.sh"
)

failure_count=0

for required_file in "${required_files[@]}"; do
  if [[ ! -f "$required_file" ]]; then
    printf 'Missing required file: %s\n' "$required_file" >&2
    failure_count=$((failure_count + 1))
  fi
done

while IFS= read -r tracked_file; do
  normalized_file="${tracked_file,,}"

  case "$normalized_file" in
    agent.md|agents.md|notes.md|implementation/*|implementations/*)
      printf 'Private local material must not be tracked: %s\n' "$tracked_file" >&2
      failure_count=$((failure_count + 1))
      ;;
    .env|.env.*)
      if [[ "$normalized_file" != ".env.example" ]]; then
        printf 'Local environment files must not be tracked: %s\n' "$tracked_file" >&2
        failure_count=$((failure_count + 1))
      fi
      ;;
  esac
done < <(git ls-files --cached --others --exclude-standard)

if trailing_whitespace="$(git grep -nI -E '[[:blank:]]+$' -- . || true)" \
  && [[ -n "$trailing_whitespace" ]]; then
  printf 'Trailing whitespace found:\n%s\n' "$trailing_whitespace" >&2
  failure_count=$((failure_count + 1))
fi

if carriage_returns="$(git grep -Il $'\r' -- . || true)" \
  && [[ -n "$carriage_returns" ]]; then
  printf 'Carriage returns found in text files:\n%s\n' "$carriage_returns" >&2
  failure_count=$((failure_count + 1))
fi

if ! bash -n scripts/check-repository.sh scripts/validate.sh; then
  printf 'Repository shell validation has invalid Bash syntax.\n' >&2
  failure_count=$((failure_count + 1))
fi

if ((failure_count > 0)); then
  printf 'Repository hygiene failed with %d issue(s).\n' "$failure_count" >&2
  exit 1
fi

printf 'Repository hygiene passed.\n'
