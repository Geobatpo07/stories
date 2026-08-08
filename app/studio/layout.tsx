import { notFound } from "next/navigation";
import { isStudioEnabled } from "@/authoring/server";

export const dynamic = "force-dynamic";

export default function StudioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!isStudioEnabled()) notFound();
  return children;
}
