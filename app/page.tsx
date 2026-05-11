import type { Metadata } from "next";
import Link from "next/link";

import { AdRail } from "@/components/ads/AdRail";
import { AdSlot } from "@/components/ads/AdSlot";
import { AssetImage } from "@/components/coloring/AssetImage";
import { GalleryGrid } from "@/components/coloring/GalleryGrid";
import { HubCard } from "@/components/coloring/HubCard";
import { SeoContentSection } from "@/components/coloring/SeoContentSection";
import { hasConfiguredColoringAssetSource, resolveColoringAssetUrl } from "@/lib/coloring/assets";
import { getAllPhase1Hubs, getColoringItemHref, getGeneratedFeaturedItems, getRootHub, getSeoPageContent } from "@/lib/coloring/data";
import { buildColoringMetadata } from "@/lib/coloring/metadata";

export function generateMetadata(): Metadata {
  return buildColoringMetadata("/");
}

export default function HomePage() {
  const rootHub = getRootHub();
  const seoContent = getSeoPageContent("/");
  const featuredItems = getGeneratedFeaturedItems(rootHub);
  const featuredHubs = getAllPhase1Hubs()
    .filter((hub) => ["animals", "plushies", "mandalas", "for-kids", "fantasy", "christmas"].includes(hub.slug))
    .slice(0, 6);
  const showHeroPreviews = hasConfiguredColoringAssetSource() && featuredItems.length > 0;

  return (
    <main className="page-shell">
      <AdSlot slotId="home-header-banner" />
      <AdRail side="left" slotId="rail-left-desktop" />
      <AdRail side="right" slotId="rail-right-desktop" />
      <section className={showHeroPreviews ? "hub-hero" : "hub-hero hub-hero-solo"}>
        <div className="hero-copy">
          <h1 className="page-title">I Love Coloring Page</h1>
          <p>Printable coloring pages with real previews, quick browsing, and clean print controls when you find the right page.</p>
          <ul className="hero-facts" aria-label="Gallery summary">
            <li><strong>{rootHub.assetCount.toLocaleString()}</strong> printable pages</li>
            <li>Printable files ready from each card</li>
            <li>Searchable subject collections</li>
          </ul>
          <div className="hero-actions">
            <Link className="button button-primary" href="/coloring-pages#gallery" prefetch={false}>
              Browse gallery
            </Link>
            <Link className="button button-ghost" href="/coloring-pages" prefetch={false}>
              View collections
            </Link>
          </div>
        </div>
        {showHeroPreviews ? (
          <div className="hero-panel">
            <div className="hero-preview-grid hero-preview-grid-compact" aria-label="Featured coloring page previews">
              {featuredItems.slice(0, 6).map((item, index) => (
                <div className="preview-tile" key={item.assetId}>
                  <Link className="preview-tile-link" href={getColoringItemHref(item, rootHub.route)} prefetch={false}>
                    <AssetImage
                      item={item}
                      imageUrl={resolveColoringAssetUrl(item.assetSubpaths.thumbnail || item.assetSubpaths.pngPreview)}
                      priority={index < 2}
                    />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <AdSlot slotId="home-after-hero" />

      <section className="content-section section-band featured-band">
        <div className="section-inner">
          <div className="section-heading-row">
            <div>
              <h2 className="section-title">Fresh pages to print</h2>
              <p>Start with a few strong previews, then jump into the full library when you want more.</p>
            </div>
          </div>
          <GalleryGrid
            items={featuredItems.slice(0, 8)}
            getItemHref={(item) => getColoringItemHref(item, rootHub.route)}
            priorityCount={6}
          />
        </div>
      </section>

      <section className="content-section collection-section">
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

      <SeoContentSection content={seoContent} />
    </main>
  );
}
