import { NextResponse } from "next/server";
import { isStudioEnabled, knowledgeObjectRepository } from "@/authoring/server";
import { getStudioSession } from "@/auth/server";
import { pythonApiRelay } from "@/lib/python-api";

export async function GET() {
  if (!isStudioEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await getStudioSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ documents: await knowledgeObjectRepository.list() });
}

/** Pure relay: gating, validation, slug derivation and the draft save are the Python endpoint's. */
export async function POST(request: Request) {
  return pythonApiRelay(request, "/api/studio/documents");
}
