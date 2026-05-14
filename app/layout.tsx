import type { Metadata } from "next";
import { Figtree, Fraunces } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { siteConfig } from "@/lib/site/siteConfig";

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
        <div className="site-shell">
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
