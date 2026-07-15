import Link from "next/link";

import { footerNavLinks, footerPolicyLinks } from "@/lib/navigation/siteNav";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <span className="site-footer-note">Printable coloring pages organized for easy browsing, printing, and PNG, JPG, or WebP downloads.</span>
        </div>
        <nav className="site-footer-nav" aria-label="Footer navigation">
          <Link href="/coloring-pages" prefetch={false}>Coloring Pages</Link>
          <Link href="/sitemap" prefetch={false}>Sitemap</Link>
          {footerNavLinks.map((link) => (
            <Link href={link.href} key={link.href} prefetch={false}>
              {link.label}
            </Link>
          ))}
          {footerPolicyLinks.map((link) => (
            <Link href={link.href} key={link.href} prefetch={false}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
