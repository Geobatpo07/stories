import { NextResponse } from "next/server";
import { z } from "zod";
import { contentTypeSchema } from "@/schemas";
import { authoringWorkflow, isStudioEnabled, knowledgeObjectRepository } from "@/authoring/server";

const draftSchema = z.object({
  id: z.string().uuid(),
  kind: contentTypeSchema,
  fields: z.record(z.unknown()),
  content: z.string(),
  createdAt: z.string().datetime(),
  publicationState: z.enum(["draft", "published"]).optional(),
  publication: z
    .object({
      kind: contentTypeSchema,
      slug: z.string(),
      path: z.string(),
      publishedAt: z.string().datetime(),
    })
    .optional(),
});

export async function GET() {
  if (!isStudioEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ documents: await knowledgeObjectRepository.list() });
}

export async function POST(request: Request) {
  if (!isStudioEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = draftSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "The draft payload is incomplete." }, { status: 400 });
  }
  const input = parsed.data;
  const fields = { ...input.fields };
  if (!fields.slug && typeof fields.title === "string" && fields.title.trim()) {
    fields.slug = authoringWorkflow.slugFromTitle(fields.title);
  }
  const result = await authoringWorkflow.saveDraft({ ...input, fields });
  return NextResponse.json(result);
}
