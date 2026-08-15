import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/** Derives a salted scrypt hash. Never store or compare a raw password. */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return { hash: derived.toString("hex"), salt };
}

/** Constant-time comparison — never short-circuits on the first differing byte. */
export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(expectedHash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** A URL-safe random token for session ids and password-reset tokens. */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}
