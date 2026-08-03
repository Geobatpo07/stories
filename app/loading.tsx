export default function Loading() {
  return (
    <main
      id="main-content"
      className="shell page loading-state"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="eyebrow">Opening the research record</p>
      <div className="loading-line loading-title" />
      <div className="loading-line" />
      <div className="loading-line loading-short" />
      <span className="sr-only">Loading research</span>
    </main>
  );
}
