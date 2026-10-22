"""`python -m pipeline.cli`: build the knowledge artifact.

    python -m pipeline.cli --root <project root>            load <root>/content
    python -m pipeline.cli --root <dir> --entities-json f   use entities serialized from TypeScript

Prints the build report as JSON on stdout; exits non-zero when the build fails, with the reasons
(which name the offending files) on stderr.
"""

import argparse
import json
import sys
from pathlib import Path

from .build import run_build_pipeline
from .entities_io import entity_from_dict


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pipeline.cli")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="project root (holds content/)")
    parser.add_argument("--entities-json", type=Path, help="serialized KnowledgeEntity[] instead of content/")
    parser.add_argument("--no-search-index", action="store_true", help="skip the knowledge_search_* tables")
    args = parser.parse_args(argv)

    entities = None
    if args.entities_json is not None:
        raw = json.loads(args.entities_json.read_text(encoding="utf-8"))
        entities = [entity_from_dict(item) for item in raw]

    result = run_build_pipeline(
        args.root, entities=entities, include_search_index=not args.no_search_index
    )
    print(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
    if not result.success:
        for issue in result.report.validationIssues:
            print(f"[{issue['check']}] {issue['message']}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
