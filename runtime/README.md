# runtime/ — the Platform Runtime

Sits between "Adapters" and the Knowledge Kernel. Owns initialization, dependency
injection, the composition root, configuration, adapter registration, lifecycle
management, the Application Context, service discovery, event dispatching, and shutdown.
**Contains no business logic** — that stays in `@/kernel`.

## Dependency direction

`runtime/**` depends only on `@/kernel` (its public barrel — never `@/kernel/*`
internals) and nothing else in the repo: no `next`, `react`, `app/`, `components/`,
`domain/`, `lib/duckdb`, `lib/search`, `lib/metadata`. This makes `runtime/` a second,
independent consumer of the Kernel, a sibling to `domain/*/service.ts`, not a layer
"below" it in the file-import graph — see `docs/architecture/Architecture.md`.

The brief's own conceptual stack diagram (`Adapters → Platform Runtime → Knowledge
Kernel → Knowledge Graph → Applications`) describes _runtime data flow_ — the Runtime
orchestrates calls into the Kernel during boot. That's a different axis from _file
import direction_, which is simply `runtime/ → @/kernel`. Both are true at once.

## Why isn't `KnowledgeSourcePort`'s implementation called `MarkdownAdapter`?

The Kernel already owns Markdown parsing and discovery internally and is sealed — Sprint
3 is explicitly forbidden from modifying it. There is no injection seam to plug an
alternative source _into_ the Kernel. So `KnowledgeSourcePort`'s one implementation this
sprint, `KernelKnowledgeSourceAdapter` (`runtime/adapters/kernel-knowledge-source-adapter.ts`),
is a thin facade: `loadAll()` calls `@/kernel`'s `loadEverything()`, `getGraph()` calls
`getKnowledgeGraph()`. Nothing else. It is deliberately **not** named `MarkdownAdapter` —
that name, sitting outside `kernel/`, would read as "a second parser" and invite a future
contributor to add real parsing logic here, duplicating or bypassing the sealed Kernel.
The port exists so a _future_ sprint could point the Runtime at a different Kernel
instance or a remote Kernel service without changing Runtime code — not so this sprint
reimplements parsing. This is the one file in `runtime/` permitted to import from
`@/kernel`.

## Composition root and dependency injection

```ts
const runtime = createPlatformRuntime({
  knowledgeSource: new KernelKnowledgeSourceAdapter(),
  persistence: new NullPersistenceAdapter(),
  logger: new ConsoleLogger(),
  configuration: new EnvironmentConfiguration(),
});

