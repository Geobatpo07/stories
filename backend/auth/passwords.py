"""Port of auth/passwords.ts: salted scrypt with Node's defaults (N=16384, r=8, p=1, 64 bytes).

Compatibility rules, checked against fixtures/auth-contract/scrypt-vectors.json and the Phase 4
audit (F5): the password is UTF-8, and the salt is the 32-character hex STRING encoded as UTF-8
bytes, not hex-decoded into 16 bytes.
"""

import asyncio
import hashlib
import hmac
import secrets
import string

KEY_LENGTH = 64
_SCRYPT = {"n": 16384, "r": 8, "p": 1, "dklen": KEY_LENGTH, "maxmem": 64 * 1024 * 1024}


def _utf8(value: str) -> bytes:
    # Node encodes a lone surrogate as U+FFFD; Python would raise.
    return value.encode("utf-16", "surrogatepass").decode("utf-16", "replace").encode("utf-8")


def _derive(password: str, salt: str) -> bytes:
    return hashlib.scrypt(_utf8(password), salt=_utf8(salt), **_SCRYPT)


def _node_hex_decode(value: str) -> bytes:
    """`Buffer.from(value, "hex")`: stops at the first invalid pair, drops a trailing nibble."""
    out = bytearray()
    for index in range(0, len(value) - 1, 2):
        pair = value[index : index + 2]
        if not all(char in string.hexdigits for char in pair):
            break
        out.append(int(pair, 16))
    return bytes(out)


async def hash_password(password: str) -> tuple[str, str]:
    """Returns `(hash, salt)`. Never store or compare a raw password."""
    salt = secrets.token_hex(16)
    derived = await asyncio.to_thread(_derive, password, salt)
    return derived.hex(), salt


async def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    """Constant-time comparison."""
    derived = await asyncio.to_thread(_derive, password, salt)
    expected = _node_hex_decode(expected_hash)
    return len(derived) == len(expected) and hmac.compare_digest(derived, expected)


def generate_token() -> str:
    """A random 64-hex-character token for session ids and password-reset tokens."""
    return secrets.token_hex(32)
