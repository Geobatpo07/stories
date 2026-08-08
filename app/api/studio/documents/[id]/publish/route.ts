import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { authoringWorkflow, isStudioEnabled } from "@/authoring/server";
import { resetRuntimeContext } from "@/lib/presentation/runtime";
import { resetLaboratory } from "@/lib/presentation";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isStudioEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { id } = await context.params;
    const { document, report } = await authoringWorkflow.publish(id);
    resetRuntimeContext();
    resetLaboratory();
    revalidatePath("/", "layout");
    return NextResponse.json({ document, report: report.report });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Publication failed." },
      { status: 422 },
    );
  }
}
