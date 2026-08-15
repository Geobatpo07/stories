import type { BuildReport } from "./types";

/**
 * Human-readable rendering of a `BuildReport`. Used both by `build/cli.ts`
 * (`pnpm build:knowledge` output) and by `authoring/workflow.ts` to compose
 * the error message shown when a publication's build fails.
 */
export function renderReport(report: BuildReport): string {
  const lines: string[] = [
    report.success ? "Build succeeded." : "Build failed.",
    `Entities: ${report.entityCount}  Relationships: ${report.relationshipCount}  Elapsed: ${report.elapsedMs}ms`,
  ];

  const kinds = Object.keys(report.countsByKind).sort();
  if (kinds.length > 0) {
    lines.push("By kind:");
    for (const kind of kinds) {
      lines.push(`  ${kind}: ${report.countsByKind[kind]}`);
    }
  }

  if (report.targetResults.length > 0) {
    lines.push("Targets:");
    for (const target of report.targetResults) {
      lines.push(
        `  ${target.success ? "✓" : "✗"} ${target.name} (${target.durationMs}ms) — ${target.message}`,
      );
    }
  }

  if (report.validationIssues.length > 0) {
    lines.push("Validation issues:");
    for (const issue of report.validationIssues) {
      lines.push(`  - [${issue.check}] ${issue.message}`);
    }
  }

  return lines.join("\n");
}
