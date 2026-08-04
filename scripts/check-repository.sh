#!/usr/bin/env bash

set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

required_files=(
  ".editorconfig"
  ".gitattributes"
  ".github/CODEOWNERS"
  ".github/ISSUE_TEMPLATE/bug.yml"
  ".github/ISSUE_TEMPLATE/config.yml"
  ".github/ISSUE_TEMPLATE/documentation.yml"
  ".github/ISSUE_TEMPLATE/feature.yml"
  ".github/PULL_REQUEST_TEMPLATE.md"
  ".github/workflows/repository-hygiene.yml"
  ".gitignore"
  "CHANGELOG.md"
  "CODE_OF_CONDUCT.md"
  "CONTRIBUTING.md"
  "README.md"
  "SECURITY.md"
  "docs/README.md"
  "docs/architecture/README.md"
  "docs/decisions/0000-template.md"
  "docs/decisions/README.md"
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
  esac
done < <(git ls-files)

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

if ! bash -n scripts/check-repository.sh; then
  printf 'Repository validation script has invalid Bash syntax.\n' >&2
  failure_count=$((failure_count + 1))
fi

if ((failure_count > 0)); then
  printf 'Repository hygiene failed with %d issue(s).\n' "$failure_count" >&2
  exit 1
fi

printf 'Repository hygiene passed.\n'
