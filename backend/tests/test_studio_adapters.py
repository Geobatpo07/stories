"""Supabase and Resend adapters, ported from runtime/adapters/supabase-persistence-adapter.test.ts
(7) over `httpx.MockTransport`. They pin the request SHAPE (URL, headers, body); how a real
PostgREST / Resend server answers cannot be observed without those services."""

import asyncio
import json

import httpx
import pytest

from runtime.ports import EmailMessage
from runtime.resend import ResendEmailAdapter
from runtime.supabase import SupabasePersistenceAdapter


def adapter_with(response: httpx.Response, namespace="auth", url="https://x.supabase.co"):
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return response

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return SupabasePersistenceAdapter(url, "service-role-key", namespace, client), calls


def test_never_throws_at_construction_even_with_an_empty_url_and_key():
    SupabasePersistenceAdapter("", "", "auth")


def test_save_upserts_via_post_with_the_merge_duplicates_prefer_header():
    adapter, calls = adapter_with(httpx.Response(204))
    asyncio.run(adapter.save("admin", "the-id", {"email": "a@example.com"}))
    [request] = calls
    assert str(request.url) == "https://x.supabase.co/rest/v1/persistence_records"
    assert request.method == "POST"
    assert request.headers["apikey"] == "service-role-key"
    assert request.headers["authorization"] == "Bearer service-role-key"
    assert request.headers["prefer"] == "resolution=merge-duplicates,return=minimal"
    body = json.loads(request.content)
    assert {k: body[k] for k in ("namespace", "collection", "id", "value")} == {
        "namespace": "auth",
        "collection": "admin",
        "id": "the-id",
        "value": {"email": "a@example.com"},
    }
    assert isinstance(body["updated_at"], str) and body["updated_at"].endswith("Z")


def test_load_returns_the_stored_value_or_none_when_no_row_matches():
    adapter, calls = adapter_with(httpx.Response(200, json=[{"value": {"email": "a@example.com"}}]))
    assert asyncio.run(adapter.load("admin", "the-id")) == {"email": "a@example.com"}
    url = str(calls[0].url)
    for part in ("namespace=eq.auth", "collection=eq.admin", "id=eq.the-id", "select=value"):
        assert part in url
    empty, _ = adapter_with(httpx.Response(200, json=[]))
    assert asyncio.run(empty.load("admin", "missing")) is None


def test_list_maps_every_rows_value_in_the_order_returned():
    adapter, calls = adapter_with(
        httpx.Response(200, json=[{"value": {"id": 1}}, {"value": {"id": 2}}]),
        namespace="knowledge",
    )
    assert asyncio.run(adapter.list("program")) == [{"id": 1}, {"id": 2}]
    url = str(calls[0].url)
    for part in ("namespace=eq.knowledge", "collection=eq.program", "order=id.asc"):
        assert part in url


def test_delete_issues_a_delete_scoped_to_namespace_collection_and_id():
    adapter, calls = adapter_with(httpx.Response(204))
    asyncio.run(adapter.delete("auth-sessions", "token-123"))
    assert calls[0].method == "DELETE"
    assert "collection=eq.auth-sessions" in str(calls[0].url)
    assert "id=eq.token-123" in str(calls[0].url)


def test_throws_a_descriptive_error_on_a_non_2xx_response():
    adapter, _ = adapter_with(httpx.Response(404, text="relation does not exist"))
    with pytest.raises(RuntimeError, match=r"404.*relation does not exist"):
        asyncio.run(adapter.load("admin", "the-id"))


def test_ids_are_percent_encoded_like_encode_uri_component():
    adapter, calls = adapter_with(httpx.Response(200, json=[]))
    asyncio.run(adapter.load("a b", "x/y?z&é"))
    assert "collection=eq.a%20b" in str(calls[0].url)
    assert "id=eq.x%2Fy%3Fz%26%C3%A9" in str(calls[0].url)


def test_a_trailing_slash_on_the_project_url_is_dropped_once():
    adapter, calls = adapter_with(httpx.Response(200, json=[]), url="https://x.supabase.co/")
    asyncio.run(adapter.list("c"))
    assert str(calls[0].url).startswith("https://x.supabase.co/rest/v1/persistence_records?")


def test_resend_posts_the_message_as_json_and_raises_on_a_rejection():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(403, text="domain not verified")

    adapter = ResendEmailAdapter(
        "re_key", "studio@stories.test", httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    message = EmailMessage(to="a@b.test", subject="s", text="t", html="<p>h</p>")
    with pytest.raises(
        RuntimeError, match=r"Resend rejected the email \(403\): domain not verified"
    ):
        asyncio.run(adapter.send(message))
    [request] = seen
    assert str(request.url) == "https://api.resend.com/emails"
    assert request.headers["authorization"] == "Bearer re_key"
    assert json.loads(request.content) == {
        "from": "studio@stories.test",
        "to": ["a@b.test"],
        "subject": "s",
        "text": "t",
        "html": "<p>h</p>",
    }
