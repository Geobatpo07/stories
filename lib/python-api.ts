import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/auth/types";

const TIMEOUT_MS = 10_000;

/** The Python API could not answer: unreachable, timed out, misconfigured or a 5xx/4xx. Thrown to
 *  `app/error.tsx` (the app's error boundary); never swallowed into an empty page. */
export class PythonApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PythonApiError";
  }
}

/**
 * Server-side GET to the Python API. A Server Component's fetch does not carry the browser's
 * cookies, so the Studio session cookie is read from the incoming request and forwarded
 * explicitly (only that one cookie). 401 sends the visitor to the login page; the Studio being
 * disabled (the API's `{"error":"Not found"}`) is a 404; anything else is a `PythonApiError`.
 */
export async function pythonApiGet<T>(path: string): Promise<T> {
  const base = process.env.PYTHON_API_BASE_URL?.replace(/\/+$/, "");
  if (!base) throw new PythonApiError("PYTHON_API_BASE_URL is not set.");

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      cache: "no-store",
      headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    throw new PythonApiError(`The Python API is unreachable at ${base}.`, undefined, { cause });
  }

  if (response.status === 401) redirect("/studio/login");
  if (response.status === 404) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    // A route the API does not have answers {"detail": ...}: that is a misconfiguration, not a 404.
    if (body?.error === "Not found") notFound();
    throw new PythonApiError(`The Python API has no route ${path} (404).`, 404);
  }
  if (!response.ok) {
    throw new PythonApiError(
      `The Python API answered ${response.status} for ${path}.`,
      response.status,
    );
  }
  return (await response.json()) as T;
}
