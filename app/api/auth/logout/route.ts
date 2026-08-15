import { NextResponse } from "next/server";
import { authWorkflow, clearSessionCookie, currentSessionToken } from "@/auth/server";

export async function POST() {
  const token = await currentSessionToken();
  if (token) await authWorkflow.logout(token);
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
