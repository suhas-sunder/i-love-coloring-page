import type { Metadata } from "next";
import Link from "next/link";

import { AdRail } from "@/components/ads/AdRail";
import { AdSlot } from "@/components/ads/AdSlot";
import { HubCard } from "@/components/coloring/HubCard";
import { RotatingFeaturedGrid } from "@/components/coloring/RotatingFeaturedGrid";
import { SeoContentSection } from "@/components/coloring/SeoContentSection";
import { getAllPhase1Hubs, getFeaturedRotationCandidateItems, getGeneratedFeaturedItems, getRootHub, getSeoPageContent } from "@/lib/coloring/data";
import { buildColoringMetadata } from "@/lib/coloring/metadata";

export function generateMetadata(): Metadata {
  return buildColoringMetadata("/");
}

export default function HomePage() {
  const rootHub = getRootHub();
  const seoContent = getSeoPageContent("/");
  const featuredItems = getGeneratedFeaturedItems(rootHub);
  const featuredRotationCandidates = getFeaturedRotationCandidateItems(rootHub, 192);
  const rootHubSlug = rootHub.slug || "coloring-pages";
  const featuredHubs = getAllPhase1Hubs()
    .filter((hub) => ["animals", "plushies", "mandalas", "for-kids", "fantasy", "christmas"].includes(hub.slug))
    .slice(0, 6);

  return (
    <main className="page-shell">
      <AdSlot slotId="home-header-banner" />
      <AdRail side="left" slotId="rail-left-desktop" />
      <AdRail side="right" slotId="rail-right-desktop" />
      <section className="hub-hero">
        <div className="hero-copy">
          <h1 className="page-title">I Love Coloring Page</h1>
          <p>Printable coloring pages with real previews, quick browsing, and clean print controls when you find the right page.</p>
          <ul className="hero-facts" aria-label="Gallery summary">
            <li><strong>{rootHub.assetCount.toLocaleString()}</strong> printable pages</li>
            <li>Printable files ready from each card</li>
            <li>Searchable subject collections</li>
          </ul>
          <div className="hero-actions">
            <Link className="button button-primary" href="#gallery" prefetch={false}>
              Browse gallery
            </Link>
            <Link className="button button-ghost" href="#related-collections" prefetch={false}>
              View collections
            </Link>
            <Link className="button button-ghost" href="#about-this-collection" prefetch={false}>
              Printing tips
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <nav className="hero-related-panel" aria-label="Popular coloring page collections">
            <p className="hero-related-kicker">Explore</p>
            <h2 className="hero-related-title">Popular collections</h2>
            <div className="hero-related-links">
              {featuredHubs.map((hub) => (
                <Link className="hero-related-link" href={hub.route} key={hub.hubId} prefetch={false}>
                  <span>{hub.title.replace(/ Coloring Pages$/, "")}</span>
                  <strong>{hub.assetCount.toLocaleString()}</strong>
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </section>

      <AdSlot slotId="home-after-hero" />

      <section className="content-section section-band featured-band" id="gallery" aria-labelledby="fresh-pages">
        <div className="section-inner">
          <div className="section-heading-row">
            <div>
              <h2 className="section-title" id="fresh-pages">Fresh pages to print</h2>
              <p>Start with a few strong previews, then jump into the full library when you want more.</p>
            </div>
          </div>
          <RotatingFeaturedGrid
            fallbackItems={featuredItems.slice(0, 8)}
            candidateItems={featuredRotationCandidates}
            mode="homepage-random"
            hubSlug={rootHubSlug}
            itemHrefBasePath={rootHub.route}
            priorityCount={6}
          />
        </div>
      </section>

      <section className="content-section collection-section" id="related-collections">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title">Good places to start</h2>
            <p>Choose a familiar collection, or open the main gallery for search and filters.</p>
          </div>
          <Link className="button button-ghost" href="/coloring-pages" prefetch={false}>
            View all collections
          </Link>
        </div>
        <div className="hub-link-grid">
          {featuredHubs.map((hub) => (
            <HubCard key={hub.hubId} hub={hub} />
          ))}
        </div>
      </section>

      <AdSlot slotId="home-lower-content" />

      <SeoContentSection content={seoContent} id="about-this-collection" />
    </main>
  );
}
