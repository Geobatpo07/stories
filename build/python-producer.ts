import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Opt-in Python knowledge-artifact producer (ADR-004 Phase 3), selected with
 * `STORIES_BUILD_PRODUCER=python`. Dev/CI validation only: production (`vercel.json`) sets no
 * variable and therefore keeps the TypeScript producer.
 *
 * Runs `python -m pipeline.cli --root <root>` from `backend/`, which writes the same
 * `database/generated/{knowledge.duckdb,manifest.json}` the TypeScript targets write.
 */
export type BuildProducer = "typescript" | "python";

export function selectedProducer(environment: NodeJS.ProcessEnv = process.env): BuildProducer {
  const value = environment.STORIES_BUILD_PRODUCER;
  if (value === undefined || value === "" || value === "typescript") return "typescript";
  if (value === "python") return "python";
  throw new Error(
    `STORIES_BUILD_PRODUCER must be "typescript" or "python" (got "${value}"). Unset it for the default.`,
  );
}

function pythonExecutable(backend: string, environment: NodeJS.ProcessEnv): string {
  if (environment.STORIES_PYTHON) return environment.STORIES_PYTHON;
  for (const candidate of [
    join(backend, ".venv", "Scripts", "python.exe"),
    join(backend, ".venv", "bin", "python"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "STORIES_BUILD_PRODUCER=python needs a Python interpreter with the backend installed: " +
      "set STORIES_PYTHON, or run `uv sync --frozen` in backend/ to create backend/.venv.",
  );
}

/** Returns the Python process's exit code (non-zero on any failure, including duplicate ids). */
export function runPythonProducer(
  rootDirectory: string = process.cwd(),
  environment: NodeJS.ProcessEnv = process.env,
): number {
  const backend = resolve(dirname(fileURLToPath(import.meta.url)), "../backend");
  const python = pythonExecutable(backend, environment);
  const completed = spawnSync(python, ["-m", "pipeline.cli", "--root", resolve(rootDirectory)], {
    cwd: backend,
    stdio: "inherit",
    env: { ...environment, PYTHONIOENCODING: "utf-8" },
  });
  if (completed.error) throw completed.error;
  // A signal-killed child has no status: treat it as a failure rather than success.
  return completed.status ?? 1;
}
