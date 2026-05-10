import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

import { getSiteUrl } from "@/lib/coloring/data";

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
      <body>
        <div className="site-shell">
          <header className="site-header">
            <div className="site-header-inner">
              <Link className="brand" href="/coloring-pages">
                <span className="brand-mark" aria-hidden="true">IL</span>
                <span>I Love Coloring Page</span>
              </Link>
              <nav className="site-nav" aria-label="Main navigation">
                <Link className="button button-secondary" href="/coloring-pages">
                  Browse Coloring Pages
                </Link>
              </nav>
            </div>
          </header>
          {children}
          <footer className="site-footer">
            <div className="site-header-inner">
              <span>Printable coloring pages from approved gallery data.</span>
              <Link href="/coloring-pages">Coloring Pages</Link>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
