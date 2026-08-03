# components/ui

Reserved for [shadcn/ui](https://ui.shadcn.com) primitives (`Button`, `Card`, `Dialog`, …).

This folder is intentionally empty at foundation stage. `components.json` is already
configured — generate primitives on demand as real screens need them:

```bash
pnpm dlx shadcn@latest add button
```

Do not hand-write files here; everything in this folder should be CLI-generated and then
customized, so upstream updates stay easy to diff.
