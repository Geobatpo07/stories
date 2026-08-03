import type { KnowledgeGraph } from "@/kernel";
import { describe, expect, it } from "vitest";
import { buildContext, type ApplicationContextAdapters } from "./context";
import type {
  ClockPort,
  ConfigurationPort,
  EventBusPort,
  IdentifierPort,
  KnowledgeSourcePort,
  LoggingPort,
  PersistencePort,
} from "./ports/types";

const graph: KnowledgeGraph = {
  nodes: new Map(),
  getNode: () => undefined,
  getParents: () => [],
  getChildren: () => [],
  getRelated: () => [],
};

const configuration: ConfigurationPort = {
  load: () => undefined,
  get: () => undefined,
  getOrThrow: () => {
    throw new Error("not configured for this test");
  },
  getAll: () => ({ FOO: "bar" }),
};

const logger: LoggingPort = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const adapters: ApplicationContextAdapters = {
  knowledgeSource: { loadAll: () => [], getGraph: () => graph } satisfies KnowledgeSourcePort,
  persistence: {
    save: () => Promise.resolve(),
    load: () => Promise.resolve(undefined),
    delete: () => Promise.resolve(),
  } satisfies PersistencePort,
  eventBus: {
    publish: () => undefined,
    subscribe: () => undefined,
    unsubscribe: () => undefined,
  } satisfies EventBusPort,
  clock: { now: () => new Date("2026-01-01T00:00:00.000Z") } satisfies ClockPort,
  identifier: { generateId: () => "id", normalizeSlug: (s) => s } satisfies IdentifierPort,
};

describe("buildContext", () => {
  it("promotes entities/graph under kernel, and passes adapters/configuration/logger through", () => {
    const context = buildContext({
      entities: [],
      graph,
      adapters,
      configuration,
      logger,
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(context.kernel.entities).toEqual([]);
    expect(context.kernel.graph).toBe(graph);
    expect(context.configuration).toBe(configuration);
    expect(context.logger).toBe(logger);
    expect(context.metadata.startedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(context.environment).toEqual({ FOO: "bar" });
  });

  it("freezes the context and every nested section individually", () => {
    const context = buildContext({
      entities: [],
      graph,
      adapters,
      configuration,
      logger,
      startedAt: new Date(),
    });

    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.kernel)).toBe(true);
    expect(Object.isFrozen(context.adapters)).toBe(true);
    expect(Object.isFrozen(context.metadata)).toBe(true);
    expect(Object.isFrozen(context.environment)).toBe(true);
  });
});
