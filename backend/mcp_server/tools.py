"""The four Studio operations as MCP tools: a thin translation layer over `AuthoringWorkflow`.

A driving adapter like `api/app.py`: no validation or publication rule lives here. Trust boundary
is "who may launch this process" (see README.md), so there is no session, token or Studio flag.

What the HTTP routes do around the workflow, and this adapter therefore repeats (three small
orchestration steps, no rules): validating the payload with the route's own `DraftBody`, deriving
the slug from the title (`_js_falsy` is app.py's, imported rather than copied), and calling the
site-revalidation hook after a publication, never letting it decide the outcome.
"""

import logging
import uuid
from typing import Any

from pydantic import ValidationError

from api.app import _js_falsy
from api.bodies import DraftBody
from api.deps import AppDependencies
from authoring.definitions import list_authoring_definitions
from authoring.renderer import MDXRenderer, js_trim
from authoring.repository import KnowledgeObjectRepository
from authoring.workflow import AuthoringWorkflow
from runtime.clock import iso_millis

logger = logging.getLogger("stories.publish")
JsonObject = dict[str, Any]


class ToolFailure(Exception):
    """An anticipated refusal; the server reports it as an MCP tool error with this message."""


class StudioTools:
    def __init__(self, deps: AppDependencies) -> None:
        self._clock = deps.clock
        self._revalidate = deps.revalidate
        self._drafts = KnowledgeObjectRepository(deps.knowledge_persistence)
        self._authoring = AuthoringWorkflow(
            self._drafts, MDXRenderer(), deps.clock, deps.publication
        )

    def definitions(self) -> list[JsonObject]:
        """GET /api/authoring/definitions."""
        return list_authoring_definitions()

    async def documents(self) -> JsonObject:
        """GET /api/studio/documents."""
        return {"documents": [d.to_row() for d in await self._drafts.list()]}

    async def save_draft(
        self,
        kind: str,
        fields: JsonObject,
        content: str,
        id: str | None = None,
        created_at: str | None = None,
    ) -> JsonObject:
        """POST /api/studio/documents. A draft that fails validation is still stored, exactly as
        the Studio does, and comes back with `valid: false` and the friendly issues."""
        try:
            draft = DraftBody.model_validate(
                {
                    "id": id or str(uuid.uuid4()),
                    "kind": kind,
                    "fields": fields,
                    "content": content,
                    "createdAt": created_at or iso_millis(self._clock.now()),
                }
            )
        except ValidationError as error:
            details = "; ".join(
                f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in error.errors()
            )
            raise ToolFailure(f"The draft payload is incomplete. {details}") from error
        payload = draft.model_dump(exclude_none=True)
        merged = dict(payload["fields"])
        title = merged.get("title")
        if _js_falsy(merged.get("slug")) and isinstance(title, str) and js_trim(title):
            merged["slug"] = self._authoring.slug_from_title(title)
        saved = await self._authoring.save_draft({**payload, "fields": merged})
        validation = saved["validation"]
        return {
            "saved": True,
            "valid": validation["success"],
            "issues": validation["issues"],
            "document": saved["document"].to_row(),
        }

    async def publish(self, id: str) -> JsonObject:
        """POST /api/studio/documents/{id}/publish (the Phase 4 GitHub path, revalidated)."""
        try:
            result = await self._authoring.publish(id)
        except Exception as error:  # the route turns every failure into 422
            raise ToolFailure(str(error) or "Publication failed.") from error
        report = result["report"]
        body: JsonObject = {"document": result["document"].to_row(), "report": report}
        if isinstance(report, dict) and "deployment" in report:
            body["deployment"] = report["deployment"]
        try:
            await self._revalidate()
        except Exception:  # the commit already happened
            logger.exception("Site revalidation failed after a successful publication")
        return body
