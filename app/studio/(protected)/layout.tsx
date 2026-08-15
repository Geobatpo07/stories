import { redirect } from "next/navigation";
import { getStudioSession } from "@/auth/server";

export const dynamic = "force-dynamic";

export default async function ProtectedStudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await getStudioSession())) redirect("/studio/login");
  return children;
}