const context = await runtime.start();
```

`createPlatformRuntime()` — the composition root, the one place `new` is called for
infrastructure — is a pure, synchronous wiring function:

- Validates the four required collaborators (`knowledgeSource`, `persistence`, `logger`,
  `configuration`) are present, throwing `PlatformConfigurationError` with a descriptive
  message if not — defense-in-depth beyond compile-time TypeScript checks.
- Resolves defaults for three infrastructural ports if omitted: `eventBus` →
  `InMemoryEventBus`, `clock` → `SystemClock`, `identifier` → `IdentifierService`. Each
  is still overridable (e.g. pass a `FixedClock` in a test).
- Constructs and returns a `PlatformRuntime`. **Does not call `.start()`** — that would
  make `Created` an unreachable lifecycle state.

DI here means plain constructor injection: `PlatformRuntime`'s constructor takes the
fully-resolved options and assigns each to a `private readonly` field; every method reads
`this.<field>` directly. No container, no reflection, no decorators, and no Service
Locator — nothing is looked up dynamically by name/token.

## Lifecycle

```
Created → Initializing → Running → Stopping → Stopped
```

Exactly five states — a failed boot lands in `Stopped`, not a sixth "Failed" state.
Failure detail lives in the rejected `start()` promise's `PlatformInitializationError`
(which carries `.stage` and `.cause`) and the `PlatformInitializationFailed` event, not
in extra state-machine bookkeeping.

| Transition               | Trigger                                              |
| ------------------------ | ---------------------------------------------------- |
| `Created → Initializing` | `.start()` called (only legal from `Created`)        |
| `Initializing → Running` | Bootstrap completes; `PlatformReady` published       |
| `Initializing → Stopped` | Any bootstrap step throws — skips `Running` entirely |
| `Running → Stopping`     | `.stop()` called (only legal from `Running`)         |
| `Stopping → Stopped`     | Shutdown completes; `PlatformStopped` published      |

**"Lifecycle hooks" = event subscriptions, nothing else.** `PlatformRuntime` exposes no
`onStateChange` callback API. Every transition publishes on `runtime.events` (the same
`EventBusPort` instance used for `KnowledgeLoaded`/`GraphBuilt`/etc.) — subscribing there
_is_ the hook mechanism. This avoids building two redundant notification systems.

### Bootstrap sequence (inside `.start()`)

```
Load configuration        → configuration.load()
Register adapters         → already done by createPlatformRuntime(); no-op here
Initialize services       → (none needed this sprint beyond the above)
Create Knowledge Kernel   → acquire the KnowledgeSourcePort handle (stateless — nothing to construct)
Load Knowledge Sources    → knowledgeSource.loadAll()  → publish KnowledgeLoaded, KnowledgeValidated
Build Knowledge Graph     → knowledgeSource.getGraph() → publish GraphBuilt
Publish "PlatformReady"   → build + freeze ApplicationContext → publish PlatformStarted, then PlatformReady
```

`KnowledgeLoaded` and `KnowledgeValidated` fire back-to-back around one `loadAll()` call.
This is a documented simplification: the Kernel doesn't expose "loaded" and "validated"
as two separately observable moments — `loadEverything()` runs discovery through
relationship resolution as one closed-world pipeline call. Two events are still
published (per the named catalog), honestly representing one Kernel-observable event.

If any step throws — including a real Kernel error like `KnowledgeValidationError` or
`KnowledgeRelationshipError` from malformed content — `.start()` rejects with a
`PlatformInitializationError` wrapping the cause, `PlatformInitializationFailed` is
published, and state lands in `Stopped`. This never happens silently, matching ADR-001's
"fail fast, loud" philosophy already established for the Kernel.

## Event Bus

Typed catalog as a discriminated union (`PlatformEvent` in `runtime/ports/types.ts`) —
`PlatformStarted`, `KnowledgeLoaded`, `KnowledgeValidated`, `GraphBuilt`, `PlatformReady`,
`PlatformStopped`, `PlatformInitializationFailed`. Chosen over per-event classes because
events are pure DTOs with no behavior (classes stay reserved for errors, matching
`kernel/errors.ts`'s convention), and a `switch`/lookup over `event.type` gets TypeScript
exhaustiveness checking.

`InMemoryEventBus.publish()` dispatches **synchronously**, in subscription order.
Every adapter this sprint is synchronous, so async dispatch would add real complexity
(handler-error aggregation, ordering under concurrency) for no current benefit. A
throwing subscriber propagates immediately out of `publish()` rather than being
swallowed — a broken subscriber during bootstrap should visibly break bootstrap.

## Ports and this sprint's concrete implementations

| Port                  | Concrete implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KnowledgeSourcePort` | `KernelKnowledgeSourceAdapter` — see above                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `PersistencePort`     | `NullPersistenceAdapter` for read-only public Runtime composition; `SupabasePersistenceAdapter` for private canonical Knowledge Objects and Studio auth data (`auth/server.ts`, `authoring/server.ts`) — a durable, network-reachable store, since Vercel's serverless functions can't write to a local filesystem. `FileSystemPersistenceAdapter` still exists and is exercised directly in tests, which only need `PersistencePort`'s contract, not a real network round trip. |
| `SearchPort`          | interface only — no implementation this sprint                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ExportPort`          | interface only — no implementation this sprint                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `EmailPort`           | `ResendEmailAdapter` — Studio password-reset email, via Resend's HTTP API directly (`fetch`, not their SDK)                                                                                                                                                                                                                                                                                                                                                                      |
| `LoggingPort`         | `ConsoleLogger` — routes `debug`/`info`/`warn` through `console.warn` and `error` through `console.error`, since `eslint.config.mjs`'s `no-console` rule only allows those two (the same workaround `scripts/verify-kernel.ts` already uses)                                                                                                                                                                                                                                     |
| `ConfigurationPort`   | `EnvironmentConfiguration` — the **only** file in `runtime/` that touches `process.env`; accepts an override source so tests never read or mutate real env vars                                                                                                                                                                                                                                                                                                                  |
| `EventBusPort`        | `InMemoryEventBus`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ClockPort`           | `SystemClock` (default) and `FixedClock` (deterministic, for tests) — built together since the Runtime's own test suite needs deterministic timestamps immediately                                                                                                                                                                                                                                                                                                               |
| `IdentifierPort`      | `IdentifierService` — `generateId()` via `node:crypto`'s `randomUUID()`; `normalizeSlug()` is Runtime-internal _normalization_ (lowercase, collapse non-alphanumeric runs to one hyphen, trim) — distinct from `schemas/common.ts`'s `slugSchema`, which only _validates_ an already-slug-shaped string                                                                                                                                                                          |

