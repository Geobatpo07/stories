"use client";
export default function ErrorPage({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main id="main-content" className="shell not-found" role="alert">
      <p className="eyebrow">The record could not open</p>
      <h1>A page in the notebook is temporarily unavailable.</h1>
      <p>
        The research itself is safe. Try opening this page again, or return to the laboratory
        overview.
      </p>
      <p className="error-actions">
        <button className="button" type="button" onClick={reset}>
          Try again
        </button>
        <a href="/laboratory">Open the laboratory</a>
      </p>
    </main>
  );
}
