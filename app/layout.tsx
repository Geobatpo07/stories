import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { createSearchRecords, getLaboratory } from "@/lib/presentation";
import "@/styles/globals.css";
import "katex/dist/katex.min.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const lab = await getLaboratory();
  return {
    metadataBase: new URL(siteUrl),
    title: { default: "Geo's Stories — Open Research Laboratory", template: "%s · Geo's Stories" },
    description:
      "A living digital research laboratory where programs become projects, stories, and scientific artifacts.",
    alternates: { canonical: "/" },
    generator: `Geo's Stories ${lab.metadata.platformVersion}`,
    openGraph: {
      type: "website",
      siteName: "Geo's Stories Research Laboratory",
      title: "Geo's Stories — Digital Research Laboratory",
      description: "The public memory of an evolving research practice.",
      url: "/",
    },
    twitter: {
      card: "summary",
      title: "Geo's Stories — Digital Research Laboratory",
      description: "The public memory of an evolving research practice.",
    },
    other: {
      "stories:platform-version": lab.metadata.platformVersion,
      "stories:knowledge-build": lab.metadata.generatedAt,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const searchRecords = createSearchRecords(await getLaboratory());
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('stories-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        <SiteShell searchRecords={searchRecords}>{children}</SiteShell>
      </body>
    </html>
  );
}
