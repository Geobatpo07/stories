import { cpSync, existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPythonProducer, selectedProducer } from "./python-producer";
import { pythonAvailable } from "./targets/python-producer.test-support";

const SCENARIOS = join(__dirname, "..", "fixtures", "kernel-contract", "scenarios");
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function rootWith(scenario: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "stories-build-producer-"));
  directories.push(root);
  cpSync(join(SCENARIOS, scenario, "content"), join(root, "content"), { recursive: true });
  return root;
}

const environment = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("selectedProducer", () => {
  it("defaults to typescript when unset or empty", () => {
    expect(selectedProducer(environment({}))).toBe("typescript");
    expect(selectedProducer(environment({ STORIES_BUILD_PRODUCER: "" }))).toBe("typescript");
    expect(selectedProducer(environment({ STORIES_BUILD_PRODUCER: "typescript" }))).toBe(
      "typescript",
    );
  });

  it("accepts python and rejects anything else instead of silently falling back", () => {
    expect(selectedProducer(environment({ STORIES_BUILD_PRODUCER: "python" }))).toBe("python");
    expect(() => selectedProducer(environment({ STORIES_BUILD_PRODUCER: "Python" }))).toThrow(
      /must be/,
    );
  });
});

describe.skipIf(!pythonAvailable)("runPythonProducer", () => {
  const quiet = { ...process.env };

  it("writes the artifact at database/generated and returns 0", async () => {
    const root = await rootWith("ok-full");
    expect(runPythonProducer(root, quiet)).toBe(0);
    expect(existsSync(join(root, "database/generated/knowledge.duckdb"))).toBe(true);
    expect(existsSync(join(root, "database/generated/manifest.json"))).toBe(true);
  });

  it("propagates a duplicate-id failure as a non-zero code and writes nothing", async () => {
    const root = await rootWith("ok-duplicate-slug");
    expect(runPythonProducer(root, quiet)).not.toBe(0);
    expect(existsSync(join(root, "database/generated"))).toBe(false);
  });
});
