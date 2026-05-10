import Link from "next/link";

import { footerNavLinks } from "@/lib/navigation/siteNav";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <span className="site-footer-note">Printable SVG and PNG coloring pages, organized for easy browsing.</span>
        </div>
        <nav className="site-footer-nav" aria-label="Footer navigation">
          <Link href="/coloring-pages" prefetch={false}>Coloring Pages</Link>
          {footerNavLinks.map((link) => (
            <Link href={link.href} key={link.href} prefetch={false}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
