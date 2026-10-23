import { pythonApiRelay } from "@/lib/python-api";

/** Pure relay: token check and password change are the Python endpoint's. */
export async function POST(request: Request) {
  return pythonApiRelay(request, "/api/auth/reset-password/confirm");
}
