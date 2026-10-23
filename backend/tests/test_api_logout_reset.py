"""POST /api/auth/logout, /reset-password and /reset-password/confirm, ported from
app/api/auth/logout/route.test.ts (6), reset-password/route.test.ts (12) and
reset-password/confirm/route.test.ts (18)."""

import asyncio
import json
import re
from datetime import timedelta
from typing import Any

import pytest

from auth.passwords import verify_password

from .api_support import ADMIN_EMAIL, ADMIN_PASSWORD, NOW, Harness, make_harness

COOKIE = "stories_studio_session"
CLEARED = f"{COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
TOKEN = "a" * 64
OTHER = "b" * 64
LATER = NOW + timedelta(hours=12)


# ---- logout ------------------------------------------------------------------------------------


def logout_harness() -> Harness:
    h = make_harness()
    h.fakes.seed_session(TOKEN, NOW, LATER)
    h.fakes.seed_session(OTHER, NOW, LATER)
    return h


def test_logout_deletes_only_the_callers_session_row_and_keeps_others() -> None:
    h = logout_harness()
    response = h.post("/api/auth/logout", cookie=TOKEN)
    assert response.status_code == 200
    assert response.json() == {"success": True}
    assert list(h.fakes.rows_of("auth", "auth-sessions")) == [f"auth/auth-sessions/{OTHER}"]
    assert "auth/auth/admin" in h.fakes.rows_of("auth", "auth")


def test_logout_clears_the_cookie_with_an_empty_value_and_epoch_expiry_only() -> None:
    h = logout_harness()
    assert h.set_cookies(h.post("/api/auth/logout", cookie=TOKEN)) == [CLEARED]


def test_logout_without_a_cookie_still_answers_200_clears_the_cookie_and_deletes_nothing() -> None:
    h = logout_harness()
    before = h.fakes.rows_of("auth")
    response = h.post("/api/auth/logout")
    assert response.status_code == 200
    assert response.json() == {"success": True}
    assert h.set_cookies(response) == [CLEARED]
    assert h.fakes.rows_of("auth") == before


def test_logout_with_an_unknown_token_leaves_every_real_session_in_place() -> None:
    h = logout_harness()
    assert h.post("/api/auth/logout", cookie="c" * 64).status_code == 200
    assert sorted(h.fakes.rows_of("auth", "auth-sessions")) == sorted(
        [f"auth/auth-sessions/{TOKEN}", f"auth/auth-sessions/{OTHER}"]
    )


def test_logout_deletes_an_already_expired_session_row_too() -> None:
    h = logout_harness()
    h.clock.set(LATER + timedelta(seconds=1))
    assert h.post("/api/auth/logout", cookie=TOKEN).status_code == 200
    assert f"auth/auth-sessions/{TOKEN}" not in h.fakes.rows_of("auth", "auth-sessions")


def test_logout_ignores_a_cookie_with_an_empty_value() -> None:
    h = logout_harness()
    assert h.post("/api/auth/logout", cookie="").status_code == 200
    assert len(h.fakes.rows_of("auth", "auth-sessions")) == 2


# ---- reset-password (request) ------------------------------------------------------------------

RESET = "/api/auth/reset-password"


@pytest.mark.parametrize(
    "body", [{}, {"email": "nope"}, {"email": 5}], ids=["missing", "malformed", "non-string"]
)
def test_reset_request_answers_400_without_storing_or_sending(body: Any) -> None:
    h = make_harness()
    rows = h.fakes.rows_of("auth")
    response = h.post(RESET, body)
    assert response.status_code == 400
    assert response.json() == {"error": "A valid email is required."}
    assert h.fakes.rows_of("auth") == rows
    assert h.fakes.sent_emails == []


