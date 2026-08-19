import type { MetadataRoute } from "next";
import { entityHref, getLaboratory } from "@/lib/presentation";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const lab = await getLaboratory();
  const staticRoutes = [
    // "/search" is deliberately excluded — it's `noindex` (a query-driven
    // utility page, not indexable landing content), and Google recommends
    // against listing noindex URLs in a sitemap.
    "",
    "/laboratory",
    "/programs",
    "/projects",
    "/stories",
    "/artifacts",
  ];
  return [
    ...staticRoutes.map((path) => ({
      url: `${base}${path}`,
      lastModified: new Date(lab.metadata.generatedAt),
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.7,
    })),
    ...lab.all
      .filter((entity) =>
        [
          "program",
          "question",
          "note",
          "publication",
          "dataset",
          "software",
          "presentation",
        ].includes(entity.kind),
      )
      .map((entity) => ({
        url: `${base}${entityHref(entity)}`,
        lastModified: new Date(`${entity.updatedAt}T00:00:00Z`),
        changeFrequency: "monthly" as const,
        priority: entity.kind === "note" ? 0.8 : 0.6,
      })),
  ];
}
