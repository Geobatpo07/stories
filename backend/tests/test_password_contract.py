"""Phase 4 audit F5 / the TODO in fixtures/auth-contract/auth-contract.test.ts.

fixtures/auth-contract/scrypt-vectors.json was produced by the TypeScript algorithm
(auth/passwords.ts); every vector must verify with the Python port, and nothing else may.
"""

import asyncio
import hashlib
import json
import re
from pathlib import Path

import pytest

from auth.passwords import (
    _node_hex_decode,
    generate_token,
    hash_password,
    verify_password,
)

GOLDEN = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures/auth-contract/scrypt-vectors.json").read_text(
        "utf8"
    )
)
VECTORS = GOLDEN["vectors"]


def run(coroutine):
    return asyncio.run(coroutine)


def test_the_fixture_describes_the_parameters_the_port_uses():
    assert GOLDEN["parameters"] == {"N": 16384, "r": 8, "p": 1, "keyLengthBytes": 64}
    assert len(VECTORS) == 6


@pytest.mark.parametrize("vector", VECTORS, ids=[v["description"] for v in VECTORS])
def test_every_typescript_vector_verifies_and_any_other_password_fails(vector):
    assert re.fullmatch(r"[0-9a-f]{128}", vector["hash"])
    assert run(verify_password(vector["password"], vector["salt"], vector["hash"])) is True
    assert run(verify_password(vector["password"] + "!", vector["salt"], vector["hash"])) is False


def test_the_salt_is_the_hex_string_itself_not_its_decoded_bytes():
    vector = VECTORS[0]
    decoded = hashlib.scrypt(
        vector["password"].encode(), salt=bytes.fromhex(vector["salt"]), n=16384, r=8, p=1, dklen=64
    )
    assert decoded.hex() != vector["hash"]


def test_hash_password_emits_a_32_hex_salt_and_a_128_hex_hash_that_verify():
    hashed, salt = run(hash_password("anything"))
    assert re.fullmatch(r"[0-9a-f]{32}", salt)
    assert re.fullmatch(r"[0-9a-f]{128}", hashed)
    assert run(verify_password("anything", salt, hashed))
    assert (
        hashed == hashlib.scrypt(b"anything", salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
    )


def test_tokens_are_64_lowercase_hex_characters_and_unique():
    tokens = {generate_token() for _ in range(50)}
    assert len(tokens) == 50
    assert all(re.fullmatch(r"[0-9a-f]{64}", token) for token in tokens)


def test_a_lone_surrogate_is_hashed_as_u_fffd_like_node_instead_of_raising():
    surrogate = run(hash_password("a\ud800b"))
    replaced_hash = hashlib.scrypt(
        "a�b".encode(), salt=surrogate[1].encode(), n=16384, r=8, p=1, dklen=64
    ).hex()
    assert surrogate[0] == replaced_hash


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("00ff", b"\x00\xff"),
        ("00f", b"\x00"),
        ("00zz11", b"\x00"),
        ("", b""),
        ("ZZ", b""),
        ("0g", b""),
    ],
)
def test_node_hex_decoding_stops_at_the_first_invalid_pair(text, expected):
    # Buffer.from(text, "hex") semantics: a corrupt stored hash must compare unequal, never raise.
    assert _node_hex_decode(text) == expected


def test_a_corrupt_stored_hash_verifies_as_false():
    vector = VECTORS[0]
    assert run(verify_password(vector["password"], vector["salt"], "not hex at all")) is False
    assert run(verify_password(vector["password"], vector["salt"], vector["hash"][:-2])) is False
