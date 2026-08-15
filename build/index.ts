/**
 * The Knowledge Artifact Pipeline's sole public entry point. Internals
 * (`build/targets`, `build/duckdb`, `build/version.ts`) are not re-exported
 * and must not be imported directly from outside `build/`. See
 * build/README.md for the full contract.
 */
export { runBuildPipeline } from "./pipeline";
export { renderReport } from "./report";
export type {
  BuildArtifactRef,
  BuildPipelineOptions,
  BuildPipelineResult,
  BuildReport,
  BuildTargetOutcome,
  BuildValidationIssue,
} from "./types";
