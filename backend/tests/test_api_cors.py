"""CORS for the browser-side Studio editor (frontend repoint): a different origin must be listed in
STUDIO_ALLOWED_ORIGINS, credentials are allowed, a wildcard is never honoured."""

from datetime import timedelta

import httpx

from .api_support import NOW, Harness, make_harness

ORIGIN = "http://localhost:3000"
SESSION = "5" * 64


def preflight(h: Harness, origin: str = ORIGIN) -> httpx.Response:
    response: httpx.Response = h.client.options(
        "/api/studio/documents",
        headers={
            "origin": origin,
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type",
        },
    )
    return response


def test_listed_origin_gets_a_credentialed_preflight_answer() -> None:
    response = preflight(make_harness(environ={"STUDIO_ALLOWED_ORIGINS": ORIGIN}))
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "content-type" in response.headers["access-control-allow-headers"].lower()


def test_unlisted_origin_gets_no_allow_origin_header() -> None:
    h = make_harness(environ={"STUDIO_ALLOWED_ORIGINS": ORIGIN})
    assert "access-control-allow-origin" not in preflight(h, "https://evil.example").headers


def test_without_configuration_no_cors_headers_are_sent() -> None:
    h = make_harness()
    assert "access-control-allow-origin" not in preflight(h).headers


def test_wildcard_is_never_honoured_with_credentials() -> None:
    h = make_harness(environ={"STUDIO_ALLOWED_ORIGINS": "*"})
    assert "access-control-allow-origin" not in preflight(h).headers


def test_actual_request_from_a_listed_origin_carries_the_header_and_still_needs_a_session() -> None:
    h = make_harness(environ={"STUDIO_ALLOWED_ORIGINS": f"https://a.example, {ORIGIN}"})
    unauthorised = h.client.get("/api/studio/documents", headers={"origin": ORIGIN})
    assert unauthorised.status_code == 401
    assert unauthorised.headers["access-control-allow-origin"] == ORIGIN

    h.fakes.seed_session(SESSION, NOW, NOW + timedelta(hours=1))
    ok = h.client.get(
        "/api/studio/documents",
        headers={"origin": ORIGIN, "cookie": f"stories_studio_session={SESSION}"},
    )
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == ORIGIN
