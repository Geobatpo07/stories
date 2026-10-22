#!/usr/bin/env bash
# Builds the same content with the TypeScript pipeline (pnpm build:knowledge's code) and the Python
# pipeline, then diffs a canonical dump of both artifacts read with the real Node reader.
# Compared: schema, constraints, table list, both tables in the adapter's read order, and the
# manifest with run-dependent fields (generatedAt, generationDuration, file checksum) blanked.
# The `file_path` column is excluded: a Windows-built TypeScript artifact stores backslashes.
# Raw .duckdb bytes are NOT expected to match (file header and physical row order differ).
#
#   backend/tools/artifact-parity.sh [scenario ...]   fixture scenarios (default: every buildable ok-*)
#   backend/tools/artifact-parity.sh --repo            this repository's real content/ and knowledge/
#
# --repo copies the trees into two temporary roots and runs the real `build/cli.ts` entry point in
# each, once per STORIES_BUILD_PRODUCER value, so the real database/generated/ is never touched and
# the opt-in wiring itself is exercised. The full diff and both dumps are printed.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON="${STORIES_PYTHON:-$REPO/backend/.venv/Scripts/python.exe}"
[ -x "$PYTHON" ] || PYTHON="${STORIES_PYTHON:-$REPO/backend/.venv/bin/python}"
export STORIES_PYTHON="$PYTHON"
TSX=("$REPO/node_modules/.bin/tsx" --tsconfig "$REPO/tsconfig.json" "$REPO/build/cli.ts")

if [ "${1:-}" = "--repo" ]; then
  work="$(mktemp -d)"
  for side in ts py; do
    mkdir -p "$work/$side"
    cp -r "$REPO/content" "$work/$side/content"
    [ -d "$REPO/knowledge" ] && cp -r "$REPO/knowledge" "$work/$side/knowledge"
  done
  echo "content files: $(find "$REPO/content" -type f ! -name .gitkeep | wc -l) (excluding .gitkeep)"
  echo "knowledge files read by the build: 0 (legacy directory, see knowledge/README.md)"
  echo "--- typescript producer"
  (cd "$work/ts" && env -u STORIES_BUILD_PRODUCER "${TSX[@]}")
  echo "--- python producer"
  (cd "$work/py" && STORIES_BUILD_PRODUCER=python "${TSX[@]}")
  flags=(--exclude-file-path --ignore-search-tables)
  node "$REPO/backend/tools/dump-artifact.mjs" "$work/ts/database/generated" "${flags[@]}" >"$work/ts.dump"
  node "$REPO/backend/tools/dump-artifact.mjs" "$work/py/database/generated" "${flags[@]}" >"$work/py.dump"
  echo "--- typescript dump ($(wc -l <"$work/ts.dump") lines)"
  cat "$work/ts.dump"
  echo "--- python dump ($(wc -l <"$work/py.dump") lines)"
  cat "$work/py.dump"
  echo "--- diff typescript python"
  if diff "$work/ts.dump" "$work/py.dump"; then
    echo "(no differences)"
    echo "PARITY OK   real-repo  (sha256 ts $(sha256sum "$work/ts.dump" | cut -c1-16), py $(sha256sum "$work/py.dump" | cut -c1-16))"
    exit 0
  fi
  echo "PARITY FAIL real-repo"
  exit 1
fi

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

  (cd "$work/ts" && "${TSX[@]}" >/dev/null 2>&1)
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
