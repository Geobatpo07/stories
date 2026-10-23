import { pythonApiRelay } from "@/lib/python-api";

/** Pure relay: validation, token creation and the e-mail are the Python endpoint's. */
export async function POST(request: Request) {
  return pythonApiRelay(request, "/api/auth/reset-password");
}
