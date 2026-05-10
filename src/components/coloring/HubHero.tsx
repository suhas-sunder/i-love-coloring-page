import Link from "next/link";
import type { ReactNode } from "react";

import type { ColoringHub } from "@/lib/coloring/types";

type HubHeroProps = {
  hub: ColoringHub;
  children?: ReactNode;
};

export function HubHero({ hub, children }: HubHeroProps) {
  return (
    <section className="hub-hero">
      <div className="hero-copy">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          {hub.breadcrumbPath.map((crumb, index) => (
            <span key={`${crumb.route}-${index}`}>
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              <Link href={crumb.route}>{crumb.label}</Link>
            </span>
          ))}
        </nav>
        <h1 className="sky-heading">{hub.h1}</h1>
        <p>{hub.intro}</p>
        <div className="hero-stats" aria-label="Gallery summary">
          <span>{hub.assetCount.toLocaleString()} approved pages</span>
          <span>No image detail pages</span>
          <span>Print and download ready</span>
        </div>
      </div>
      {children ? <div className="hero-panel">{children}</div> : null}
    </section>
  );
}
