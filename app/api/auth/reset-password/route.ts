import { NextResponse } from "next/server";
import { z } from "zod";
import { authWorkflow } from "@/auth/server";

const requestSchema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  // Always resolves the same way whether or not the email is registered —
  // AuthWorkflow.requestPasswordReset() never reveals account existence.
  await authWorkflow.requestPasswordReset(parsed.data.email);
  return NextResponse.json({ success: true });
}
