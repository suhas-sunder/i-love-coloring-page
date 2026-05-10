import Link from "next/link";

import { primaryNavLinks } from "@/lib/navigation/siteNav";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">IL</span>
          <span>I Love Coloring Page</span>
        </Link>
        <nav className="site-nav site-nav-desktop" aria-label="Main navigation">
          {primaryNavLinks.map((link) => (
            <Link className="site-nav-link" href={link.href} key={link.href} prefetch={false}>
              <span className="nav-label-full">{link.label}</span>
              <span className="nav-label-short">{link.shortLabel || link.label}</span>
            </Link>
          ))}
        </nav>
        <details className="site-nav-mobile">
          <summary aria-label="Open mobile browse navigation">Browse</summary>
          <nav aria-label="Mobile browse navigation">
            {primaryNavLinks.map((link) => (
              <Link href={link.href} key={link.href} prefetch={false}>
                {link.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
