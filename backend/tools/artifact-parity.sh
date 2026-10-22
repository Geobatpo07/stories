#!/usr/bin/env bash
# Builds the same content with the TypeScript pipeline (pnpm build:knowledge's code) and the Python
# pipeline, then diffs a canonical dump of both artifacts read with the real Node reader.
# Compared: schema, constraints, table list, both tables in the adapter's read order, and the
# manifest with run-dependent fields (generatedAt, generationDuration, file checksum) blanked.
# The `file_path` column is excluded: a Windows-built TypeScript artifact stores backslashes.
# Raw .duckdb bytes are NOT expected to match (file header and physical row order differ).
#
#   backend/tools/artifact-parity.sh [scenario ...]      default: every buildable ok-* scenario
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON="${STORIES_PYTHON:-$REPO/backend/.venv/Scripts/python.exe}"
[ -x "$PYTHON" ] || PYTHON="${STORIES_PYTHON:-$REPO/backend/.venv/bin/python}"
SCENARIOS=("$@")
if [ ${#SCENARIOS[@]} -eq 0 ]; then
  SCENARIOS=(ok-full ok-empty ok-yaml-quirks ok-frontmatter-edges)
fi

status=0
for scenario in "${SCENARIOS[@]}"; do
  work="$(mktemp -d)"
  mkdir -p "$work/ts" "$work/py"
  cp -r "$REPO/fixtures/kernel-contract/scenarios/$scenario/content" "$work/ts/content"
  cp -r "$REPO/fixtures/kernel-contract/scenarios/$scenario/content" "$work/py/content"

  (cd "$work/ts" && "$REPO/node_modules/.bin/tsx" --tsconfig "$REPO/tsconfig.json" "$REPO/build/cli.ts" >/dev/null 2>&1)
  (cd "$REPO/backend" && "$PYTHON" -m pipeline.cli --root "$work/py" --no-search-index >/dev/null)

  node "$REPO/backend/tools/dump-artifact.mjs" "$work/ts/database/generated" --exclude-file-path >"$work/ts.dump"
  node "$REPO/backend/tools/dump-artifact.mjs" "$work/py/database/generated" --exclude-file-path >"$work/py.dump"

  if diff "$work/ts.dump" "$work/py.dump" >"$work/diff.txt"; then
    echo "PARITY OK   $scenario  ($(wc -l <"$work/ts.dump") lines, sha256 $(sha256sum "$work/ts.dump" | cut -c1-16))"
  else
    echo "PARITY FAIL $scenario"
    cat "$work/diff.txt"
    status=1
  fi
done
exit $status
