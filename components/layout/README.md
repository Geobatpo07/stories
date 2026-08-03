# components/layout

Structural chrome shared across routes: shell, navigation, sidebar, footer.

Empty at foundation stage — no navigation model has been designed yet. Components placed
here must stay presentational; anything that decides *what* to show (which programs are
active, which questions are open) belongs in a `domain/*/service.ts` and is passed in as
props or fetched by the route (a Server Component), never queried from inside a layout
component itself.
