import { field, getLaboratory, readingMinutes } from "@/lib/presentation";
export const dynamic = "force-static";
const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export async function GET() {
  const lab = await getLaboratory();
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const stories = [...lab.stories].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const items = stories
    .map(
      (story) =>
        `<item><title>${escapeXml(story.title)}</title><link>${base}/stories/${story.slug}</link><guid isPermaLink="true">${base}/stories/${story.slug}</guid><description>${escapeXml(story.summary)}</description><pubDate>${new Date(`${story.createdAt}T00:00:00Z`).toUTCString()}</pubDate><category>${escapeXml(field(story, "noteType") ?? "research-story")}</category><content:encoded><![CDATA[${escapeXml(story.content)}]]></content:encoded><readingTime>${readingMinutes(story)} minutes</readingTime></item>`,
    )
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Geo's Stories Research Laboratory</title><link>${base}</link><description>The public memory of an evolving research practice.</description><language>en</language><lastBuildDate>${new Date(lab.metadata.generatedAt).toUTCString()}</lastBuildDate>${items}</channel></rss>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