def test_reset_request_for_the_admin_stores_a_one_hour_token_and_sends_one_email() -> None:
    h = make_harness(environ={"NEXT_PUBLIC_SITE_URL": "https://stories.test/"})
    response = h.post(RESET, {"email": ADMIN_EMAIL})
    assert response.status_code == 200
    assert response.json() == {"success": True}

    tokens = h.fakes.rows_of("auth", "auth-reset-tokens")
    [(row_key, row)] = tokens.items()
    token = row_key.removeprefix("auth/auth-reset-tokens/")
    assert re.fullmatch(r"[0-9a-f]{64}", token)
    assert row == {"email": ADMIN_EMAIL, "expiresAt": "2026-08-15T13:00:00.000Z"}

    link = f"https://stories.test/studio/reset-password?token={token}"
    [message] = h.fakes.sent_emails
    assert message.to == ADMIN_EMAIL
    assert message.subject == "Reset your Stories Studio password"
    assert message.text == f"Open this link to choose a new password (expires in 1 hour): {link}"
    assert message.html == (
        "<p>Open this link to choose a new password (expires in 1 hour):</p>"
        f'<p><a href="{link}">{link}</a></p>'
    )


def test_reset_request_defaults_the_link_base_to_localhost_3000() -> None:
    h = make_harness()
    h.post(RESET, {"email": ADMIN_EMAIL})
    assert "http://localhost:3000/studio/reset-password?token=" in h.fakes.sent_emails[0].text


def test_reset_request_for_an_unknown_email_answers_the_same_200_with_no_token_and_no_email() -> None:  # noqa: E501
    h = make_harness()
    response = h.post(RESET, {"email": "stranger@stories.test"})
    assert response.status_code == 200
    assert response.json() == {"success": True}
    assert h.fakes.rows_of("auth", "auth-reset-tokens") == {}
    assert h.fakes.sent_emails == []


def test_reset_request_matches_the_email_case_sensitively() -> None:
    h = make_harness()
    assert h.post(RESET, {"email": ADMIN_EMAIL.upper()}).status_code == 200
    assert h.fakes.sent_emails == []


def test_reset_request_answers_200_when_no_admin_credential_exists() -> None:
    h = make_harness(seed_admin=False)
    response = h.post(RESET, {"email": ADMIN_EMAIL})
    assert response.status_code == 200
    assert response.json() == {"success": True}
    assert h.fakes.sent_emails == []


def test_reset_request_does_not_invalidate_earlier_tokens() -> None:
    h = make_harness()
    h.post(RESET, {"email": ADMIN_EMAIL})
    h.post(RESET, {"email": ADMIN_EMAIL})
    assert len(h.fakes.rows_of("auth", "auth-reset-tokens")) == 2
    assert len(h.fakes.sent_emails) == 2


def test_reset_request_does_not_touch_existing_sessions_or_the_credential() -> None:
    h = make_harness()
    h.fakes.seed_session("d" * 64, NOW, NOW + timedelta(seconds=1))
    before = {**h.fakes.rows_of("auth", "auth"), **h.fakes.rows_of("auth", "auth-sessions")}
    h.post(RESET, {"email": ADMIN_EMAIL})
    after = {**h.fakes.rows_of("auth", "auth"), **h.fakes.rows_of("auth", "auth-sessions")}
    assert after == before


def test_reset_request_when_the_email_provider_fails_the_error_escapes_and_the_token_is_stored() -> None:  # noqa: E501
    h = make_harness()
    h.fakes.email_failure = RuntimeError("Resend rejected the email (403): domain not verified")
    with pytest.raises(RuntimeError, match="domain not verified"):
        h.post(RESET, {"email": ADMIN_EMAIL})
    assert len(h.fakes.rows_of("auth", "auth-reset-tokens")) == 1


def test_reset_request_lets_a_malformed_json_body_escape() -> None:
    h = make_harness()
    with pytest.raises(json.JSONDecodeError):
        h.post(RESET, raw="{oops")


# ---- reset-password/confirm --------------------------------------------------------------------

CONFIRM = "/api/auth/reset-password/confirm"
RESET_TOKEN = "e" * 64
NEW_PASSWORD = "brand new passphrase"
INVALID = "This reset link is invalid or has already been used."


def seed_token(h: Harness, expires_at: Any, email: Any = ADMIN_EMAIL) -> None:
    from runtime.clock import iso_millis

    h.fakes.put_row(
        "auth",
        "auth-reset-tokens",
        RESET_TOKEN,
        {"email": email, "expiresAt": iso_millis(expires_at)},
    )


