import { InMemoryEventBus } from "./adapters/in-memory-event-bus";
import { SystemClock } from "./adapters/clock";
import { IdentifierService } from "./adapters/identifier-service";
import { PlatformConfigurationError } from "./errors";
import { PlatformRuntime, type ResolvedPlatformRuntimeOptions } from "./platform-runtime";
import type {
  ClockPort,
  ConfigurationPort,
  EventBusPort,
  ExportPort,
  IdentifierPort,
  KnowledgeSourcePort,
  LoggingPort,
  PersistencePort,
  SearchPort,
} from "./ports/types";

export interface PlatformRuntimeOptions {
  /** Required — no default. */
  readonly knowledgeSource: KnowledgeSourcePort;
  readonly persistence: PersistencePort;
  readonly logger: LoggingPort;
  readonly configuration: ConfigurationPort;
  /** Optional — the Runtime supplies a default if omitted, still overridable (e.g. a `FixedClock` in tests). */
  readonly eventBus?: EventBusPort;
  readonly clock?: ClockPort;
  readonly identifier?: IdentifierPort;
  /** Optional — no default this sprint (interface-only ports). */
  readonly search?: SearchPort;
  readonly export?: ExportPort;
}

/**
 * The Composition Root: the one place `new` is called for infrastructure.
 * Pure, synchronous wiring — validates required collaborators (defense in
 * depth beyond compile-time TS checks), resolves defaults for the
 * infrastructural ports, and constructs a `PlatformRuntime`. Deliberately
 * does NOT call `.start()` — that would make `Created` an unreachable
 * lifecycle state.
 */
export function createPlatformRuntime(options: PlatformRuntimeOptions): PlatformRuntime {
  if (!options.knowledgeSource) {
    throw new PlatformConfigurationError(
      "KnowledgeSourceAdapter not registered. Platform cannot start.",
    );
  }
  if (!options.persistence) {
    throw new PlatformConfigurationError(
      "PersistenceAdapter not registered. Platform cannot start.",
    );
  }
  if (!options.logger) {
    throw new PlatformConfigurationError("Logger not registered. Platform cannot start.");
  }
  if (!options.configuration) {
    throw new PlatformConfigurationError("Configuration missing. Platform cannot start.");
  }

  const resolved: ResolvedPlatformRuntimeOptions = {
    knowledgeSource: options.knowledgeSource,
    persistence: options.persistence,
    logger: options.logger,
    configuration: options.configuration,
    eventBus: options.eventBus ?? new InMemoryEventBus(),
    clock: options.clock ?? new SystemClock(),
    identifier: options.identifier ?? new IdentifierService(),
    search: options.search,
    export: options.export,
  };

  return new PlatformRuntime(resolved);
}
