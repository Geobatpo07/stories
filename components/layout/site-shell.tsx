import Link from "next/link";
import type { Route } from "next";
import type { SearchRecord } from "@/lib/presentation/types";
import { SearchPalette } from "@/components/search/search-experience";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
  ["Programs", "/programs"],
  ["Projects", "/projects"],
  ["Stories", "/stories"],
  ["Artifacts", "/artifacts"],
  ["Laboratory", "/laboratory" as Route],
] as const satisfies readonly (readonly [string, Route])[];

export function SiteShell({
  children,
  searchRecords = [],
}: Readonly<{ children: React.ReactNode; searchRecords?: readonly SearchRecord[] }>) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="shell header-inner">
          <Link className="wordmark" href="/" aria-label="Geo's Stories laboratory home">
            <span className="wordmark-mark" aria-hidden="true">
              S
            </span>
            <span>
              Geo&apos;s Stories <small>Research Laboratory</small>
            </span>
          </Link>
          <nav aria-label="Primary navigation">
            <ul className="primary-nav">
              {navigation.map(([label, href]) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
              <li>
                {searchRecords.length ? (
                  <SearchPalette records={searchRecords} />
                ) : (
                  <Link href={"/search" as Route}>Search</Link>
                )}
              </li>
              <li>
                <ThemeToggle />
              </li>
            </ul>
          </nav>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <div className="shell footer-inner">
          <p>Geo&apos;s Stories is the public memory of an evolving research practice.</p>
          <p>
            <a href="/rss.xml">RSS</a> · <a href="/sitemap.xml">Sitemap</a>{" "}
            <Link
              href="/studio"
              className="footer-studio-link"
              aria-label="Studio access"
              title="Studio"
            >
              ●
            </Link>
          </p>
        </div>
      </footer>
    </>
  );
}
