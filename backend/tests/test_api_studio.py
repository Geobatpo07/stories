"""GET/POST /api/studio/documents, POST /api/studio/documents/{id}/publish and the new
GET /api/authoring/definitions, ported from app/api/studio/documents/route.test.ts (27) and
publish/route.test.ts (10, adapted: the filesystem write, local build and rollback are replaced by
the stubbed PublicationTarget, see authoring/workflow.py)."""

import json
from datetime import timedelta
from pathlib import Path

import pytest

from .api_support import NOW, RecordingPublication, make_harness

SESSION = "5" * 64
DOCS = "/api/studio/documents"
ID_A = "11111111-1111-4111-8111-111111111111"
ID_B = "22222222-2222-4222-8222-222222222222"
ID_C = "33333333-3333-4333-8333-333333333333"
CREATED = "2026-08-01T09:00:00.000Z"
REPO = Path(__file__).resolve().parents[2]


def signed_in(**kwargs):
    h = make_harness(**kwargs)
    h.fakes.seed_session(SESSION, NOW, NOW + timedelta(hours=1))
    return h


def draft(**overrides):
    body = {
        "id": ID_A,
        "kind": "software",
        "fields": {
            "title": "Research Tool",
            "slug": "research-tool",
            "description": "A research artifact.",
            "date": "2026-08-03",
            "status": "active",
            "tags": [],
        },
        "content": "Body text",
        "createdAt": CREATED,
    }
    body.update(overrides)
    return {key: value for key, value in body.items() if value is not None}


def get(h, url=DOCS, cookie=SESSION):
    return h.get(url, cookie=cookie)


def post(h, body, cookie=SESSION):
    return h.post(DOCS, body, cookie=cookie)


# ---- gates -------------------------------------------------------------------------------------


@pytest.mark.parametrize("flag", [None, "1", "TRUE", "false"])
def test_answers_404_in_production_unless_the_flag_is_exactly_true(flag):
    environ = {"STORIES_ENV": "production"}
    if flag is not None:
        environ["STORIES_STUDIO_ENABLED"] = flag
    h = signed_in(environ=environ)
    for response in (get(h), post(h, draft())):
        assert response.status_code == 404
        assert response.json() == {"error": "Not found"}


def test_is_enabled_in_production_with_the_flag_true():
    h = signed_in(environ={"STORIES_ENV": "production", "STORIES_STUDIO_ENABLED": "true"})
    assert get(h).status_code == 200


def test_checks_the_feature_flag_before_the_session():
    h = make_harness(environ={"STORIES_ENV": "production"})
    assert get(h, cookie=None).status_code == 404


def test_answers_401_without_a_session_cookie():
    h = make_harness()
    for response in (get(h, cookie=None), post(h, draft(), cookie=None)):
        assert response.status_code == 401
        assert response.json() == {"error": "Unauthorized"}


def test_answers_401_for_an_unknown_token():
    assert get(signed_in(), cookie="9" * 64).status_code == 401


def test_answers_401_for_an_expired_session_and_deletes_its_row():
    h = signed_in()
    h.clock.set(NOW + timedelta(hours=1))
    assert get(h).status_code == 401
    assert h.fakes.rows_of("auth", "auth-sessions") == {}


def test_checks_the_session_before_validating_the_body():
    h = make_harness()
    assert post(h, {"nonsense": True}, cookie=None).status_code == 401
    # even unparseable JSON never gets read without a session
    assert h.post(DOCS, raw="{oops").status_code == 401


# ---- GET ---------------------------------------------------------------------------------------


def test_get_answers_200_with_an_empty_list_when_nothing_is_stored():
    response = get(signed_in())
    assert response.status_code == 200
    assert response.json() == {"documents": []}


def test_get_lists_drafts_of_every_kind_newest_first_ties_broken_by_id():
    h = signed_in()
    h.clock.set(NOW.replace(hour=10))
    post(h, draft(id=ID_B, kind="note"))
    h.clock.set(NOW.replace(hour=11, minute=30))
    post(h, draft(id=ID_C))
    post(h, draft(id=ID_A, kind="dataset"))
    documents = get(h).json()["documents"]
    assert [(d["id"], d["kind"], d["updatedAt"]) for d in documents] == [
        (ID_A, "dataset", "2026-08-15T11:30:00.000Z"),
        (ID_C, "software", "2026-08-15T11:30:00.000Z"),
        (ID_B, "note", "2026-08-15T10:00:00.000Z"),
    ]


