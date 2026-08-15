import { ConfirmResetForm, RequestResetForm } from "@/components/authoring/auth-forms";

export const dynamic = "force-dynamic";

export default async function StudioResetPasswordPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string }> }>) {
  const { token } = await searchParams;
  return (
    <main id="main-content" className="shell page auth-page">
      <header className="page-hero compact-hero">
        <p className="eyebrow">Private workspace</p>
        <h1>Reset your password</h1>
        <p>
          {token
            ? "Choose a new password for the Studio."
            : "Enter your account email and we'll send a reset link."}
        </p>
      </header>
      {token ? <ConfirmResetForm token={token} /> : <RequestResetForm />}
    </main>
  );
}
