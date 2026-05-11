import Link from "next/link";

import { moreHubGroups, primaryNavLinks, utilityNavLinks } from "@/lib/navigation/siteNav";

import { MobileNav } from "./MobileNav";
import { MoreHubMenu } from "./MoreHubMenu";

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
          <MoreHubMenu groups={moreHubGroups} utilityLinks={utilityNavLinks} />
        </nav>
        <MobileNav ariaLabel="Mobile browse navigation" groups={moreHubGroups} primaryLinks={primaryNavLinks} utilityLinks={utilityNavLinks} />
      </div>
    </header>
  );
}
