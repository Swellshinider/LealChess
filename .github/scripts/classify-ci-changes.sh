#!/usr/bin/env bash

set -euo pipefail

for changed_path in "$@"; do
  normalized_path="${changed_path,,}"

  if [[ "$changed_path" != docs/* && "$normalized_path" != *.md ]]; then
    printf 'true\n'
    exit 0
  fi
done

printf 'false\n'
