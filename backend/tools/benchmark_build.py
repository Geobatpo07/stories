"""Rough rebuild-time benchmark (ADR-004 Phase 6 asks for one): synthetic entities, full pipeline.

    PYTHONPATH=. python tools/benchmark_build.py [entity counts ...]

Synthetic shape: programs <- questions <- hypotheses, plus notes pointing at programs, ~2.4 edges
per entity. Content bodies are ~2 KB. Timings are wall clock on whatever machine runs it.
"""

import sys
import tempfile
import time
from pathlib import Path

from kernel.types import KnowledgeEntity, Relationship, ResolvedRef
from pipeline.build import run_build_pipeline


def synthetic(count: int) -> list[KnowledgeEntity]:
    programs = max(1, count // 20)
    questions = count // 4
    ids: dict[str, KnowledgeEntity] = {}

    def make(kind: str, slug: str, rels: tuple[Relationship, ...], extra: dict) -> KnowledgeEntity:
        return KnowledgeEntity(
            id=f"{kind}:{slug}", kind=kind, slug=slug, title=f"{kind} {slug}", summary="s",
            status="active", created_at=f"2026-{(len(ids) % 12) + 1:02d}-01", updated_at="2026-01-01",
            metadata={"tags": ["t"], **extra}, relationships=rels,
            content="lorem ipsum " * 170, file_path=f"content/{kind}s/{slug}.mdx", extra=extra,
        )

    def ref(e: KnowledgeEntity) -> ResolvedRef:
        return ResolvedRef(e.id, e.kind, e.slug, e.title)

    out: list[KnowledgeEntity] = []
    progs = []
    for i in range(programs):
        e = make("program", f"p{i}", (), {"theme": "t", "leadResearcher": "l"})
        progs.append(e)
        out.append(e)
    qs = []
    for i in range(questions):
        parent = progs[i % programs]
        e = make("question", f"q{i}", (Relationship("programSlug", "one", ref(parent)),), {"programSlug": parent.slug})
        qs.append(e)
        out.append(e)
    i = 0
    while len(out) < count:
        parent = qs[i % questions]
        extra_parent = progs[(i * 7) % programs]
        out.append(make("note", f"n{i}", (
            Relationship("programSlug", "one", ref(extra_parent)),
            Relationship("relatedQuestionSlugs", "many", ref(parent)),
        ), {"noteType": "essay"}))
        i += 1
    return out


def main() -> None:
    counts = [int(a) for a in sys.argv[1:]] or [100, 1000, 5000]
    for count in counts:
        entities = synthetic(count)
        with tempfile.TemporaryDirectory() as tmp:
            started = time.perf_counter()
            result = run_build_pipeline(Path(tmp), entities=entities)
            total = time.perf_counter() - started
            stages = {t.name: t.durationMs for t in result.report.targetResults}
        edges = sum(len(e.relationships) for e in entities)
        print(f"{count:>6} entities {edges:>6} edges  total {total * 1000:>7.0f} ms  stages(ms) {stages}  ok={result.success}")


if __name__ == "__main__":
    main()
