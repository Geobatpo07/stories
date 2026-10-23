import { pythonApiRelay } from "@/lib/python-api";

/** Pure relay: gating, publication (GitHub commit) and the revalidation callback are the Python
 *  endpoint's. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return pythonApiRelay(request, `/api/studio/documents/${encodeURIComponent(id)}/publish`);
}
