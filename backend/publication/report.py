"""Port of build/report.ts `renderReport`: the human-readable build report that the TypeScript
publish() put into its "Publication validation failed." error. Same lines, same characters."""

from typing import Any


def render_report(report: dict[str, Any]) -> str:
    lines = [
        "Build succeeded." if report["success"] else "Build failed.",
        f"Entities: {report['entityCount']}  Relationships: {report['relationshipCount']}  "
        f"Elapsed: {report['elapsedMs']}ms",
    ]
    counts: dict[str, int] = report["countsByKind"]
    if counts:
        lines.append("By kind:")
        # Object.keys(...).sort(): UTF-16 order; kind names are ASCII.
        lines.extend(f"  {kind}: {counts[kind]}" for kind in sorted(counts))
    if report["targetResults"]:
        lines.append("Targets:")
        for target in report["targetResults"]:
            mark = "✓" if target["success"] else "✗"
            lines.append(
                f"  {mark} {target['name']} ({target['durationMs']}ms) — {target['message']}"
            )
    if report["validationIssues"]:
        lines.append("Validation issues:")
        lines.extend(f"  - [{i['check']}] {i['message']}" for i in report["validationIssues"])
    return "\n".join(lines)
