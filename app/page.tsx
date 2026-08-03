/**
 * Foundation placeholder. This sprint scaffolds the platform only —
 * no research surfaces are implemented yet. See docs/roadmap for what
 * replaces this page next.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
        Stories · Open Research Laboratory
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Foundations are in place.</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        This sprint scaffolds the domain model, content pipeline, and analytical index for the
        platform. Research Programs, Questions, Hypotheses, Experiments, Knowledge Objects,
        Software, Publications, and Datasets are modeled in{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-900">domain/</code>{" "}
        and sourced from{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-900">content/</code> —
        no business logic has shipped yet. See{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-900">
          docs/architecture/Architecture.md
        </code>
        .
      </p>
    </main>
  );
}