def test_get_lets_a_stored_row_that_fails_the_document_schema_escape():
    h = signed_in()
    h.fakes.put_row("knowledge", "software", ID_A, {"version": 2, "id": ID_A})
    with pytest.raises(Exception):  # noqa: B017 - pydantic ValidationError
        get(h)


# ---- POST validation ---------------------------------------------------------------------------

BROKEN = [
    ("id that is not a UUID", {"id": "not-a-uuid"}),
    ("missing id", {"id": None}),
    ("unknown kind", {"kind": "essay"}),
    ("fields that are not an object", {"fields": "title"}),
    ("missing content", {"content": None}),
    ("createdAt that is not an ISO datetime", {"createdAt": "yesterday"}),
    ("publicationState outside the enum", {"publicationState": "archived"}),
    ("publication with only a kind", {"publication": {"kind": "software"}}),
]


@pytest.mark.parametrize(("name", "override"), BROKEN, ids=[b[0] for b in BROKEN])
def test_post_answers_400_and_stores_nothing(name, override):
    h = signed_in()
    response = post(h, draft(**override))
    assert response.status_code == 400
    assert response.json() == {"error": "The draft payload is incomplete."}
    assert h.fakes.rows_of("knowledge") == {}


def test_post_lets_a_malformed_json_body_escape():
    h = signed_in()
    with pytest.raises(json.JSONDecodeError):
        h.post(DOCS, raw="{oops", cookie=SESSION)


# ---- POST saving -------------------------------------------------------------------------------


def test_post_answers_200_document_and_validation_and_stores_under_knowledge_kind_id():
    h = signed_in()
    response = post(h, draft())
    assert response.status_code == 200
    body = response.json()
    assert body["document"] == {
        "version": 1,
        "id": ID_A,
        "kind": "software",
        "publicationState": "draft",
        "fields": draft()["fields"],
        "content": "Body text",
        "createdAt": CREATED,
        "updatedAt": "2026-08-15T12:00:00.000Z",
    }
    assert body["validation"]["success"] is True
    assert body["validation"]["issues"] == []
    assert h.fakes.rows_of("knowledge") == {f"knowledge/software/{ID_A}": body["document"]}


def test_post_stores_a_partial_draft_and_reports_friendly_issues_instead_of_failing():
    h = signed_in()
    response = post(h, draft(id=ID_B, kind="note", fields={"title": "Early observation"}))
    assert response.status_code == 200
    validation = response.json()["validation"]
    assert validation["success"] is False
    assert [i["field"] for i in validation["issues"]] == [
        "description",
        "date",
        "noteType",
    ]  # slug was generated from the title
    assert all(i["message"] == "This field is required." for i in validation["issues"])
    assert list(h.fakes.rows_of("knowledge")) == [f"knowledge/note/{ID_B}"]


@pytest.mark.parametrize("slug", [None, ""])
def test_post_generates_the_slug_from_the_title_when_absent_or_empty(slug):
    h = signed_in()
    fields = {**draft()["fields"], "title": "My  Research Tool!"}
    fields.pop("slug")
    if slug is not None:
        fields["slug"] = slug
    document = post(h, draft(fields=fields)).json()["document"]
    assert document["fields"]["slug"] == "my-research-tool"


def test_post_keeps_a_slug_the_client_sent_verbatim():
    h = signed_in()
    fields = {**draft()["fields"], "slug": "Custom_Slug"}
    assert post(h, draft(fields=fields)).json()["document"]["fields"]["slug"] == "Custom_Slug"


@pytest.mark.parametrize("title", ["   ", 42])
def test_post_does_not_generate_a_slug_from_a_blank_or_non_string_title(title):
    h = signed_in()
    document = post(h, draft(fields={"description": "x", "title": title})).json()["document"]
    assert "slug" not in document["fields"]


def test_post_treats_an_empty_list_slug_as_present_like_javascript():
    h = signed_in()
    fields = {**draft()["fields"], "slug": []}
    assert post(h, draft(fields=fields)).json()["document"]["fields"]["slug"] == []


def test_post_keeps_the_original_created_at_and_publication_state_on_a_resave():
    h = signed_in()
    post(h, draft())
    h.clock.set(NOW.replace(minute=30))
    document = post(h, draft(createdAt="2030-01-01T00:00:00.000Z", content="v2")).json()["document"]
    assert document["createdAt"] == CREATED
    assert document["updatedAt"] == "2026-08-15T12:30:00.000Z"
    assert document["publicationState"] == "draft"
    assert document["content"] == "v2"
    assert len(h.fakes.rows_of("knowledge")) == 1


