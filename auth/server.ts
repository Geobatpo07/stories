import { cookies } from "next/headers";
import {
  EnvironmentConfiguration,
  FileSystemPersistenceAdapter,
  ResendEmailAdapter,
  SystemClock,
} from "@/runtime";
import { CredentialRepository, ResetTokenRepository, SessionRepository } from "./repository";
import { SESSION_COOKIE_NAME } from "./types";
import { AuthWorkflow } from "./workflow";

export { SESSION_COOKIE_NAME };

/**
 * Deliberately NOT under `knowledge/` — that directory is Git-tracked
 * ("committed with their generated MDX publications", knowledge/README.md).
 * Credentials, sessions, and reset tokens must never end up in Git history,
 * so they get their own gitignored root (see .gitignore).
 */
const persistence = new FileSystemPersistenceAdapter(".studio-auth");
export const credentialRepository = new CredentialRepository(persistence);
export const sessionRepository = new SessionRepository(persistence);
export const resetTokenRepository = new ResetTokenRepository(persistence);

const configuration = new EnvironmentConfiguration(process.env);
configuration.load();

function resetUrlBase(): string {
  const siteUrl = configuration.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000";
  return `${siteUrl.replace(/\/$/, "")}/studio/reset-password`;
}

export const authWorkflow = new AuthWorkflow(
  credentialRepository,
  sessionRepository,
  resetTokenRepository,
  new ResendEmailAdapter(
    configuration.get("RESEND_API_KEY") ?? "",
    configuration.get("STUDIO_ADMIN_RESET_FROM_EMAIL") ?? "onboarding@resend.dev",
  ),
  new SystemClock(),
  resetUrlBase(),
);

/** Reads the session cookie and validates it — safe from a Server Component or a Route Handler. */
export async function getStudioSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  return authWorkflow.validateSession(token);
}

/** Route Handler only — `cookies()` is read-only from a Server Component and throws on `.set()`. */
export async function writeSessionCookie(token: string, expiresAt: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function currentSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}
