# Phase 3b: opt-in Python producer in `pnpm build:knowledge`

Raw outputs: `backend/evidence/phase-3b/`.

- `STORIES_BUILD_PRODUCER` unset/`typescript`: unchanged path (`default-path-regression.txt`).
- `STORIES_BUILD_PRODUCER=python`: `build/python-producer.ts` runs `python -m pipeline.cli --root <cwd>` from `backend/`.
- `pnpm build:knowledge:parity`: real `content/` and `knowledge/` copied to two temp roots, `build/cli.ts` run once per producer, canonical dumps diffed (`real-content-parity.txt`).
- Real `content/` holds only `.gitkeep` files (0 entities) and `knowledge/` is a legacy directory neither producer reads, so the real-tree parity and duplicate-id results are vacuous. See the Phase 3b report.
- `vercel.json` untouched. Default not flipped.
