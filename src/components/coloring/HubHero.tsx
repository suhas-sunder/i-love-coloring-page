import Link from "next/link";
import type { ReactNode } from "react";

import type { ColoringHub } from "@/lib/coloring/types";

export type HeroQuickLink = {
  label: string;
  href: string;
};

export type HeroRelatedLink = {
  label: string;
  href: string;
  assetCount?: number;
};

type HubHeroProps = {
  hub: ColoringHub;
  intro?: string;
  primaryCtaLabel?: string;
  quickLinks?: HeroQuickLink[];
  relatedTitle?: string;
  relatedLinks?: HeroRelatedLink[];
  children?: ReactNode;
};

export function HubHero({
  hub,
  intro,
  primaryCtaLabel = "Browse gallery",
  quickLinks,
  relatedTitle = "Related collections",
  relatedLinks = [],
  children,
}: HubHeroProps) {
  const heroQuickLinks = quickLinks || [
    { label: primaryCtaLabel, href: "#gallery" },
    { label: "Related collections", href: "#related-collections" },
    { label: "About this collection", href: "#about-this-collection" },
  ];
  const hasHeroPanel = relatedLinks.length > 0 || Boolean(children);

  return (
    <section className={hasHeroPanel ? "hub-hero" : "hub-hero hub-hero-solo"} aria-labelledby="hub-title">
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
        </ul>
        <div className="hero-actions">
          {heroQuickLinks.map((link, index) => (
            <Link className={index === 0 ? "button button-primary" : "button button-ghost"} href={link.href} key={link.href} prefetch={false}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      {hasHeroPanel ? (
        <div className="hero-panel">
          {relatedLinks.length > 0 ? (
            <nav className="hero-related-panel" aria-label={relatedTitle}>
              <h2 className="hero-related-title">{relatedTitle}</h2>
              <div className="hero-related-links">
                {relatedLinks.map((link) => (
                  <Link className="hero-related-link" href={link.href} key={link.href} prefetch={false}>
                    <span className="hero-related-label">{link.label}</span>
                    {typeof link.assetCount === "number" ? <strong className="hero-related-count">{link.assetCount.toLocaleString()}</strong> : null}
                  </Link>
                ))}
              </div>
            </nav>
          ) : (
            children
          )}
        </div>
      ) : null}
    </section>
  );
}
