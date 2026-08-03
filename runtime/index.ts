/**
 * The Platform Runtime's sole public entry point. `app/`, `components/`,
 * and any future adapter reach the Runtime only through what is exported
 * here. `runtime/ports/`, and the adapters' internal wiring in
 * `runtime/composition-root.ts`, are implementation details — construct
 * adapters via their exported classes and pass them to
 * `createPlatformRuntime()`, never reach past this barrel.
 *
 * See `runtime/README.md` for the full lifecycle, dependency injection
 * design, port catalog, and event flow.
 */
export { createPlatformRuntime, type PlatformRuntimeOptions } from "./composition-root";
export { PlatformRuntime, type ResolvedPlatformRuntimeOptions } from "./platform-runtime";
export type { ApplicationContext, ApplicationContextAdapters, RuntimeMetadata } from "./context";
export type { PlatformState } from "./lifecycle";

export {
  PlatformConfigurationError,
  PlatformInitializationError,
  PlatformLifecycleError,
} from "./errors";

export type {
  BootstrapStage,
  ClockPort,
  ConfigurationPort,
  EventBusPort,
  EventHandler,
  ExportPort,
  IdentifierPort,
  KnowledgeSourcePort,
  LoggingPort,
  PersistencePort,
  PlatformEvent,
  PlatformEventOf,
  PlatformEventType,
  SearchPort,
  SearchResult,
} from "./ports/types";

export {
  ConsoleLogger,
  EnvironmentConfiguration,
  FixedClock,
  IdentifierService,
  InMemoryEventBus,
  KernelKnowledgeSourceAdapter,
  NullPersistenceAdapter,
  SystemClock,
} from "./adapters";