@pytest.mark.parametrize(
    "body",
    [
        {"password": "long enough"},
        {"token": "", "password": "long enough"},
        {"token": RESET_TOKEN},
        {"token": RESET_TOKEN, "password": "1234567"},
        {"token": 1, "password": "long enough"},
    ],
    ids=["missing token", "empty token", "missing password", "7-character password", "non-string"],
)
def test_confirm_answers_400_and_consumes_nothing(body: Any) -> None:
    h = make_harness()
    seed_token(h, NOW + timedelta(minutes=1))
    rows = h.fakes.rows_of("auth")
    response = h.post(CONFIRM, body)
    assert response.status_code == 400
    assert response.json() == {
        "error": "A reset token and a password of at least 8 characters are required."
    }
    assert h.fakes.rows_of("auth") == rows


def test_confirm_accepts_an_8_character_password() -> None:
    h = make_harness()
    seed_token(h, NOW + timedelta(minutes=1))
    assert h.post(CONFIRM, {"token": RESET_TOKEN, "password": "12345678"}).status_code == 200


def test_confirm_counts_the_minimum_in_javascript_string_length_utf16_code_units() -> None:
    # Verified against zod 3.25: z.string().min(8) accepts four emoji (each is 2 code units).
    h = make_harness()
    seed_token(h, NOW + timedelta(minutes=1))
    assert h.post(CONFIRM, {"token": RESET_TOKEN, "password": "\U0001f600" * 4}).status_code == 200
    h2 = make_harness()
    seed_token(h2, NOW + timedelta(minutes=1))
    assert (
        h2.post(CONFIRM, {"token": RESET_TOKEN, "password": "\U0001f600" * 3 + "a"}).status_code
        == 400
    )


def test_confirm_lets_a_malformed_json_body_escape() -> None:
    h = make_harness()
    with pytest.raises(json.JSONDecodeError):
        h.post(CONFIRM, raw="{oops")


def test_confirm_success_replaces_the_credential_and_consumes_the_token() -> None:
    h = make_harness()
    seed_token(h, NOW + timedelta(minutes=1))
    before = h.fakes.rows_of("auth", "auth")["auth/auth/admin"]
    response = h.post(CONFIRM, {"token": RESET_TOKEN, "password": NEW_PASSWORD})
    assert response.status_code == 200
    assert response.json() == {"success": True}

    after = h.fakes.rows_of("auth", "auth")["auth/auth/admin"]
    assert sorted(after) == ["email", "passwordHash", "passwordSalt", "updatedAt"]
    assert after["email"] == ADMIN_EMAIL
    assert after["updatedAt"] == "2026-08-15T12:00:00.000Z"
    assert re.fullmatch(r"[0-9a-f]{32}", after["passwordSalt"])
    assert re.fullmatch(r"[0-9a-f]{128}", after["passwordHash"])
    assert after["passwordSalt"] != before["passwordSalt"]
    assert asyncio.run(verify_password(NEW_PASSWORD, after["passwordSalt"], after["passwordHash"]))
    assert not asyncio.run(
        verify_password(ADMIN_PASSWORD, after["passwordSalt"], after["passwordHash"])
    )
    assert h.fakes.rows_of("auth", "auth-reset-tokens") == {}


def test_confirm_success_signs_out_every_session() -> None:
    h = make_harness()
    seed_token(h, NOW + timedelta(minutes=1))
    h.fakes.seed_session("1" * 64, NOW, NOW + timedelta(hours=1))
    h.fakes.seed_session("2" * 64, NOW, NOW + timedelta(hours=1))
    h.post(CONFIRM, {"token": RESET_TOKEN, "password": NEW_PASSWORD})
    assert h.fakes.rows_of("auth", "auth-sessions") == {}


def test_confirm_success_does_not_set_or_clear_any_cookie() -> None:
    h = make_harness()
    seed_token(h, NOW + timedelta(minutes=1))
    response = h.post(CONFIRM, {"token": RESET_TOKEN, "password": NEW_PASSWORD})
    assert h.set_cookies(response) == []


