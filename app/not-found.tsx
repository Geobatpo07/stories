import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="shell not-found">
      <p className="eyebrow">404 · Record not found</p>
      <h1>This path leaves the notebook.</h1>
      <p>
        The research record may have moved, or the address may be incomplete. Return to the
        laboratory and continue from a known thread.
      </p>
      <p>
        <Link href="/">Return to the laboratory →</Link>
      </p>
    </main>
  );
}
