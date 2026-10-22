/** Browser-side call to the Python API. The base URL is inlined at build time; unset means the
 *  same origin (once the platform routes `/api/studio` to the Python service). `include` sends
 *  the session cookie to a different origin, which the API allows through STUDIO_ALLOWED_ORIGINS. */
export function studioApiFetch(path: string, init: RequestInit): Promise<Response> {
  const base = (process.env.NEXT_PUBLIC_PYTHON_API_BASE_URL ?? "").replace(/\/+$/, "");
  return fetch(`${base}${path}`, { ...init, credentials: "include" });
}
