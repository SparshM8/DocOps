import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocOps | Enterprise v2.4 Dashboard",
  description: "DocOps: AI-powered knowledge platform for asset-intensive industries.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,700&family=Geist:wght@600;700;800&display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet"/>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

