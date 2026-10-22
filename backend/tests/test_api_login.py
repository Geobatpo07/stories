"""POST /api/auth/login, ported from app/api/auth/login/route.test.ts (31 tests).

Real FastAPI route and real workflow; only Supabase, Resend and the clock are fakes. The assertions
are the TypeScript ones, including the quirks the Phase 4 audit decided to keep.
"""

import asyncio
import json
import re
from datetime import timedelta

import pytest

from api.deps import build_default_dependencies
from auth.passwords import verify_password

from .api_support import ADMIN_EMAIL, ADMIN_PASSWORD, NOW, make_harness

URL = "/api/auth/login"
TTL_12H = "Sun, 16 Aug 2026 00:00:00 GMT"
ADMIN_IP = "198.51.100.7"
ATTACKER_IP = "203.0.113.66"


def good(h, ip="203.0.113.1"):
    return h.post(URL, {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, ip=ip)


def bad(h, ip=ATTACKER_IP, email=ADMIN_EMAIL):
    return h.post(URL, {"email": email, "password": "wrong"}, ip=ip)


# ---- success -----------------------------------------------------------------------------------


def test_answers_200_and_sets_exactly_one_session_cookie():
    h = make_harness()
    response = good(h)
    assert response.status_code == 200
    assert response.json() == {"success": True}
    assert len(h.set_cookies(response)) == 1


def test_serializes_the_cookie_as_httponly_samesite_lax_path_expiring_12h_after_login():
    h = make_harness()
    [header] = h.set_cookies(good(h))
    assert re.fullmatch(
        rf"stories_studio_session=[0-9a-f]{{64}}; Path=/; Expires={TTL_12H}; "
        rf"HttpOnly; SameSite=lax",
        header,
    )


def test_adds_secure_only_in_production_and_before_httponly():
    h = make_harness(environ={"STORIES_ENV": "production"})
    [header] = h.set_cookies(good(h))
    assert re.fullmatch(
        rf"stories_studio_session=[0-9a-f]{{64}}; Path=/; Expires={TTL_12H}; "
        rf"Secure; HttpOnly; SameSite=lax",
        header,
    )


def test_persists_one_session_row_whose_id_token_and_cookie_value_are_the_same_64_hex_string():
    h = make_harness()
    response = good(h)
    sessions = h.fakes.rows_of("auth", "auth-sessions")
    [(row_key, row)] = sessions.items()
    token = row_key.removeprefix("auth/auth-sessions/")
    assert re.fullmatch(r"[0-9a-f]{64}", token)
    assert row == {
        "token": token,
        "createdAt": "2026-08-15T12:00:00.000Z",
        "expiresAt": "2026-08-16T00:00:00.000Z",
    }
    assert f"stories_studio_session={token};" in h.set_cookies(response)[0]


def test_leaves_the_admin_credential_row_untouched():
    h = make_harness()
    before = h.fakes.rows_of("auth", "auth")
    good(h)
    assert h.fakes.rows_of("auth", "auth") == before
    credential = before["auth/auth/admin"]
    assert asyncio.run(
        verify_password(ADMIN_PASSWORD, credential["passwordSalt"], credential["passwordHash"])
    )


def test_creates_an_independent_session_for_every_login():
    h = make_harness()
    good(h)
    good(h)
    assert len(h.fakes.rows_of("auth", "auth-sessions")) == 2


# ---- wiring ------------------------------------------------------------------------------------


def test_default_wiring_reads_the_auth_and_knowledge_namespaces_with_the_configured_url_and_key():
    deps = build_default_dependencies(
        {
            "SUPABASE_URL": "https://project.supabase.test",
            "SUPABASE_SERVICE_ROLE_KEY": "service-role-key",
        }
    )
    assert [(a.url, a.namespace) for a in (deps.auth_persistence, deps.knowledge_persistence)] == [  # type: ignore[attr-defined]
        ("https://project.supabase.test", "auth"),
        ("https://project.supabase.test", "knowledge"),
    ]
    assert deps.auth_persistence._service_role_key == "service-role-key"  # type: ignore[attr-defined]


# ---- rejections --------------------------------------------------------------------------------

BAD_BODIES = [
    ("missing password", {"email": "admin@stories.test"}),
    ("missing email", {"password": "x"}),
    ("malformed email", {"email": "not-an-email", "password": "x"}),
    ("empty password", {"email": "admin@stories.test", "password": ""}),
    ("non-string password", {"email": "admin@stories.test", "password": 12345678}),
    ("empty object", {}),
]


@pytest.mark.parametrize(("name", "body"), [*BAD_BODIES, ("JSON null", None)])
def test_answers_400_before_touching_storage_or_cookies(name, body):
    h = make_harness()
    rows_before = h.fakes.rows_of("auth")
    if body is None:
        response = h.post(URL, raw="null", ip="203.0.113.1")
    else:
        response = h.post(URL, body, ip="203.0.113.1")
    assert response.status_code == 400
    assert response.json() == {"error": "Email and password are required."}
    assert h.set_cookies(response) == []
    assert h.fakes.rows_of("auth") == rows_before


def test_answers_401_with_the_same_body_for_a_wrong_password_and_an_unknown_email():
    h = make_harness()
    wrong_password = h.post(URL, {"email": ADMIN_EMAIL, "password": "nope"}, ip="203.0.113.1")
    unknown_email = h.post(
        URL, {"email": "someone@else.test", "password": ADMIN_PASSWORD}, ip="203.0.113.1"
    )
    for response in (wrong_password, unknown_email):
        assert response.status_code == 401
        assert response.json() == {"error": "Incorrect email or password."}
        assert h.set_cookies(response) == []
    assert h.fakes.rows_of("auth", "auth-sessions") == {}


def test_compares_the_email_case_sensitively():
    h = make_harness()
    response = h.post(
        URL, {"email": ADMIN_EMAIL.upper(), "password": ADMIN_PASSWORD}, ip="203.0.113.1"
    )
    assert response.status_code == 401


def test_answers_401_when_no_admin_credential_exists_at_all():
    h = make_harness(seed_admin=False)
    assert (
        h.post(URL, {"email": "a@b.test", "password": "whatever"}, ip="203.0.113.1").status_code
        == 401
    )


def test_lets_a_malformed_json_body_escape_as_an_exception():
    h = make_harness()
    with pytest.raises(json.JSONDecodeError):
        h.post(URL, raw="{not json", ip="203.0.113.1")


# ---- rate limit keyed by client IP -------------------------------------------------------------


def test_allows_10_failed_attempts_from_one_ip_and_answers_429_from_the_11th():
    h = make_harness()
    for _ in range(10):
        assert bad(h).status_code == 401
    limited = bad(h)
    assert limited.status_code == 429
    assert limited.json() == {"error": "Too many attempts. Try again in a few minutes."}


def test_a_trips_on_11_requests_from_one_ip_against_different_emails():
    h = make_harness()
    for i in range(10):
        assert bad(h, email=f"victim{i}@stories.test").status_code == 401
    assert bad(h, email="victim11@stories.test").status_code == 429


def test_b_does_not_lock_the_admin_out_when_other_ips_hammer_the_admin_email():
    h = make_harness()
    for i in range(11):
        assert bad(h, ip=f"203.0.113.{100 + i}").status_code == 401
    for i in range(25):
        bad(h, ip=f"192.0.2.{i}")
    admin = good(h, ip=ADMIN_IP)
    assert admin.status_code == 200
    assert admin.json() == {"success": True}


def test_b2_the_attacker_ip_is_still_throttled_while_the_admin_ip_is_not():
    h = make_harness()
    for _ in range(11):
        bad(h)
    assert bad(h).status_code == 429
    assert good(h, ip=ADMIN_IP).status_code == 200


def test_applies_the_limit_before_checking_the_password():
    h = make_harness()
    for _ in range(11):
        bad(h, ip=ADMIN_IP)
    response = good(h, ip=ADMIN_IP)
    assert response.status_code == 429
    assert h.set_cookies(response) == []
    assert h.fakes.rows_of("auth", "auth-sessions") == {}


def test_does_not_count_malformed_requests():
    h = make_harness()
    for _ in range(15):
        h.post(URL, {"email": "bad", "password": "x"}, ip=ADMIN_IP)
    assert good(h, ip=ADMIN_IP).status_code == 200


def test_c_a_successful_login_clears_that_ip_counter():
    h = make_harness()
    for _ in range(9):
        bad(h, ip=ADMIN_IP)
    assert good(h, ip=ADMIN_IP).status_code == 200
    for _ in range(10):
        assert bad(h, ip=ADMIN_IP).status_code == 401
    assert bad(h, ip=ADMIN_IP).status_code == 429


def test_a_successful_login_from_one_ip_does_not_clear_another_ip_counter():
    h = make_harness()
    for _ in range(11):
        bad(h)
    assert good(h, ip=ADMIN_IP).status_code == 200
    assert bad(h).status_code == 429


def test_keeps_the_window_open_for_exactly_15_minutes_then_starts_a_new_one():
    h = make_harness()
    for _ in range(11):
        bad(h)
    h.clock.set(NOW + timedelta(minutes=15))
    assert bad(h).status_code == 429
    h.clock.set(NOW + timedelta(minutes=15, milliseconds=1))
    assert bad(h).status_code == 401


def test_uses_x_real_ip_only_a_client_supplied_x_forwarded_for_is_ignored_on_vercel():
    h = make_harness()
    for i in range(11):
        h.post(
            URL,
            {"email": ADMIN_EMAIL, "password": "wrong"},
            ip=ATTACKER_IP,
            headers={"x-forwarded-for": f"10.0.0.{i}"},
        )
    spoofed = h.post(
        URL,
        {"email": ADMIN_EMAIL, "password": "wrong"},
        ip=ATTACKER_IP,
        headers={"x-forwarded-for": "10.9.9.9"},
    )
    assert spoofed.status_code == 429


# ---- no trustworthy client IP ------------------------------------------------------------------


def test_in_development_without_vercel_the_limiter_is_skipped_even_if_x_real_ip_is_set():
    h = make_harness(environ={"VERCEL": ""})
    for i in range(15):
        assert bad(h, ip=f"203.0.113.{i % 2}").status_code == 401


def test_in_production_without_vercel_a_spoofed_x_real_ip_cannot_dodge_the_limit():
    h = make_harness(environ={"VERCEL": "", "STORIES_ENV": "production"})
    for i in range(10):
        assert bad(h, ip=f"203.0.113.{i}").status_code == 401
    assert bad(h, ip="203.0.113.200").status_code == 429


def test_on_vercel_with_a_missing_or_blank_x_real_ip_in_production_it_uses_the_shared_bucket():
    h = make_harness(environ={"STORIES_ENV": "production"})
    for _ in range(5):
        bad(h, ip=None)
    for _ in range(5):
        bad(h, ip="   ")
    assert bad(h, ip=None).status_code == 429
    assert bad(h, ip="198.51.100.9").status_code == 401
