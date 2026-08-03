import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Stories — Open Research Laboratory",
    template: "%s · Stories",
  },
  description:
    "Stories is the operating system of a research laboratory: research programs, questions, hypotheses, experiments, knowledge objects, software, publications and datasets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
