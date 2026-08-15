import { NextResponse } from "next/server";
import { z } from "zod";
import { authWorkflow } from "@/auth/server";

const confirmSchema = z.object({ token: z.string().min(1), password: z.string().min(8) });

export async function POST(request: Request) {
  const parsed = confirmSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A reset token and a password of at least 8 characters are required." },
      { status: 400 },
    );
  }
  const result = await authWorkflow.confirmPasswordReset(parsed.data.token, parsed.data.password);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "This reset link is invalid." },
      { status: 400 },
    );
  }
  return NextResponse.json({ success: true });
}
