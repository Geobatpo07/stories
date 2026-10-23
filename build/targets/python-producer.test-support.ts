import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { KnowledgeEntity } from "@/kernel";

/**
 * Test support for running the Python knowledge-artifact producer (backend/pipeline, ADR-004
 * Phase 3) from Vitest. Not a test file itself.
 *
 * The interpreter is `STORIES_PYTHON`, or the backend's own virtualenv when it exists. Tests that
 * need Python skip themselves when neither is available, so a Node-only environment still passes
 * `pnpm test`; the `python-artifact` CI job sets it, so there the tests always run.
 */
const BACKEND = resolve(__dirname, "../../backend");

export function pythonExecutable(): string | undefined {
  const fromEnvironment = process.env.STORIES_PYTHON;
  if (fromEnvironment) return fromEnvironment;
  for (const candidate of [
    join(BACKEND, ".venv", "Scripts", "python.exe"),
    join(BACKEND, ".venv", "bin", "python"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export const pythonAvailable = pythonExecutable() !== undefined;

/** True when the round-trip test should take its artifact from the Python producer. */
export const useJsProducer = process.env.STORIES_ARTIFACT_PRODUCER !== "python";

export interface PythonBuildResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs `python -m pipeline.cli --root <root>` with the given extra arguments. */
export function runPythonBuild(
  root: string,
  extraArguments: readonly string[] = [],
): PythonBuildResult {
  const python = pythonExecutable();
  if (!python) throw new Error("No Python interpreter: set STORIES_PYTHON or create backend/.venv");
  const completed = spawnSync(python, ["-m", "pipeline.cli", "--root", root, ...extraArguments], {
    cwd: BACKEND,
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  return { status: completed.status, stdout: completed.stdout, stderr: completed.stderr };
}

/** Hands already-built entities to the Python producer, as `KnowledgeEntity.toJSON()` shapes. */
export function runPythonBuildFromEntities(
  root: string,
  entities: readonly KnowledgeEntity[],
  extraArguments: readonly string[] = [],
): PythonBuildResult {
  const directory = mkdtempSync(join(tmpdir(), "stories-python-entities-"));
  const file = join(directory, "entities.json");
  writeFileSync(file, JSON.stringify(entities), "utf8");
  return runPythonBuild(root, ["--entities-json", file, ...extraArguments]);
}
