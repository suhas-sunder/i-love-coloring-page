import type { Metadata } from "next";
import { Figtree, Fraunces } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

import { getSiteUrl } from "@/lib/coloring/data";

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
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "I Love Coloring Page",
    template: "%s | I Love Coloring Page",
  },
  description: "Printable coloring pages organized by useful subjects, styles, holidays, and themes.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${figtree.variable} ${fraunces.variable}`}>
        <div className="site-shell">
          <header className="site-header">
            <div className="site-header-inner">
              <Link className="brand" href="/">
                <span className="brand-mark" aria-hidden="true">IL</span>
                <span>I Love Coloring Page</span>
              </Link>
              <nav className="site-nav" aria-label="Main navigation">
                <Link className="button button-subtle" href="/coloring-pages">
                  Browse Coloring Pages
                </Link>
              </nav>
            </div>
          </header>
          {children}
          <footer className="site-footer">
            <div className="site-footer-inner">
              <span className="site-footer-note">Printable SVG and PNG coloring pages, organized for easy browsing.</span>
              <Link href="/coloring-pages">Browse Coloring Pages</Link>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
