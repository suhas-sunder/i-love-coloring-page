import Link from "next/link";

import { AssetImage } from "@/components/coloring/AssetImage";
import { GalleryGrid } from "@/components/coloring/GalleryGrid";
import { HubCard } from "@/components/coloring/HubCard";
import { hasConfiguredColoringAssetSource, resolveColoringAssetUrl } from "@/lib/coloring/assets";
import { getAllPhase1Hubs, getGeneratedFeaturedItems, getRootHub } from "@/lib/coloring/data";

export default function HomePage() {
  const rootHub = getRootHub();
  const featuredItems = getGeneratedFeaturedItems(rootHub);
  const featuredHubs = getAllPhase1Hubs()
    .filter((hub) => ["animals", "plushies", "mandalas", "for-kids", "fantasy", "christmas"].includes(hub.slug))
    .slice(0, 6);
  const showHeroPreviews = hasConfiguredColoringAssetSource() && featuredItems.length > 0;

  return (
    <main className="page-shell">
      <section className={showHeroPreviews ? "hub-hero" : "hub-hero hub-hero-solo"}>
        <div className="hero-copy">
          <h1 className="page-title">I Love Coloring Page</h1>
          <p>Printable coloring pages with real previews, quick browsing, and PNG or SVG downloads when you find the right page.</p>
          <ul className="hero-facts" aria-label="Gallery summary">
            <li><strong>{rootHub.assetCount.toLocaleString()}</strong> printable pages</li>
            <li>PNG and SVG files</li>
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
                  <AssetImage
                    item={item}
                    imageUrl={resolveColoringAssetUrl(item.assetSubpaths.thumbnail || item.assetSubpaths.pngPreview)}
                    priority={index < 2}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="content-section featured-strip">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title">Fresh pages to print</h2>
            <p>Start with a few strong previews, then jump into the full library when you want more.</p>
          </div>
        </div>
        <GalleryGrid items={featuredItems.slice(0, 8)} priorityCount={6} />
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

      <section className="content-section section-band">
        <div className="section-inner split-section">
          <div>
            <h2 className="section-title">Built for printing first</h2>
            <p className="section-copy">
              The public library is focused on finding printable pages quickly. An online coloring workspace can come later as a separate experience.
            </p>
          </div>
          <ul className="section-list">
            <li>
              <span>Pick a collection</span>
              <strong>Animals, mandalas, holidays, and more</strong>
            </li>
            <li>
              <span>Use the file you need</span>
              <strong>PNG, SVG, or print from the page</strong>
            </li>
            <li>
              <span>Keep browsing simple</span>
              <strong>Clear collection pages without clutter</strong>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
