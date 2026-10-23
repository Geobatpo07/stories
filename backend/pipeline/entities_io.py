"""Entity <-> JSON interchange, in the exact shape the TypeScript `KnowledgeEntity` serializes to.

The only consumer is the CLI's `--entities-json` mode (used by the TypeScript round-trip test to
hand its fixture entities to the Python producer); the normal path loads straight from `content/`.
"""

from typing import Any

from kernel.types import KnowledgeEntity, Relationship, ResolvedRef

_BASE_KEYS = frozenset(
    {
        "id",
        "kind",
        "slug",
        "title",
        "summary",
        "status",
        "createdAt",
        "updatedAt",
        "metadata",
        "relationships",
        "content",
        "filePath",
    }
)


def entity_from_dict(data: dict[str, Any]) -> KnowledgeEntity:
    return KnowledgeEntity(
        id=data["id"],
        kind=data["kind"],
        slug=data["slug"],
        title=data["title"],
        summary=data["summary"],
        status=data["status"],
        created_at=data["createdAt"],
        updated_at=data["updatedAt"],
        metadata=dict(data["metadata"]),
        relationships=tuple(
            Relationship(
                r["field"],
                r["cardinality"],
                ResolvedRef(
                    r["target"]["id"],
                    r["target"]["kind"],
                    r["target"]["slug"],
                    r["target"]["title"],
                ),
            )
            for r in data["relationships"]
        ),
        content=data["content"],
        file_path=data["filePath"],
        extra={k: v for k, v in data.items() if k not in _BASE_KEYS},
    )
