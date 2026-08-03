import type { KnowledgeEntity, KnowledgeGraph } from "@/kernel";
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

export interface RuntimeMetadata {
  readonly startedAt: Date;
}

export interface ApplicationContextAdapters {
  readonly knowledgeSource: KnowledgeSourcePort;
  readonly persistence: PersistencePort;
  readonly eventBus: EventBusPort;
  readonly clock: ClockPort;
  readonly identifier: IdentifierPort;
  readonly search?: SearchPort;
  readonly export?: ExportPort;
}

/**
 * Immutable — every level (the context itself, `kernel`, `adapters`,
 * `metadata`, `environment`) is `Object.freeze`'d by `buildContext()`, not
 * just typed `readonly`. Shared across the running platform; never
 * reconstructed except by a fresh `.start()`.
 */
export interface ApplicationContext {
  readonly kernel: {
    readonly entities: readonly KnowledgeEntity[];
    readonly graph: KnowledgeGraph;
  };
  readonly adapters: ApplicationContextAdapters;
  readonly configuration: ConfigurationPort;
  readonly logger: LoggingPort;
  readonly metadata: RuntimeMetadata;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

export interface BuildContextParams {
  readonly entities: readonly KnowledgeEntity[];
  readonly graph: KnowledgeGraph;
  readonly adapters: ApplicationContextAdapters;
  readonly configuration: ConfigurationPort;
  readonly logger: LoggingPort;
  readonly startedAt: Date;
}

export function buildContext(params: BuildContextParams): ApplicationContext {
  return Object.freeze({
    kernel: Object.freeze({ entities: params.entities, graph: params.graph }),
    adapters: Object.freeze({ ...params.adapters }),
    configuration: params.configuration,
    logger: params.logger,
    metadata: Object.freeze({ startedAt: params.startedAt }),
    environment: Object.freeze({ ...params.configuration.getAll() }),
  });
}
