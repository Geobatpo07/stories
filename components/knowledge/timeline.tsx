import Link from "next/link";
import type { Route } from "next";
import type { TimelineEntry } from "@/lib/presentation";
import { formatDate } from "@/lib/presentation";
import { groupBy } from "@/lib/utils";

export function ResearchTimeline({
  entries,
  limit,
}: Readonly<{ entries: readonly TimelineEntry[]; limit?: number }>) {
  const visible = limit ? entries.slice(0, limit) : entries;
  const groups = groupBy(visible, (entry) => entry.date.slice(0, 4));
  return (
    <div className="research-timeline">
      {Object.entries(groups)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(
          ([year, yearEntries]) =>
            yearEntries && (
              <section key={year} aria-labelledby={`timeline-${year}`}>
                <h3 id={`timeline-${year}`}>{year}</h3>
                <ol>
                  {yearEntries.map((entry) => (
                    <li key={entry.id}>
                      <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                      <div>
                        <small>{entry.kind}</small>
                        <h4>
                          <Link href={entry.href as Route}>{entry.title}</Link>
                        </h4>
                        <p>{entry.summary}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ),
        )}
    </div>
  );
}
