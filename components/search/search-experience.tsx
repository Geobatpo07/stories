"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { SearchRecord } from "@/lib/presentation/types";
import { searchRecords } from "@/lib/presentation/search";

export function SearchPalette({ records }: Readonly<{ records: readonly SearchRecord[] }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const results = useMemo(() => searchRecords(records, query, 8), [records, query]);

  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if (
        (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !isTyping)
      ) {
        event.preventDefault();
        dialog.current?.showModal();
        requestAnimationFrame(() => input.current?.focus());
      }
    };
    window.addEventListener("keydown", open);
    return () => window.removeEventListener("keydown", open);
  }, []);

  const choose = (href: string) => {
    dialog.current?.close();
    setQuery("");
    router.push(href as Route);
  };

  return (
    <>
      <button
        className="search-trigger"
        type="button"
        onClick={() => {
          dialog.current?.showModal();
          requestAnimationFrame(() => input.current?.focus());
        }}
        aria-label="Search the laboratory"
      >
        <span aria-hidden="true">⌕</span>
        <kbd>⌘K</kbd>
      </button>
      <dialog
        className="search-dialog"
        ref={dialog}
        onClose={() => {
          setQuery("");
          setActive(0);
        }}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="search-dialog-inner">
          <div className="search-input-row">
            <span aria-hidden="true">⌕</span>
            <input
              ref={input}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((value) => Math.min(value + 1, results.length - 1));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((value) => Math.max(value - 1, 0));
                }
                if (event.key === "Enter" && results[active]) {
                  event.preventDefault();
                  choose(results[active].href);
                }
              }}
              placeholder="Search programs, projects, stories, artifacts…"
              aria-label="Search query"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="global-search-results"
              aria-activedescendant={
                results[active] ? `global-result-${results[active].id}` : undefined
              }
            />
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close search">
              Esc
            </button>
          </div>
          <p className="search-count" role="status" aria-live="polite">
            {query
              ? `${results.length} ${results.length === 1 ? "result" : "results"}`
              : "Latest knowledge"}
          </p>
          <ul className="search-results" id="global-search-results" role="listbox">
            {results.map((result, index) => (
              <li
                key={result.id}
                id={`global-result-${result.id}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(result.href)}
                onMouseEnter={() => setActive(index)}
              >
                <span>
                  <small>
                    {result.kind}
                    {result.subtype ? ` · ${result.subtype.replaceAll("-", " ")}` : ""}
                  </small>
                  <strong>{result.title}</strong>
                  <em>{result.summary}</em>
                </span>
                <span aria-hidden="true">↗</span>
              </li>
            ))}
          </ul>
          {!results.length && (
            <p className="search-empty">
              No research matches this query. Try a broader idea or a tag.
            </p>
          )}
          <footer>
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> navigate
            </span>
            <span>
              <kbd>↵</kbd> open
            </span>
            <a href="/search">Full search</a>
          </footer>
        </div>
      </dialog>
    </>
  );
}

export function SearchDirectory({ records }: Readonly<{ records: readonly SearchRecord[] }>) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All");
  const results = useMemo(
    () =>
      searchRecords(
        records.filter((record) => kind === "All" || record.kind === kind),
        query,
        records.length,
      ),
    [records, query, kind],
  );
  return (
    <section className="search-directory" aria-labelledby="search-directory-title">
      <h2 id="search-directory-title" className="sr-only">
        Search results
      </h2>
      <div className="search-page-input">
        <span aria-hidden="true">⌕</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="What are you curious about?"
          aria-label="Search the laboratory"
        />
      </div>
      <div className="search-kind-filter" role="group" aria-label="Filter by research type">
        {["All", "Program", "Project", "Story", "Artifact"].map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <p className="search-count" role="status" aria-live="polite">
        {results.length} {results.length === 1 ? "result" : "results"}
      </p>
      <ul className="search-page-results">
        {results.map((result) => (
          <li key={result.id}>
            <a href={result.href}>
              <small>
                {result.kind}
                {result.subtype ? ` · ${result.subtype.replaceAll("-", " ")}` : ""}
              </small>
              <h3>{result.title}</h3>
              <p>{result.summary}</p>
              <span>{result.tags.slice(0, 4).join(" · ")}</span>
            </a>
          </li>
        ))}
      </ul>
      {!results.length && (
        <p className="empty-state">
          No research matches this query. Try fewer words or browse by collection.
        </p>
      )}
    </section>
  );
}
