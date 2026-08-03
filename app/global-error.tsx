"use client";
export default function GlobalError({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <html lang="en">
      <body>
        <main className="shell not-found" role="alert">
          <p className="eyebrow">The laboratory is momentarily closed</p>
          <h1>The research record could not be opened.</h1>
          <p>
            Please try once more. If the record remains unavailable, return after the laboratory
            snapshot has been restored.
          </p>
          <button className="button" type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
