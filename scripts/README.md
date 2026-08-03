# scripts/

Operational scripts that aren't part of the Next.js runtime: content validation, index
rebuilds, one-off migrations, generators (e.g. `new-note --type=experiment`).

Empty at foundation stage. `database/build-index.ts` is the one script that already
exists — it stays under `database/` because it is specifically about the analytical
index, not general tooling.
