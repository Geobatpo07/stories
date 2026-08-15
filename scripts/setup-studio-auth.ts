/**
 * scripts/setup-studio-auth.ts
 *
 * Bootstraps (or replaces) the single Studio admin credential. There is no
 * signup page by design (see auth/README.md) — this is the only way to set
 * the first password, run once by the operator in their own terminal.
 *
 * Run with: pnpm studio:auth:init --email you@example.com
 * Non-interactive (scripted/CI bootstrap): set STUDIO_ADMIN_PASSWORD instead
 * of being prompted.
 */
import { createInterface } from "node:readline/promises";
import { hashPassword } from "@/auth/passwords";
import { credentialRepository } from "@/auth/server";
import { SystemClock } from "@/runtime";

function readEmailArg(): string {
  const flagIndex = process.argv.indexOf("--email");
  const email = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
  if (!email) {
    console.error("Usage: pnpm studio:auth:init --email you@example.com");
    process.exit(1);
  }
  return email;
}

async function readPassword(): Promise<{ password: string; confirmation: string }> {
  const fromEnv = process.env.STUDIO_ADMIN_PASSWORD;
  if (fromEnv) return { password: fromEnv, confirmation: fromEnv };

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.warn(
    "Password input is visible in this terminal (no hidden-input dependency) — run somewhere private.",
  );
  const password = await rl.question("New Studio password: ");
  const confirmation = await rl.question("Confirm password: ");
  rl.close();
  return { password, confirmation };
}

async function main(): Promise<void> {
  const email = readEmailArg();
  const { password, confirmation } = await readPassword();

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }
  if (password !== confirmation) {
    console.error("Passwords did not match.");
    process.exitCode = 1;
    return;
  }

  const { hash, salt } = await hashPassword(password);
  await credentialRepository.save({
    email,
    passwordHash: hash,
    passwordSalt: salt,
    updatedAt: new SystemClock().now().toISOString(),
  });
  console.warn(`Studio admin credential set for ${email}.`);
}

main();
