import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { scryptSync } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/auth/passwords";

// ADR-004 Phase 4 step 1: a committed, language-agnostic scrypt fixture produced by the real
// `auth/passwords.ts` algorithm, for the Python port (step 2) to check itself against, the same
// pattern as fixtures/schema-contract. Regenerate with:
//   UPDATE_GOLDEN=1 npx vitest run fixtures/auth-contract
// TODO(step 2, see backend/PHASE4-AUDIT.md F5): add backend/tests/test_password_contract.py that
// loads scrypt-vectors.json and verifies every vector with hashlib.scrypt.
const GOLDEN = join(__dirname, "scrypt-vectors.json");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

const INPUTS = [
  {
    description: "plain ASCII",
    password: "correct horse battery",
    salt: "00112233445566778899aabbccddeeff",
  },
  {
    description: "non-ASCII, BMP and astral characters",
    password: "é–日本語🙂",
    salt: "ffeeddccbbaa99887766554433221100",
  },
  { description: "single character", password: "a", salt: "0123456789abcdef0123456789abcdef" },
  { description: "empty password", password: "", salt: "abcdefabcdefabcdefabcdefabcdefab" },
  {
    description: "200 characters",
    password: "x".repeat(200),
    salt: "deadbeefdeadbeefdeadbeefdeadbeef",
  },
  {
    description: "password with surrounding whitespace is not trimmed",
    password: "  spaced  ",
    salt: "1f1e1d1c1b1a19181716151413121110",
  },
];

function vectors() {
  return {
    algorithm: "scrypt",
    parameters: { N: 16384, r: 8, p: 1, keyLengthBytes: 64 },
    passwordEncoding: "utf-8",
    saltEncoding:
      "the 32-character hex string itself, encoded as UTF-8 bytes (NOT hex-decoded into 16 bytes)",
    hashEncoding: "lowercase hex, 128 characters",
    vectors: INPUTS.map((input) => ({
      ...input,
      hash: scryptSync(input.password, input.salt, 64).toString("hex"),
    })),
  };
}

describe("scrypt vectors", () => {
  if (UPDATE) writeFileSync(GOLDEN, `${JSON.stringify(vectors(), null, 2)}\n`, "utf8");

  it("are committed and match a fresh derivation", () => {
    expect(existsSync(GOLDEN), "run with UPDATE_GOLDEN=1 to create the golden").toBe(true);
    expect(JSON.parse(readFileSync(GOLDEN, "utf8"))).toEqual(vectors());
  });

  it("verify with the real verifyPassword, and fail for any other password", async () => {
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as ReturnType<typeof vectors>;
    for (const vector of golden.vectors) {
      expect(vector.hash).toMatch(/^[0-9a-f]{128}$/);
      expect(
        await verifyPassword(vector.password, vector.salt, vector.hash),
        vector.description,
      ).toBe(true);
      expect(
        await verifyPassword(`${vector.password}!`, vector.salt, vector.hash),
        vector.description,
      ).toBe(false);
    }
  });

  it("describe the shape hashPassword really emits (32-hex salt, 128-hex hash)", async () => {
    const { hash, salt } = await hashPassword("anything");
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
    expect(hash).toBe(scryptSync("anything", salt, 64).toString("hex"));
  });
});
