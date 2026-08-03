import type { SearchRecord, SearchResult } from "./types";

export function searchRecords(
  records: readonly SearchRecord[],
  query: string,
  limit = 12,
): readonly SearchResult[] {
  const normalized = normalize(query);
  if (!normalized) return records.slice(0, limit).map((record) => ({ ...record, score: 1 }));
  const terms = normalized.split(" ").filter(Boolean);
  return records
    .map((record) => ({ ...record, score: scoreRecord(record, normalized, terms) }))
    .filter((record) => record.score > 0)
    .sort(
      (a, b) => b.score - a.score || b.date.localeCompare(a.date) || a.title.localeCompare(b.title),
    )
    .slice(0, limit);
}

function scoreRecord(record: SearchRecord, query: string, terms: readonly string[]): number {
  const title = normalize(record.title);
  const summary = normalize(record.summary);
  const excerpt = normalize(record.excerpt);
  const tags = record.tags.map(normalize);
  let score = 0;
  if (title === query) score += 100;
  if (title.startsWith(query)) score += 60;
  if (title.includes(query)) score += 35;
  if (tags.some((tag) => tag === query)) score += 30;
  if (summary.includes(query)) score += 18;
  if (excerpt.includes(query)) score += 8;
  for (const term of terms) {
    if (title.includes(term)) score += 12;
    if (tags.some((tag) => tag.includes(term))) score += 8;
    if (summary.includes(term)) score += 4;
    if (excerpt.includes(term)) score += 1;
  }
  return score;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