def test_post_trusts_a_client_supplied_publication_state_and_publication():
    h = signed_in()
    publication = {
        "kind": "software",
        "slug": "research-tool",
        "path": "content/software/research-tool.mdx",
        "publishedAt": "2026-08-02T00:00:00.000Z",
    }
    document = post(h, draft(publicationState="published", publication=publication)).json()[
        "document"
    ]
    assert document["publicationState"] == "published"
    assert document["publication"] == publication


def test_post_writes_only_into_the_knowledge_namespace_and_never_touches_auth_rows():
    h = signed_in()
    auth_before = h.fakes.rows_of("auth")
    post(h, draft())
    assert h.fakes.rows_of("auth") == auth_before


def test_post_strips_unknown_top_level_keys_and_does_not_validate_the_fields_beyond_the_record():
    h = signed_in()
    response = post(h, {**draft(), "extra": 1})
    assert response.status_code == 200
    assert "extra" not in response.json()["document"]


# ---- publish -----------------------------------------------------------------------------------

MDX = "\n".join(
    [
        "---",
        'title: "Research Tool"',
        'slug: "research-tool"',
        'description: "A research artifact."',
        'date: "2026-08-03"',
        'status: "active"',
        "tags: []",
        "---",
        "",
        "A reproducible research tool.",
        "",
    ]
)


def stored(**overrides):
    base = {
        "version": 1,
        "id": ID_A,
        "kind": "software",
        "publicationState": "draft",
        "fields": draft()["fields"],
        "content": "A reproducible research tool.",
        "createdAt": CREATED,
        "updatedAt": CREATED,
    }
    base.update(overrides)
    return base


def publish_url(id=ID_A):
    return f"/api/studio/documents/{id}/publish"


def publishing_harness(report=None, **kwargs):
    revalidated = []

    async def revalidate():
        revalidated.append(1)

    h = signed_in(
        publication=lambda fakes: RecordingPublication(fakes, report),
        revalidate=revalidate,
        **kwargs,
    )
    return h, revalidated


def test_publish_answers_404_when_the_studio_is_disabled_before_looking_at_the_session():
    h = make_harness(environ={"STORIES_ENV": "production"})
    response = h.post(publish_url())
    assert response.status_code == 404
    assert response.json() == {"error": "Not found"}


def test_publish_answers_401_without_a_session_and_publishes_nothing():
    h, revalidated = publishing_harness()
    h.fakes.put_row("knowledge", "software", ID_A, stored())
    response = h.post(publish_url())
    assert response.status_code == 401
    assert response.json() == {"error": "Unauthorized"}
    assert h.fakes.published == [] and revalidated == []


def test_publish_answers_422_when_the_draft_does_not_exist():
    h, revalidated = publishing_harness()
    response = h.post(publish_url(), cookie=SESSION)
    assert response.status_code == 422
    assert response.json() == {"error": "The draft could not be found."}
    assert revalidated == []


def test_publish_answers_422_with_field_message_pairs_when_the_draft_is_incomplete():
    h, _ = publishing_harness()
    h.fakes.put_row("knowledge", "software", ID_A, stored(fields={"title": "T", "slug": "t"}))
    response = h.post(publish_url(), cookie=SESSION)
    assert response.status_code == 422
    assert response.json() == {
        "error": "description: This field is required.; date: This field is required."
    }
    assert h.fakes.published == []


def test_publish_renders_the_exact_mdx_marks_the_draft_published_and_refreshes_the_site():
    h, revalidated = publishing_harness(report={"success": True, "entityCount": 1})
    h.fakes.put_row("knowledge", "software", ID_A, stored())
    response = h.post(publish_url(), cookie=SESSION)
    assert response.status_code == 200
    body = response.json()
    assert body["document"] == {
        **stored(),
        "publicationState": "published",
        "updatedAt": "2026-08-15T12:00:00.000Z",
        "publication": {
            "kind": "software",
            "slug": "research-tool",
            "path": "content/software/research-tool.mdx",
            "publishedAt": "2026-08-15T12:00:00.000Z",
        },
    }
    assert body["report"] == {"success": True, "entityCount": 1}
    [(rendered, previous)] = h.fakes.published
    assert rendered.relative_path == "content/software/research-tool.mdx"
    assert rendered.content == MDX
    assert previous is None
    assert h.fakes.rows_of("knowledge")[f"knowledge/software/{ID_A}"] == body["document"]
    assert revalidated == [1]


