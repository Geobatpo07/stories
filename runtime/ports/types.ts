import type { KnowledgeEntity, KnowledgeGraph } from "@/kernel";

/**
 * All Platform Runtime ports — pure interfaces, no logic. Kept in one file
 * (mirroring kernel/types.ts's "many interfaces, one file" convention)
 * since splitting nine one-method interfaces into nine files would buy
 * nothing. Concrete implementations live under `runtime/adapters/`.
 */

/**
 * Where the Runtime's Knowledge data comes from. This sprint's only
 * implementation (`KernelKnowledgeSourceAdapter`) is a thin facade over
 * `@/kernel` — see runtime/README.md, "Why isn't this MarkdownAdapter?"
 * for why this is not, and must never become, a second parser.
 */
export interface KnowledgeSourcePort {
  loadAll(): readonly KnowledgeEntity[];
  getGraph(): KnowledgeGraph;
  /** Build metadata when the source is a generated knowledge artifact. */
  getMetadata?(): KnowledgeSourceMetadata;
}

export interface KnowledgeSourceMetadata {
  readonly platformVersion: string;
  readonly kernelVersion: string;
  readonly buildVersion: string;
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly contentHash: string;
  readonly generationDuration: number;
  readonly knowledge: {
    readonly entities: number;
    readonly relationships: number;
  };
}

export interface PersistencePort {
  save<T>(collection: string, id: string, value: T): Promise<void>;
  load<T>(collection: string, id: string): Promise<T | undefined>;
  delete(collection: string, id: string): Promise<void>;
}

export interface SearchResult {
  readonly id: string;
  readonly score: number;
}

/** Interface only this sprint — no implementation. See runtime/README.md, "Extension points." */
export interface SearchPort {
  index(entities: readonly KnowledgeEntity[]): Promise<void>;
  search(query: string): Promise<readonly SearchResult[]>;
}

/** Interface only this sprint — no implementation. See runtime/README.md, "Extension points." */
export interface ExportPort {
  export(format: string, entities: readonly KnowledgeEntity[]): Promise<string | Buffer>;
}

export interface LoggingPort {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface ConfigurationPort {
  /** Reads/refreshes configuration from its source. A no-op for sources with nothing to load lazily. */
  load(): void;
  get(key: string): string | undefined;
  /** Throws `PlatformConfigurationError` if `key` is missing. */
  getOrThrow(key: string): string;
  getAll(): Readonly<Record<string, string | undefined>>;
}

export interface ClockPort {
  now(): Date;
}

export interface IdentifierPort {
  generateId(): string;
  /** Lowercase, collapse non-alphanumeric runs to a single hyphen, trim. Normalizes; does not validate — see schemas/common.ts's slugSchema for validation. */
  normalizeSlug(input: string): string;
}

/** The bootstrap step a `PlatformInitializationError` failed during. */
export type BootstrapStage =
  | "Load configuration"
  | "Register adapters"
  | "Initialize services"
  | "Create Knowledge Kernel"
  | "Load Knowledge Sources"
  | "Build Knowledge Graph"
  | "Publish PlatformReady";

/**
 * The Runtime's typed event catalog. A discriminated union, not per-event
 * classes — events are pure DTOs with no behavior (classes stay reserved
 * for errors, matching kernel/errors.ts's convention).
 */
export type PlatformEvent =
  | { readonly type: "PlatformStarted"; readonly timestamp: Date }
  | { readonly type: "KnowledgeLoaded"; readonly timestamp: Date; readonly entityCount: number }
  | { readonly type: "KnowledgeValidated"; readonly timestamp: Date; readonly entityCount: number }
  | {
      readonly type: "GraphBuilt";
      readonly timestamp: Date;
      readonly nodeCount: number;
      readonly edgeCount: number;
    }
  | { readonly type: "PlatformReady"; readonly timestamp: Date }
  | { readonly type: "PlatformStopped"; readonly timestamp: Date }
  | {
      readonly type: "PlatformInitializationFailed";
      readonly timestamp: Date;
      readonly stage: BootstrapStage;
      readonly reason: string;
    };

export type PlatformEventType = PlatformEvent["type"];
export type PlatformEventOf<K extends PlatformEventType> = Extract<PlatformEvent, { type: K }>;
export type EventHandler<K extends PlatformEventType> = (event: PlatformEventOf<K>) => void;

export interface EventBusPort {
  publish(event: PlatformEvent): void;
  subscribe<K extends PlatformEventType>(type: K, handler: EventHandler<K>): void;
  unsubscribe<K extends PlatformEventType>(type: K, handler: EventHandler<K>): void;
}
