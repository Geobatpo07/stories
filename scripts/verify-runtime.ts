/**
 * scripts/verify-runtime.ts
 *
 * Manual end-to-end Definition-of-Done check for the Platform Runtime.
 * Boots a real PlatformRuntime against the real Kernel/content/ tree — no
 * test doubles — subscribes to every event before starting, logs each
 * lifecycle transition and event, then prints a final context summary.
 * Exits non-zero if bootstrap fails.
 *
 * Run with: pnpm runtime:verify
 */
import {
  ConsoleLogger,
  createPlatformRuntime,
  EnvironmentConfiguration,
  KernelKnowledgeSourceAdapter,
  NullPersistenceAdapter,
  PlatformInitializationError,
  type PlatformEvent,
} from "@/runtime";

function logEvent(event: PlatformEvent): void {
  console.warn(`[event] ${event.timestamp.toISOString()} ${event.type}`, describeEvent(event));
}

function describeEvent(event: PlatformEvent): Record<string, unknown> {
  switch (event.type) {
    case "KnowledgeLoaded":
    case "KnowledgeValidated":
      return { entityCount: event.entityCount };
    case "GraphBuilt":
      return { nodeCount: event.nodeCount, edgeCount: event.edgeCount };
    case "PlatformInitializationFailed":
      return { stage: event.stage, reason: event.reason };
    default:
      return {};
  }
}

async function main(): Promise<void> {
  const runtime = createPlatformRuntime({
    knowledgeSource: new KernelKnowledgeSourceAdapter(),
    persistence: new NullPersistenceAdapter(),
    logger: new ConsoleLogger(),
    configuration: new EnvironmentConfiguration(),
  });

  for (const type of [
    "PlatformStarted",
    "KnowledgeLoaded",
    "KnowledgeValidated",
    "GraphBuilt",
    "PlatformReady",
    "PlatformStopped",
    "PlatformInitializationFailed",
  ] as const) {
    runtime.events.subscribe(type, logEvent);
  }

  console.warn(`[state] ${runtime.getState()}`);

  try {
    const context = await runtime.start();
    console.warn(`[state] ${runtime.getState()}`);

    console.warn("Context summary:");
    console.warn(`  entities: ${context.kernel.entities.length}`);
    console.warn(`  graph nodes: ${context.kernel.graph.nodes.size}`);
    console.warn(
      `  adapters: knowledgeSource=${context.adapters.knowledgeSource.constructor.name},`,
    );
    console.warn(`            persistence=${context.adapters.persistence.constructor.name},`);
    console.warn(`            eventBus=${context.adapters.eventBus.constructor.name},`);
    console.warn(`            clock=${context.adapters.clock.constructor.name},`);
    console.warn(`            identifier=${context.adapters.identifier.constructor.name}`);
    console.warn(`  environment keys: ${Object.keys(context.environment).length}`);

    await runtime.stop();
    console.warn(`[state] ${runtime.getState()}`);
    console.warn("Runtime verification passed.");
  } catch (error) {
    console.error(`[state] ${runtime.getState()}`);
    if (error instanceof PlatformInitializationError) {
      console.error(`Runtime verification FAILED during "${error.stage}": ${error.message}`);
    } else {
      console.error("Runtime verification FAILED:", error);
    }
    process.exitCode = 1;
  }
}

main();