def test_publish_hands_the_previous_path_to_the_target_when_the_slug_changed():
    h, _ = publishing_harness()
    h.fakes.put_row(
        "knowledge",
        "software",
        ID_A,
        stored(
            publicationState="published",
            publication={
                "kind": "software",
                "slug": "old-name",
                "path": "content/software/old-name.mdx",
                "publishedAt": "2026-08-02T00:00:00.000Z",
            },
        ),
    )
    assert h.post(publish_url(), cookie=SESSION).status_code == 200
    assert h.fakes.published[0][1] == "content/software/old-name.mdx"


def test_publish_without_github_configuration_answers_422_and_leaves_the_draft_unchanged():
    h = signed_in()
    h.fakes.put_row("knowledge", "software", ID_A, stored())
    response = h.post(publish_url(), cookie=SESSION)
    assert response.status_code == 422
    assert response.json() == {
        "error": "GitHub publishing is not configured: "
        "set GITHUB_PUBLISH_TOKEN and GITHUB_REPOSITORY."
    }
    assert h.fakes.rows_of("knowledge")[f"knowledge/software/{ID_A}"] == stored()


def test_publish_when_the_target_fails_answers_422_saves_nothing_and_refreshes_nothing():
    class Failing:
        async def publish(self, rendered, previous_path):
            raise RuntimeError("GitHub rejected the commit")

    revalidated = []

    async def revalidate():
        revalidated.append(1)

    h = signed_in(publication=Failing(), revalidate=revalidate)
    h.fakes.put_row("knowledge", "software", ID_A, stored())
    response = h.post(publish_url(), cookie=SESSION)
    assert response.status_code == 422
    assert response.json() == {"error": "GitHub rejected the commit"}
    assert h.fakes.rows_of("knowledge")[f"knowledge/software/{ID_A}"] == stored()
    assert revalidated == []


def test_publish_succeeds_even_when_revalidation_fails_because_the_commit_already_happened(caplog):
    async def broken():
        raise RuntimeError("Next is down")

    h = signed_in(publication=lambda fakes: RecordingPublication(fakes), revalidate=broken)
    h.fakes.put_row("knowledge", "software", ID_A, stored())
    with caplog.at_level("ERROR", logger="stories.publish"):
        response = h.post(publish_url(), cookie=SESSION)
    assert response.status_code == 200
    assert (
        h.fakes.rows_of("knowledge")[f"knowledge/software/{ID_A}"]["publicationState"]
        == "published"
    )
    assert "Site revalidation failed" in caplog.text


def test_publish_refuses_a_recorded_publication_path_that_leaves_the_project_root():
    h, revalidated = publishing_harness()
    h.fakes.put_row(
        "knowledge",
        "software",
        ID_A,
        stored(
            publication={
                "kind": "software",
                "slug": "x",
                "path": "../escape.mdx",
                "publishedAt": "2026-08-02T00:00:00.000Z",
            }
        ),
    )
    response = h.post(publish_url(), cookie=SESSION)
    assert response.status_code == 422
    assert response.json() == {"error": "Publication path leaves the project root."}
    assert h.fakes.published == [] and revalidated == []


def test_publish_validates_relationships_against_published_drafts_with_the_generic_message():
    # TS quirk kept: its friendly-message regex never matches the Kernel's real error text.
    h, _ = publishing_harness()
    fields = {
        "title": "Q",
        "slug": "q",
        "description": "d",
        "date": "2026-08-03",
        "programSlug": "missing-program",
    }
    h.fakes.put_row("knowledge", "question", ID_B, stored(id=ID_B, kind="question", fields=fields))
    response = h.post(publish_url(ID_B), cookie=SESSION)
    assert response.status_code == 422
    assert response.json() == {
        "error": "relationships: Review the selected relationships before publishing."
    }


# ---- GET /api/authoring/definitions ------------------------------------------------------------


def test_definitions_are_gated_like_the_studio_404_then_401():
    off = make_harness(environ={"STORIES_ENV": "production"})
    assert off.get("/api/authoring/definitions", cookie=SESSION).status_code == 404
    h = make_harness()
    response = h.get("/api/authoring/definitions")
    assert response.status_code == 401
    assert response.json() == {"error": "Unauthorized"}


def test_definitions_serve_exactly_the_committed_typescript_definitions():
    h = signed_in()
    response = h.get("/api/authoring/definitions", cookie=SESSION)
    assert response.status_code == 200
    expected = json.loads((REPO / "fixtures/authoring-contract/definitions.json").read_text("utf8"))
    assert response.json() == expected
