import { pythonApiRelay } from "@/lib/python-api";

/** Pure relay: credential check, rate limiting (per client IP) and the session cookie are the
 *  Python endpoint's (backend/api/app.py). */
export async function POST(request: Request) {
  return pythonApiRelay(request, "/api/auth/login");
}
