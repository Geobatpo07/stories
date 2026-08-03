import type { KnowledgeGraph } from "@/kernel";
import { buildContext, type ApplicationContext } from "./context";
import { PlatformInitializationError, PlatformLifecycleError } from "./errors";
import { isLegalTransition, type PlatformState } from "./lifecycle";
import type {
  BootstrapStage,
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

/** `PlatformRuntimeOptions` after `createPlatformRuntime()` has validated required fields and resolved defaults. */
export interface ResolvedPlatformRuntimeOptions {
  readonly knowledgeSource: KnowledgeSourcePort;
  readonly persistence: PersistencePort;
  readonly logger: LoggingPort;
  readonly configuration: ConfigurationPort;
  readonly eventBus: EventBusPort;
  readonly clock: ClockPort;
  readonly identifier: IdentifierPort;
  readonly search?: SearchPort;
  readonly export?: ExportPort;
}

/**
 * Orchestrates the platform's lifecycle. Contains no business logic —
 * every step delegates to an injected port. See runtime/README.md for the
 * full bootstrap sequence and event flow.
 */
export class PlatformRuntime {
  private state: PlatformState = "Created";
  private context: ApplicationContext | undefined;

  constructor(private readonly options: ResolvedPlatformRuntimeOptions) {}

  /** The same `EventBusPort` instance used internally — subscribing here IS "lifecycle hooks." */
  get events(): EventBusPort {
    return this.options.eventBus;
  }

  getState(): PlatformState {
    return this.state;
  }

  getContext(): ApplicationContext {
    if (this.state !== "Running" || !this.context) {
      throw new PlatformLifecycleError(
        `getContext() requires state "Running"; current state is "${this.state}".`,
      );
    }
    return this.context;
  }

  /**
   * Load configuration → Register adapters → Initialize services →
   * Create Knowledge Kernel → Load Knowledge Sources → Build Knowledge
   * Graph → Publish "PlatformReady". Rejects with `PlatformInitializationError`
   * on any failure; state lands in `Stopped`, skipping `Running` entirely.
   */
  async start(): Promise<ApplicationContext> {
    this.transition("Initializing");

    let stage: BootstrapStage = "Load configuration";
    try {
      this.options.configuration.load();

      stage = "Register adapters";
      // Adapters are already registered via createPlatformRuntime() — nothing to do here.

      stage = "Initialize services";
      // No additional services to initialize this sprint.

      stage = "Create Knowledge Kernel";
      const { knowledgeSource } = this.options;

      stage = "Load Knowledge Sources";
      const entities = knowledgeSource.loadAll();
      this.publishKnowledgeLoadedEvents(entities.length);

      stage = "Build Knowledge Graph";
      const graph = knowledgeSource.getGraph();
      this.publishGraphBuiltEvent(graph);

      stage = "Publish PlatformReady";
      const context = buildContext({
        entities,
        graph,
        adapters: {
          knowledgeSource: this.options.knowledgeSource,
          persistence: this.options.persistence,
          eventBus: this.options.eventBus,
          clock: this.options.clock,
          identifier: this.options.identifier,
          search: this.options.search,
          export: this.options.export,
        },
        configuration: this.options.configuration,
        logger: this.options.logger,
        startedAt: this.options.clock.now(),
        sourceMetadata: knowledgeSource.getMetadata?.(),
      });

      this.context = context;
      this.transition("Running");
      this.options.eventBus.publish({
        type: "PlatformStarted",
        timestamp: this.options.clock.now(),
      });
      this.options.eventBus.publish({ type: "PlatformReady", timestamp: this.options.clock.now() });

      return context;
    } catch (error) {
      this.transition("Stopped");
      this.options.eventBus.publish({
        type: "PlatformInitializationFailed",
        timestamp: this.options.clock.now(),
        stage,
        reason: error instanceof Error ? error.message : String(error),
      });
      throw new PlatformInitializationError(stage, error);
    }
  }

  async stop(): Promise<void> {
    if (this.state !== "Running") {
      throw new PlatformLifecycleError(
        `stop() requires state "Running"; current state is "${this.state}".`,
      );
    }
    this.transition("Stopping");
    this.context = undefined;
    this.transition("Stopped");
    this.options.eventBus.publish({ type: "PlatformStopped", timestamp: this.options.clock.now() });
  }

  private publishKnowledgeLoadedEvents(entityCount: number): void {
    // Sprint 2's Kernel does not expose "loaded" and "validated" as two
    // separately observable moments — loadEverything() runs discovery
    // through relationship resolution as one closed-world call. Both
    // events fire back-to-back around that one call rather than from two
    // genuinely separate Kernel-observable phases.
    const timestamp = this.options.clock.now();
    this.options.eventBus.publish({ type: "KnowledgeLoaded", timestamp, entityCount });
    this.options.eventBus.publish({ type: "KnowledgeValidated", timestamp, entityCount });
  }

  private publishGraphBuiltEvent(graph: KnowledgeGraph): void {
    let edgeCount = 0;
    for (const node of graph.nodes.values()) {
      edgeCount += node.outgoing.length;
    }
    this.options.eventBus.publish({
      type: "GraphBuilt",
      timestamp: this.options.clock.now(),
      nodeCount: graph.nodes.size,
      edgeCount,
    });
  }

  private transition(to: PlatformState): void {
    if (!isLegalTransition(this.state, to)) {
      throw new PlatformLifecycleError(
        `Illegal lifecycle transition from "${this.state}" to "${to}".`,
      );
    }
    this.state = to;
  }
}
