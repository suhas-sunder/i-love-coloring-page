import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import { Figtree, Fraunces } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

import { AdSenseScript } from "@/components/ads/AdSenseScript";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteInteractionProvider } from "@/components/site/SiteInteractionProvider";
import { siteConfig } from "@/lib/site/siteConfig";

const buildRevision = readBuildRevision();
const defaultDescription = "Printable coloring pages organized by useful subjects, styles, holidays, and themes.";
const defaultOgImage = {
  url: `${siteConfig.siteUrl}/og/home.jpg`,
  width: 1200,
  height: 630,
  alt: "I Love Coloring Page social preview image",
};

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: siteConfig.siteName,
    template: `%s | ${siteConfig.siteName}`,
  },
  description: defaultDescription,
  icons: {
    icon: "/icon.svg",
  },
  other: {
    "build-revision": buildRevision.revision,
    "runtime-data-sha256": buildRevision.runtimeDataSha256,
  },
  openGraph: {
    title: siteConfig.siteName,
    description: defaultDescription,
    url: siteConfig.siteUrl,
    siteName: siteConfig.siteName,
    type: "website",
    images: [defaultOgImage],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.siteName,
    description: defaultDescription,
    images: [
      {
        url: defaultOgImage.url,
        alt: defaultOgImage.alt,
      },
    ],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${figtree.variable} ${fraunces.variable}`}>
        <AdSenseScript />
        <SiteInteractionProvider>
          <div className="site-shell">
            <SiteHeader />
            {children}
            <SiteFooter />
          </div>
        </SiteInteractionProvider>
      </body>
    </html>
  );
}

function readBuildRevision(): { revision: string; runtimeDataSha256: string } {
  try {
    const raw = readFileSync(path.join(process.cwd(), "public", "build-revision.json"), "utf8");
    const value = JSON.parse(raw) as { revision?: unknown; runtimeDataSha256?: unknown };
    if (typeof value.revision === "string" && typeof value.runtimeDataSha256 === "string") {
      return { revision: value.revision, runtimeDataSha256: value.runtimeDataSha256 };
    }
  } catch {
    // The build command generates this file before Next.js starts. A fallback keeps
    // type checking and local development safe in a clean checkout.
  }
  return {
    revision: process.env.COMMIT_REF || "local-unbuilt",
    runtimeDataSha256: "unavailable",
  };
}