## Error handling

Three classes in `runtime/errors.ts`, styled like `kernel/errors.ts` (named classes,
constructor-built descriptive messages, never a raw stack-trace-only failure):

- **`PlatformConfigurationError`** — a required collaborator wasn't registered
  (`createPlatformRuntime`), or a required config key is missing
  (`ConfigurationPort.getOrThrow`).
- **`PlatformInitializationError`** — a bootstrap step threw during `.start()`. Carries
  `.stage` (a `BootstrapStage`) and `.cause` (the original error, never re-wrapped
  twice).
- **`PlatformLifecycleError`** — an illegal operation: `start()` called twice, `stop()`
  before `Running`, `getContext()` before `Running`.

`.start()` is `async` and **rejects** (never throws synchronously) on a bootstrap
failure — a stable, future-proof signature for when a real async `PersistencePort`/
`SearchPort` implementation needs to `await` a connection, without a breaking signature
change later. `createPlatformRuntime()` itself stays synchronous: pure wiring, no I/O,
should fail immediately at composition time for a wiring mistake, without forcing every
caller into an `await`.

## Application Context

Immutable — every level (`context`, `context.kernel`, `context.adapters`,
`context.metadata`, `context.environment`) is `Object.freeze`'d by `buildContext()`
(`runtime/context.ts`), not just typed `readonly`. Contains the loaded Kernel entities
and graph, every registered adapter, configuration, logger, runtime metadata
(`startedAt`), and an environment snapshot. Built once per successful `.start()`;
`getContext()` throws `PlatformLifecycleError` unless the Runtime is `Running`.

## What's deliberately not built

A Runtime-local mirror of `kernel/cache.ts`'s `createMemoized<T>()`. The Kernel needs
that because it's a stateless module of eagerly-memoized top-level functions with no
natural place to store "have I computed this yet." A `PlatformRuntime` is an _instance_
with a natural lifecycle-scoped field (`context`, set once in `start()`) — reimplementing
generic memoization for one field would be needless indirection.

## Testing

Co-located `*.test.ts` next to source (same convention as `kernel/`). Run with
`pnpm test`. Covers composition-root validation, full bootstrap success and a simulated
Kernel-error-during-boot, illegal lifecycle transitions, frozen `ApplicationContext`,
event bus subscribe/unsubscribe/throwing-handler behavior, and each adapter —
including `KernelKnowledgeSourceAdapter` against the real `content/` tree (mirrors
`kernel/api.test.ts`'s integration-test convention).

## Developer workflow

1. `pnpm typecheck && pnpm lint && pnpm test` — the fast local loop.
2. `pnpm runtime:verify` (`scripts/verify-runtime.ts`) — boots a real `PlatformRuntime`
   against the real Kernel/`content/` tree, no test doubles; logs every lifecycle
   transition and event; prints a final context summary; exits non-zero on failure.

## Extension points

Sprint 5 added `ArtifactKnowledgeSourceAdapter`, the production knowledge source. Its
async factory validates `manifest.json` and its checksum, materializes DuckDB rows into
the existing `KnowledgeEntity`/`KnowledgeGraph` contract, and closes the database before
the synchronous Runtime lifecycle begins. `KernelKnowledgeSourceAdapter` remains useful
for Kernel verification and tests but is not imported by the website.

- **`SearchPort`/`ExportPort` implementations** once a concrete search/export need
  exists — interfaces are already in place, no Runtime change required to add one.
- **Durable hosted persistence** — V3 provides local JSON filesystem persistence for the
  private Studio. A hosted workspace can add another adapter through the same port.
- **Wiring into `app/`** — a Next.js server-only bootstrap module that calls
  `createPlatformRuntime(...).start()` once and shares the resulting context; explicitly
  deferred this sprint (Next.js pages are out of scope).
- **ESLint `no-restricted-imports` scoped to `runtime/**`** — would make the "depends
  only on `@/kernel`" rule machine-enforced instead of convention-enforced, mirroring the
  same follow-up noted in `kernel/README.md`.
