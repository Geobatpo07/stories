/**
 * Public shapes for the Knowledge Artifact Pipeline. `BuildPipelineResult`
 * and `BuildReport` are consumed by `authoring/workflow.ts` (`AuthoringWorkflow.publish()`)
 * and must never change shape without updating that caller and its test.
 */

export interface BuildArtifactRef {
  readonly file: string;
  readonly checksum: string;
}

export interface BuildTargetOutcome {
  readonly name: string;
  readonly success: boolean;
  readonly message: string;
  readonly durationMs: number;
  /** Key under which this target published an artifact to the shared context, if any. */
  readonly artifactKey?: string;
}

export interface BuildValidationIssue {
  readonly check: string;
  readonly message: string;
}

export interface BuildReport {
  readonly countsByKind: Readonly<Record<string, number>>;
  readonly entityCount: number;
  readonly relationshipCount: number;
  readonly targetResults: readonly BuildTargetOutcome[];
  readonly validationIssues: readonly BuildValidationIssue[];
  readonly elapsedMs: number;
  readonly success: boolean;
}

export interface BuildPipelineResult {
  readonly success: boolean;
  readonly report: BuildReport;
}

export interface BuildPipelineOptions {
  /** Defaults to `process.cwd()`. Artifacts are written under `<rootDirectory>/database/generated`. */
  readonly rootDirectory?: string;
}
