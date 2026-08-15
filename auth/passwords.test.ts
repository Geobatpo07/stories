import { describe, expect, it } from "vitest";
import { generateToken, hashPassword, verifyPassword } from "./passwords";

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password against its own hash", async () => {
    const { hash, salt } = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", salt, hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const { hash, salt } = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", salt, hash)).resolves.toBe(false);
  });

  it("salts independently, so the same password hashes differently each time", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password");
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it("rejects a hash computed under a different salt", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    await expect(verifyPassword("same password", a.salt, b.hash)).resolves.toBe(false);
  });
});

describe("generateToken", () => {
  it("produces long, unique, URL-safe hex tokens", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateToken()));
    expect(tokens.size).toBe(20);
    for (const token of tokens) {
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
