import { pythonApiRelay } from "@/lib/python-api";

/** Pure relay: session deletion and the cleared cookie are the Python endpoint's. */
export async function POST(request: Request) {
  return pythonApiRelay(request, "/api/auth/logout");
}
