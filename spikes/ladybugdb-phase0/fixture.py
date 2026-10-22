"""Hand-written fixture shaped like the Kernel's resolved KnowledgeEntity[].

`metadata` holds tags + kind-specific fields (what extractFullMetadata() returns).
`relationships` are already-resolved edges (source = this entity).
"""


def _e(kind, slug, title, status="published", date="2026-01-01", metadata=None, rels=()):
    return {
        "id": f"{kind}:{slug}",
        "kind": kind,
        "slug": slug,
        "title": title,
        "summary": f"Summary of {title}",
        "status": status,
        "created_at": date,
        "updated_at": date,
        "content": f"# {title}\n\nBody text for {title}. Accents: é à ü — “quotes”.",
        "file_path": f"content/{kind}s/{slug}.mdx",
        "metadata": metadata or {"tags": []},
        "relationships": [
            {"field": f, "cardinality": c, "target_id": t} for (f, c, t) in rels
        ],
    }


ENTITIES = [
    _e("program", "lab", "Laboratory", date="2026-01-01",
       metadata={"tags": ["science"], "theme": "core"},
       rels=[("relatedQuestionSlugs", "many", "question:q1"),
             ("relatedQuestionSlugs", "many", "question:q2")]),
    _e("program", "sandbox", "Sandbox", status="draft", date="2026-01-02",
       metadata={"tags": []}),
    _e("question", "q1", "Why does X happen?", date="2026-01-03",
       metadata={"tags": ["x"], "programSlug": "lab"},
       rels=[("programSlug", "one", "program:lab")]),
    _e("question", "q2", "Does Y scale?", date="2026-01-04",
       metadata={"tags": [], "programSlug": "lab"},
       rels=[("programSlug", "one", "program:lab")]),
    _e("hypothesis", "h1", "X is caused by A", date="2026-01-05",
       metadata={"tags": ["a"], "questionSlug": "q1", "confidence": 0.6},
       rels=[("questionSlug", "one", "question:q1")]),
    _e("hypothesis", "h2", "X is caused by B", date="2026-01-06",
       metadata={"tags": ["b"], "questionSlug": "q1"},
       rels=[("questionSlug", "one", "question:q1")]),
    _e("hypothesis", "h3", "Y scales linearly", date="2026-01-07",
       metadata={"tags": [], "questionSlug": "q2"},
       rels=[("questionSlug", "one", "question:q2")]),
    _e("note", "n1", "Field note", date="2026-01-08",
       metadata={"tags": ["field"], "noteType": "observation", "programSlug": "lab"},
       rels=[("relatedQuestionSlugs", "many", "question:q1"),
             ("relatedQuestionSlugs", "many", "question:q2"),
             ("programSlug", "one", "program:lab")]),
]
