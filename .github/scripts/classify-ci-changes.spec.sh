#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
classifier="$script_directory/classify-ci-changes.sh"

assert_classification() {
  local expected="$1"
  local description="$2"
  shift 2

  local actual
  actual="$(bash "$classifier" "$@")"

  if [[ "$actual" != "$expected" ]]; then
    printf 'Expected %s for %s, received %s\n' "$expected" "$description" "$actual" >&2
    exit 1
  fi
}

assert_classification false 'an empty change set'
assert_classification false 'a root Markdown file' 'README.md'
assert_classification false 'nested Markdown files' 'guides/getting-started.md' 'notes/RELEASE.MD'
assert_classification false 'documentation files of any type' \
  'docs/ARCHITECTURE.md' 'docs/screenshots/overview.png'
assert_classification false 'documentation paths containing spaces' 'docs/release notes/next.md'
assert_classification true 'application source' 'src/app/app.ts'
assert_classification true 'package metadata' 'package.json'
assert_classification true 'workflow configuration' '.github/workflows/ci.yml'
assert_classification true 'mixed documentation and code' 'README.md' 'src/app/app.ts'
assert_classification true 'a code path included by a rename or deletion' 'src/old-name.ts'

printf 'CI change classification tests passed.\n'
