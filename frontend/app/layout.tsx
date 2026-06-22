import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocOps — Industrial Knowledge Copilot",
  description:
    "DocOps: AI-powered knowledge platform for asset-intensive industries. Query your plant manuals, maintenance records, and safety procedures instantly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
