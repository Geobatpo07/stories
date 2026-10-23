"""Port of authoring/workflow.ts, minus the two steps that move to the next phase.

Ported as-is: `slug_from_title`, `save_draft`, `validate` (including the quirk below) and the
validation / rendering / path-guard half of `publish`. NOT ported here, on purpose:

  * the filesystem write + local build + `restore()` rollback of `AuthoringWorkflow.publish`:
    the Python service has no writable project root. Publication goes through a
    `PublicationTarget` (`publication/github.py`: validate the build first, then one atomic
    GitHub commit, so there is nothing to roll back);
  * `revalidatePath` / cache resets, which the API layer calls through a hook
    (`publication/revalidate.py`).

Quirk kept on purpose: the TypeScript `friendlyRelationshipMessage` looks for the text
`field "x" points to missing target "y"`, but the Kernel's real error says `has a dangling
reference in "x": target "y" does not exist`, so the regex never matches and the user always gets
the generic message. Fixing it would be a deliberate behaviour change; it is flagged, not folded in.
"""

import posixpath
import re
from collections.abc import Sequence
from typing import Any, Protocol

from runtime.clock import iso_millis
from runtime.ports import ClockPort

from .definitions import materialize_authoring_objects, validate_authoring_fields
from .repository import KnowledgeObjectRepository
from .types import AuthoringDocument, KnowledgeRenderer, Publication, RenderedDocument

PROJECT_ROOT = "/project"
JsonObject = dict[str, Any]


class PublicationTarget(Protocol):
    """Where a validated, rendered document goes. Returns the build/publication report."""

    async def publish(
        self, rendered: RenderedDocument, previous_path: str | None
    ) -> JsonObject: ...


def normalize_slug(text: str) -> str:
    """`IdentifierService.normalizeSlug`."""
    from .renderer import js_trim

    lowered = js_trim(text).lower()
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", lowered))


def friendly_relationship_message(error: BaseException) -> str:
    message = str(error)
    match = re.search(r'field "([^"]+)" points to missing target "([^"]+)"', message)
    if match:
        return f"Choose a published {match.group(2).split(':')[0]} record for {match.group(1)}."
    return "Review the selected relationships before publishing."


def publication_path(relative_path: str) -> str:
    """Resolves inside the project root or raises, like `AuthoringWorkflow.publicationPath`."""
    resolved = posixpath.normpath(posixpath.join(PROJECT_ROOT, relative_path))
    if not resolved.startswith(f"{PROJECT_ROOT}/"):
        raise ValueError("Publication path leaves the project root.")
    return resolved


class AuthoringWorkflow:
    def __init__(
        self,
        repository: KnowledgeObjectRepository,
        renderer: KnowledgeRenderer,
        clock: ClockPort,
        publication: PublicationTarget,
    ) -> None:
        self._repository = repository
        self._renderer = renderer
        self._clock = clock
        self._publication = publication

    def slug_from_title(self, title: str) -> str:
        return normalize_slug(title)

    async def save_draft(self, draft: JsonObject) -> JsonObject:
        """`draft` is the validated request payload; returns `{document, validation}`."""
        existing = await self._repository.find(draft["id"])
        now = iso_millis(self._clock.now())
        publication = draft.get("publication") or (existing.publication if existing else None)
        attributes: JsonObject = {
            "version": 1,
            "id": draft["id"],
            "kind": draft["kind"],
            "publicationState": draft.get("publicationState")
            or (existing.publicationState if existing else "draft"),
            "fields": dict(draft["fields"]),
            "content": draft["content"],
            "createdAt": existing.createdAt if existing else draft["createdAt"],
            "updatedAt": now,
        }
        if publication is not None:  # an explicit None would be rejected, like Zod's null
            attributes["publication"] = publication
        document = AuthoringDocument(**attributes)
        await self._repository.save(document)
        validation = self.validate(document, await self._repository.list())
        return {"document": document, "validation": validation}

    def validate(
        self, document: AuthoringDocument, all_documents: Sequence[AuthoringDocument]
    ) -> JsonObject:
        field_validation = validate_authoring_fields(document.kind, document.fields)
        if not field_validation["success"]:
            return {"success": False, "issues": field_validation["issues"]}
        try:
            publishable = [
                {"kind": item.kind, "fields": item.fields, "content": item.content}
                for item in all_documents
                if item.publicationState == "published" and item.id != document.id
            ] + [
                {
                    "kind": document.kind,
                    "fields": field_validation["data"],
                    "content": document.content,
                }
            ]
            materialize_authoring_objects(publishable)
            return {
                "success": True,
                "issues": [],
                "normalizedFields": field_validation["data"],
            }
        except Exception as error:  # the TypeScript catch is deliberately total
            return {
                "success": False,
                "issues": [
                    {"field": "relationships", "message": friendly_relationship_message(error)}
                ],
            }

    async def publish(self, id: str) -> JsonObject:
        """Everything up to the commit; the commit itself is the stubbed `PublicationTarget`."""
        document = await self._repository.find(id)
        if document is None:
            raise ValueError("The draft could not be found.")
        all_documents = await self._repository.list()
        validation = self.validate(document, all_documents)
        if not validation["success"] or "normalizedFields" not in validation:
            raise ValueError(
                "; ".join(f"{i['field']}: {i['message']}" for i in validation["issues"])
            )
        normalized = document.model_copy(update={"fields": validation["normalizedFields"]})
        rendered = await self._renderer.render(normalized)
        publication_path(rendered.relative_path)
        previous = document.publication.path if document.publication else None
        if previous:
            publication_path(previous)

        report = await self._publication.publish(rendered, previous)

        now = iso_millis(self._clock.now())
        published = normalized.model_copy(
            update={
                "publicationState": "published",
                "updatedAt": now,
                "publication": Publication(
                    kind=document.kind,
                    slug=str(validation["normalizedFields"]["slug"]),
                    path=rendered.relative_path.replace("\\", "/"),
                    publishedAt=now,
                ),
            }
        )
        await self._repository.save(published)
        return {"document": published, "report": report}
