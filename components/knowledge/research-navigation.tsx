import Link from "next/link";
import type { LaboratoryEntity } from "@/lib/presentation";
import { entityHref } from "@/lib/presentation";

export function ResearchNavigation({
  previous,
  next,
  parent,
  descendants = [],
}: Readonly<{
  previous?: LaboratoryEntity;
  next?: LaboratoryEntity;
  parent?: LaboratoryEntity;
  descendants?: readonly LaboratoryEntity[];
}>) {
  if (!previous && !next && !parent && !descendants.length) return null;
  return (
    <nav className="research-navigation" aria-label="Research record navigation">
      <div className="research-navigation-context">
        {parent && (
          <div>
            <small>Parent research</small>
            <Link href={entityHref(parent)}>{parent.title}</Link>
          </div>
        )}
        {descendants.length > 0 && (
          <div>
            <small>Work within this record</small>
            <ul>
              {descendants.slice(0, 6).map((child) => (
                <li key={child.id}>
                  <Link href={entityHref(child)}>{child.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="research-navigation-sequence">
        {previous ? (
          <Link href={entityHref(previous)}>
            <small>Previous</small>
            <span>{previous.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={entityHref(next)}>
            <small>Next</small>
            <span>{next.title}</span>
          </Link>
        ) : (
          <span />
        )}
      </div>
    </nav>
  );
}

export function KnowledgeDiscovery({
  entities,
}: Readonly<{ entities: readonly LaboratoryEntity[] }>) {
  const groups = [
    ["Related programs", entities.filter((item) => item.kind === "program")],
    ["Related projects", entities.filter((item) => item.kind === "question")],
    ["Related stories", entities.filter((item) => item.kind === "note")],
    [
      "Related artifacts",
      entities.filter((item) =>
        ["publication", "dataset", "software", "presentation"].includes(item.kind),
      ),
    ],
  ] as const;
  const populated = groups.filter(([, items]) => items.length);
  if (!populated.length)
    return (
      <section className="content-section">
        <header className="section-heading">
          <h2>Continue exploring</h2>
        </header>
        <p className="empty-state">This is currently the edge of the published research record.</p>
      </section>
    );
  return (
    <section className="discovery-section" aria-labelledby="discovery-title">
      <header className="section-heading">
        <h2 id="discovery-title">Continue exploring</h2>
        <p>Follow the relationships already present in the research record.</p>
      </header>
      <div className="discovery-grid">
        {populated.map(([title, items]) => (
          <div key={title}>
            <h3>{title}</h3>
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <Link href={entityHref(item)}>
                    {item.title}
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
