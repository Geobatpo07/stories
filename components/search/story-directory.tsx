"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

export interface StoryDirectoryItem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly tags: readonly string[];
  readonly noteType: string;
  readonly minutes: number;
  readonly programSlug?: string;
  readonly projectSlugs: readonly string[];
}
export interface DirectoryOption {
  readonly value: string;
  readonly label: string;
}
type Filters = { program: string; project: string; year: string; tag: string; sort: string };
const defaults: Filters = { program: "", project: "", year: "", tag: "", sort: "newest" };

export function StoryDirectory({
  stories,
  programs,
  projects,
}: Readonly<{
  stories: readonly StoryDirectoryItem[];
  programs: readonly DirectoryOption[];
  projects: readonly DirectoryOption[];
}>) {
  const [filters, setFilters] = useState<Filters>(defaults);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setFilters({
      program: query.get("program") ?? "",
      project: query.get("project") ?? "",
      year: query.get("year") ?? "",
      tag: query.get("tag") ?? "",
      sort: query.get("sort") ?? "newest",
    });
  }, []);
  const years = useMemo(
    () => [...new Set(stories.map((story) => story.date.slice(0, 4)))].sort().reverse(),
    [stories],
  );
  const tags = useMemo(
    () => [...new Set(stories.flatMap((story) => story.tags))].sort(),
    [stories],
  );
  const visible = useMemo(
    () =>
      stories
        .filter(
          (story) =>
            (!filters.program || story.programSlug === filters.program) &&
            (!filters.project || story.projectSlugs.includes(filters.project)) &&
            (!filters.year || story.date.startsWith(filters.year)) &&
            (!filters.tag || story.tags.includes(filters.tag)),
        )
        .sort((a, b) =>
          filters.sort === "oldest"
            ? a.date.localeCompare(b.date)
            : filters.sort === "reading-time"
              ? b.minutes - a.minutes
              : b.date.localeCompare(a.date),
        ),
    [stories, filters],
  );
  const update = (next: Filters) => {
    setFilters(next);
    const query = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (value && !(key === "sort" && value === "newest")) query.set(key, value);
    });
    window.history.replaceState(null, "", query.size ? `/stories?${query}` : "/stories");
  };
  return (
    <>
      <form className="filter-form" onSubmit={(event) => event.preventDefault()}>
        <Filter
          label="Program"
          value={filters.program}
          options={programs}
          onChange={(value) => update({ ...filters, program: value })}
        />
        <Filter
          label="Project"
          value={filters.project}
          options={projects}
          onChange={(value) => update({ ...filters, project: value })}
        />
        <Filter
          label="Year"
          value={filters.year}
          options={years.map((year) => ({ value: year, label: year }))}
          onChange={(value) => update({ ...filters, year: value })}
        />
        <Filter
          label="Tag"
          value={filters.tag}
          options={tags.map((tag) => ({ value: tag, label: tag }))}
          onChange={(value) => update({ ...filters, tag: value })}
        />
        <Filter
          label="Sort"
          value={filters.sort}
          allLabel="Default"
          options={[
            { value: "newest", label: "Newest" },
            { value: "oldest", label: "Oldest" },
            { value: "reading-time", label: "Reading time" },
          ]}
          onChange={(value) => update({ ...filters, sort: value || "newest" })}
        />
        <button className="button" type="button" onClick={() => update(defaults)}>
          Reset
        </button>
      </form>
      <p className="directory-count" role="status" aria-live="polite">
        {visible.length} {visible.length === 1 ? "story" : "stories"}
      </p>
      {visible.length ? (
        <div className="story-list">
          {visible.map((story) => (
            <article className="story-card" key={story.id}>
              <div>
                <p className="card-kicker">{story.noteType.replaceAll("-", " ")}</p>
                <h3>
                  <Link href={`/stories/${story.slug}` as Route}>{story.title}</Link>
                </h3>
                <p>{story.summary}</p>
                <ul className="tag-list" aria-label="Tags">
                  {story.tags.map((tag) => (
                    <li key={tag}>
                      <button type="button" onClick={() => update({ ...filters, tag })}>
                        {tag}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="story-card-meta">
                <time dateTime={story.date}>{story.dateLabel}</time>
                <span>{story.minutes} min read</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">
          No stories match these filters. Clear a filter to continue exploring.
        </p>
      )}
    </>
  );
}

function Filter({
  label,
  value,
  options,
  onChange,
  allLabel = "All",
}: Readonly<{
  label: string;
  value: string;
  options: readonly DirectoryOption[];
  onChange: (value: string) => void;
  allLabel?: string;
}>) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
