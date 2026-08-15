"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("submitting");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      setStatus("error");
      return;
    }
    router.push("/studio");
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
      <label className="studio-field" htmlFor="login-email">
        <span>Email</span>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="studio-field" htmlFor="login-password">
        <span>Password</span>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {status === "error" && (
        <p className="field-error" role="alert">
          Incorrect email or password.
        </p>
      )}
      <button type="submit" className="button" disabled={status === "submitting"}>
        {status === "submitting" ? "Signing in…" : "Sign in"}
      </button>
      <Link href="/studio/reset-password">Forgot your password?</Link>
    </form>
  );
}

export function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent">("idle");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("submitting");
    await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    // Deliberately identical outcome whether or not the email is registered — see auth/README.md.
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <p className="empty-state">
        If that address is registered, a reset link is on its way — check your inbox.
      </p>
    );
  }

  return (
    <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
      <label className="studio-field" htmlFor="reset-email">
        <span>Email</span>
        <input
          id="reset-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <button type="submit" className="button" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Send reset link"}
      </button>
      <Link href="/studio/login">Back to sign in</Link>
    </form>
  );
}

export function ConfirmResetForm({ token }: Readonly<{ token: string }>) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setStatus("submitting");
    const response = await fetch("/api/auth/reset-password/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setStatus("idle");
      setError(payload.error ?? "This reset link is invalid or has expired.");
      return;
    }
    setStatus("done");
    setTimeout(() => router.push("/studio/login"), 1500);
  }

  if (status === "done") {
    return <p className="empty-state">Password updated. Redirecting to sign in…</p>;
  }

  return (
    <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
      <label className="studio-field" htmlFor="reset-password">
        <span>New password</span>
        <input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="studio-field" htmlFor="reset-password-confirm">
        <span>Confirm new password</span>
        <input
          id="reset-password-confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button" disabled={status === "submitting"}>
        {status === "submitting" ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}
