import { redirect } from "next/navigation";
import { getStudioSession } from "@/auth/server";
import { LoginForm } from "@/components/authoring/auth-forms";

export const dynamic = "force-dynamic";

export default async function StudioLoginPage() {
  if (await getStudioSession()) redirect("/studio");
  return (
    <main id="main-content" className="shell page auth-page">
      <header className="page-hero compact-hero">
        <p className="eyebrow">Private workspace</p>
        <h1>Sign in</h1>
        <p>Access the Knowledge Authoring Studio.</p>
      </header>
      <LoginForm />
    </main>
  );
}
