import Link from "next/link";

import { AssetImage } from "@/components/coloring/AssetImage";
import { HubCard } from "@/components/coloring/HubCard";
import { hasConfiguredColoringAssetSource, resolveColoringAssetUrl } from "@/lib/coloring/assets";
import { getAllPhase1Hubs, getFeaturedItems, getRootHub } from "@/lib/coloring/data";

export default function HomePage() {
  const rootHub = getRootHub();
  const featuredItems = getFeaturedItems(rootHub).slice(0, 4);
  const featuredHubs = getAllPhase1Hubs()
    .filter((hub) => ["animals", "plushies", "mandalas", "for-kids", "fantasy", "christmas"].includes(hub.slug))
    .slice(0, 6);
  const showHeroPreviews = hasConfiguredColoringAssetSource() && featuredItems.length > 0;

  return (
    <main className="page-shell">
      <section className={showHeroPreviews ? "hub-hero" : "hub-hero hub-hero-solo"}>
        <div className="hero-copy">
          <h1 className="page-title">I Love Coloring Page</h1>
          <p>A calm library of printable coloring pages for classrooms, weekend projects, and quiet creative time.</p>
          <ul className="hero-facts" aria-label="Gallery summary">
            <li><strong>{rootHub.assetCount.toLocaleString()}</strong> printable pages</li>
            <li>PNG and SVG files</li>
            <li>Organized by subject and season</li>
          </ul>
          <div className="hero-actions">
            <Link className="button button-primary" href="/coloring-pages">
              See Coloring Pages
            </Link>
          </div>
        </div>
        {showHeroPreviews ? (
          <div className="hero-panel">
            <div className="hero-preview-grid" aria-label="Featured coloring page previews">
              {featuredItems.map((item, index) => (
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

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title">Good places to start</h2>
            <p>Choose a familiar collection first, then print a page or download the file you want.</p>
          </div>
          <Link className="button button-ghost" href="/coloring-pages">
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
