import type { KnowledgeEntity, KnowledgeGraph } from "@/kernel";
import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "./adapters/clock";
import { ConsoleLogger } from "./adapters/console-logger";
import { EnvironmentConfiguration } from "./adapters/environment-configuration";
import { IdentifierService } from "./adapters/identifier-service";
import { InMemoryEventBus } from "./adapters/in-memory-event-bus";
import { NullPersistenceAdapter } from "./adapters/null-persistence-adapter";
import { PlatformInitializationError, PlatformLifecycleError } from "./errors";
import { PlatformRuntime, type ResolvedPlatformRuntimeOptions } from "./platform-runtime";
import type { KnowledgeSourcePort, PlatformEvent } from "./ports/types";

const FIXED_TIME = new Date("2026-01-01T00:00:00.000Z");

function makeEntity(id: string): KnowledgeEntity {
  return {
    id,
    kind: "program",
    slug: id,
    title: id,
    summary: "",
    status: "draft",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    metadata: {},
    relationships: [],
    content: "",
    filePath: `${id}.mdx`,
  };
}

function makeGraph(nodeCount: number, edgesPerNode: number): KnowledgeGraph {
  const nodes = new Map();
  for (let index = 0; index < nodeCount; index += 1) {
    const outgoing = Array.from({ length: edgesPerNode }, (_unused, edgeIndex) => ({
      from: `program:${index}`,
      to: `program:${edgeIndex}`,
      field: "relatedQuestionSlugs",
    }));
    nodes.set(`program:${index}`, {
      entity: makeEntity(`program:${index}`),
      outgoing,
      incoming: [],
    });
  }
  return {
    nodes,
    getNode: (id: string) => nodes.get(id),
    getParents: () => [],
    getChildren: () => [],
    getRelated: () => [],
  };
}

class FakeKnowledgeSource implements KnowledgeSourcePort {
  loadAllError: Error | undefined;
  getGraphError: Error | undefined;
  entities: readonly KnowledgeEntity[] = [makeEntity("program:x")];
  graph: KnowledgeGraph = makeGraph(2, 1);

  loadAll(): readonly KnowledgeEntity[] {
    if (this.loadAllError) throw this.loadAllError;
    return this.entities;
  }

  getGraph(): KnowledgeGraph {
    if (this.getGraphError) throw this.getGraphError;
    return this.graph;
  }
}

function makeOptions(knowledgeSource: KnowledgeSourcePort): ResolvedPlatformRuntimeOptions {
  return {
    knowledgeSource,
    persistence: new NullPersistenceAdapter(),
    logger: new ConsoleLogger(),
    configuration: new EnvironmentConfiguration({}),
    eventBus: new InMemoryEventBus(),
    clock: new FixedClock(FIXED_TIME),
    identifier: new IdentifierService(),
  };
}

function collectEvents(runtime: PlatformRuntime): PlatformEvent[] {
  const events: PlatformEvent[] = [];
  for (const type of [
    "PlatformStarted",
    "KnowledgeLoaded",
    "KnowledgeValidated",
    "GraphBuilt",
    "PlatformReady",
    "PlatformStopped",
    "PlatformInitializationFailed",
  ] as const) {
    runtime.events.subscribe(type, (event) => events.push(event));
  }
  return events;
}

describe("PlatformRuntime", () => {
  let knowledgeSource: FakeKnowledgeSource;
  let runtime: PlatformRuntime;

  beforeEach(() => {
    knowledgeSource = new FakeKnowledgeSource();
    runtime = new PlatformRuntime(makeOptions(knowledgeSource));
  });

  it("starts in Created", () => {
    expect(runtime.getState()).toBe("Created");
  });

  it("start() resolves with a Running context and publishes events in bootstrap order", async () => {
    const events = collectEvents(runtime);

    const context = await runtime.start();

    expect(runtime.getState()).toBe("Running");
    expect(context.kernel.entities).toEqual(knowledgeSource.entities);
    expect(events.map((event) => event.type)).toEqual([
      "KnowledgeLoaded",
      "KnowledgeValidated",
      "GraphBuilt",
      "PlatformStarted",
      "PlatformReady",
    ]);
  });

  it("publishes KnowledgeLoaded/KnowledgeValidated with the loaded entity count", async () => {
    const events = collectEvents(runtime);
    await runtime.start();

    const loaded = events.find((event) => event.type === "KnowledgeLoaded");
    const validated = events.find((event) => event.type === "KnowledgeValidated");
    expect(loaded).toMatchObject({ entityCount: 1 });
    expect(validated).toMatchObject({ entityCount: 1 });
  });

  it("publishes GraphBuilt with the correct node and edge counts", async () => {
    knowledgeSource.graph = makeGraph(3, 2);
    const events = collectEvents(runtime);
    await runtime.start();

    const graphBuilt = events.find((event) => event.type === "GraphBuilt");
    expect(graphBuilt).toMatchObject({ nodeCount: 3, edgeCount: 6 });
  });

  it("rejects with PlatformInitializationError when Load Knowledge Sources fails, landing in Stopped", async () => {
    knowledgeSource.loadAllError = new Error("malformed content");
    const events = collectEvents(runtime);

    await expect(runtime.start()).rejects.toThrow(PlatformInitializationError);

    expect(runtime.getState()).toBe("Stopped");
    expect(events.map((event) => event.type)).not.toContain("PlatformReady");
    const failure = events.find((event) => event.type === "PlatformInitializationFailed");
    expect(failure).toMatchObject({ stage: "Load Knowledge Sources", reason: "malformed content" });
  });

  it("rejects with PlatformInitializationError when Build Knowledge Graph fails", async () => {
    knowledgeSource.getGraphError = new Error("graph build failed");

    await expect(runtime.start()).rejects.toThrow(PlatformInitializationError);
    expect(runtime.getState()).toBe("Stopped");
  });

  it("preserves the original error as .cause on PlatformInitializationError", async () => {
    const original = new Error("dangling reference");
    knowledgeSource.loadAllError = original;

    let caught: unknown;
    try {
      await runtime.start();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PlatformInitializationError);
    expect((caught as PlatformInitializationError).cause).toBe(original);
  });

  it("getContext() throws PlatformLifecycleError before Running", () => {
    expect(() => runtime.getContext()).toThrow(PlatformLifecycleError);
  });

  it("getContext() returns the frozen context once Running", async () => {
    await runtime.start();
    expect(runtime.getContext()).toBeDefined();
  });

  it("stop() throws PlatformLifecycleError before Running", async () => {
    await expect(runtime.stop()).rejects.toThrow(PlatformLifecycleError);
  });

  it("stop() transitions Running -> Stopped and publishes PlatformStopped", async () => {
    const events = collectEvents(runtime);
    await runtime.start();

    await runtime.stop();

    expect(runtime.getState()).toBe("Stopped");
    expect(events.map((event) => event.type)).toContain("PlatformStopped");
    expect(() => runtime.getContext()).toThrow(PlatformLifecycleError);
  });

  it("calling start() twice throws PlatformLifecycleError on the second call", async () => {
    await runtime.start();
    await expect(runtime.start()).rejects.toThrow(PlatformLifecycleError);
  });
});
