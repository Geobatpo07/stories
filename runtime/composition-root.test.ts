import { describe, expect, it } from "vitest";
import { EnvironmentConfiguration } from "./adapters/environment-configuration";
import { ConsoleLogger } from "./adapters/console-logger";
import { FixedClock } from "./adapters/clock";
import { NullPersistenceAdapter } from "./adapters/null-persistence-adapter";
import { createPlatformRuntime, type PlatformRuntimeOptions } from "./composition-root";
import { PlatformConfigurationError } from "./errors";
import { PlatformRuntime } from "./platform-runtime";
import type { KnowledgeSourcePort } from "./ports/types";

const knowledgeSource: KnowledgeSourcePort = {
  loadAll: () => [],
  getGraph: () => ({
    nodes: new Map(),
    getNode: () => undefined,
    getParents: () => [],
    getChildren: () => [],
    getRelated: () => [],
  }),
};

function validOptions(): PlatformRuntimeOptions {
  return {
    knowledgeSource,
    persistence: new NullPersistenceAdapter(),
    logger: new ConsoleLogger(),
    configuration: new EnvironmentConfiguration({}),
  };
}

describe("createPlatformRuntime", () => {
  it("returns a PlatformRuntime for valid options", () => {
    const runtime = createPlatformRuntime(validOptions());
    expect(runtime).toBeInstanceOf(PlatformRuntime);
    expect(runtime.getState()).toBe("Created");
  });

  it.each([
    ["knowledgeSource", "KnowledgeSourceAdapter not registered. Platform cannot start."],
    ["persistence", "PersistenceAdapter not registered. Platform cannot start."],
    ["logger", "Logger not registered. Platform cannot start."],
    ["configuration", "Configuration missing. Platform cannot start."],
  ] as const)(
    "throws PlatformConfigurationError('%s' missing) with the exact expected message",
    (field, message) => {
      const options = {
        ...validOptions(),
        [field]: undefined,
      } as unknown as PlatformRuntimeOptions;
      expect(() => createPlatformRuntime(options)).toThrow(PlatformConfigurationError);
      expect(() => createPlatformRuntime(options)).toThrow(message);
    },
  );

  it("supplies default EventBus/Clock/Identifier when omitted", () => {
    const runtime = createPlatformRuntime(validOptions());
    expect(runtime.events).toBeDefined();
  });

  it("uses an overridden clock instead of the default SystemClock", async () => {
    const fixed = new Date("2026-01-01T00:00:00.000Z");
    const runtime = createPlatformRuntime({ ...validOptions(), clock: new FixedClock(fixed) });

    let observedTimestamp: Date | undefined;
    runtime.events.subscribe("PlatformReady", (event) => {
      observedTimestamp = event.timestamp;
    });

    await runtime.start();
    expect(observedTimestamp).toEqual(fixed);
  });
});