def test_confirm_is_single_use_a_replay_answers_400_and_keeps_the_new_password() -> None:
    h = make_harness()
    seed_token(h, NOW + timedelta(minutes=1))
    h.post(CONFIRM, {"token": RESET_TOKEN, "password": NEW_PASSWORD})
    replay = h.post(CONFIRM, {"token": RESET_TOKEN, "password": "another passphrase"})
    assert replay.status_code == 400
    assert replay.json() == {"error": INVALID}
    credential = h.fakes.rows_of("auth", "auth")["auth/auth/admin"]
    assert asyncio.run(
        verify_password(NEW_PASSWORD, credential["passwordSalt"], credential["passwordHash"])
    )


def test_confirm_unknown_token_answers_the_generic_400_and_changes_nothing() -> None:
    h = make_harness()
    h.fakes.seed_session("3" * 64, NOW, NOW + timedelta(seconds=1))
    rows = h.fakes.rows_of("auth")
    response = h.post(CONFIRM, {"token": "nope", "password": NEW_PASSWORD})
    assert response.status_code == 400
    assert response.json() == {"error": INVALID}
    assert h.fakes.rows_of("auth") == rows


def test_confirm_expired_token_answers_expired_burns_it_and_keeps_password_and_sessions() -> None:
    h = make_harness()
    seed_token(h, NOW - timedelta(milliseconds=1))
    h.fakes.seed_session("4" * 64, NOW, NOW + timedelta(seconds=1))
    credential_before = h.fakes.rows_of("auth", "auth")["auth/auth/admin"]
    response = h.post(CONFIRM, {"token": RESET_TOKEN, "password": NEW_PASSWORD})
    assert response.status_code == 400
    assert response.json() == {"error": "This reset link has expired."}
    assert h.fakes.rows_of("auth", "auth-reset-tokens") == {}
    assert h.fakes.rows_of("auth", "auth")["auth/auth/admin"] == credential_before
    assert len(h.fakes.rows_of("auth", "auth-sessions")) == 1


def test_confirm_treats_a_token_expiring_exactly_now_as_expired() -> None:
    h = make_harness()
    seed_token(h, NOW)
    response = h.post(CONFIRM, {"token": RESET_TOKEN, "password": NEW_PASSWORD})
    assert response.status_code == 400
    assert response.json() == {"error": "This reset link has expired."}


def test_confirm_accepts_a_token_expiring_one_millisecond_from_now() -> None:
    h = make_harness()
    seed_token(h, NOW + timedelta(milliseconds=1))
    assert h.post(CONFIRM, {"token": RESET_TOKEN, "password": NEW_PASSWORD}).status_code == 200


def test_confirm_for_another_email_answers_the_generic_400_and_still_burns_the_token() -> None:
    h = make_harness()
    seed_token(h, NOW + timedelta(minutes=1), email="someone@else.test")
    credential_before = h.fakes.rows_of("auth", "auth")["auth/auth/admin"]
    response = h.post(CONFIRM, {"token": RESET_TOKEN, "password": NEW_PASSWORD})
    assert response.status_code == 400
    assert response.json() == {"error": INVALID}
    assert h.fakes.rows_of("auth", "auth-reset-tokens") == {}
    assert h.fakes.rows_of("auth", "auth")["auth/auth/admin"] == credential_before


def test_confirm_answers_the_generic_400_when_the_admin_credential_no_longer_exists() -> None:
    h = make_harness(seed_admin=False)
    seed_token(h, NOW + timedelta(minutes=1))
    response = h.post(CONFIRM, {"token": RESET_TOKEN, "password": NEW_PASSWORD})
    assert response.status_code == 400
    assert response.json() == {"error": INVALID}
    assert h.fakes.rows_of("auth", "auth") == {}


def test_confirm_lets_a_corrupt_stored_token_row_escape_after_deleting_it() -> None:
    h = make_harness()
    h.fakes.put_row(
        "auth", "auth-reset-tokens", RESET_TOKEN, {"email": "not-an-email", "expiresAt": "soon"}
    )
    with pytest.raises(Exception):  # noqa: B017 - pydantic ValidationError, like Zod's throw
        h.post(CONFIRM, {"token": RESET_TOKEN, "password": NEW_PASSWORD})
    assert h.fakes.rows_of("auth", "auth-reset-tokens") == {}
