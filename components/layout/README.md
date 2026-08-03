# components/layout

Structural chrome shared across routes: shell, navigation, sidebar, footer.

`SiteShell` provides the semantic header, primary navigation, skip link, and footer. It
remains presentational; route-level Server Components obtain all knowledge through
`lib/presentation` and pass typed data downward.
