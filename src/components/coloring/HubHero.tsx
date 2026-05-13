import Link from "next/link";
import type { ReactNode } from "react";

import type { ColoringHub } from "@/lib/coloring/types";

type HubHeroProps = {
  hub: ColoringHub;
  intro?: string;
  primaryCtaLabel?: string;
  children?: ReactNode;
};

export function HubHero({ hub, intro, primaryCtaLabel = "Browse gallery", children }: HubHeroProps) {
  return (
    <section className={children ? "hub-hero" : "hub-hero hub-hero-solo"} aria-labelledby="hub-title">
      <div className="hero-copy">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          {hub.breadcrumbPath.map((crumb, index) => (
            <span key={`${crumb.route}-${index}`}>
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              <Link href={crumb.route} prefetch={false}>{crumb.label}</Link>
            </span>
          ))}
        </nav>
        <h1 className="page-title page-title-wide" id="hub-title">{hub.h1}</h1>
        <p>{intro || hub.intro}</p>
        <ul className="hero-facts" aria-label="Gallery summary">
          <li><strong>{hub.assetCount.toLocaleString()}</strong> printable pages</li>
          <li>PNG downloads</li>
          <li>Print from the gallery</li>
        </ul>
        <div className="hero-actions">
          <Link className="button button-primary" href="#gallery" prefetch={false}>
            {primaryCtaLabel}
          </Link>
          <Link className="button button-ghost" href="/coloring-pages" prefetch={false}>
            All collections
          </Link>
        </div>
      </div>
      {children ? <div className="hero-panel">{children}</div> : null}
    </section>
  );
}
