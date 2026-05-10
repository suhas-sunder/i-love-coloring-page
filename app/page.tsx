import Link from "next/link";

import { AssetImage } from "@/components/coloring/AssetImage";
import { HubCard } from "@/components/coloring/HubCard";
import { hasConfiguredColoringAssetSource } from "@/lib/coloring/assets";
import { getAllPhase1Hubs, getFeaturedItems, getRootHub } from "@/lib/coloring/data";

export default function HomePage() {
  const rootHub = getRootHub();
  const featuredItems = getFeaturedItems(rootHub).slice(0, 4);
  const featuredHubs = getAllPhase1Hubs()
    .filter((hub) => ["plushies", "animals", "mandalas", "christmas"].includes(hub.slug))
    .slice(0, 4);
  const showHeroPreviews = hasConfiguredColoringAssetSource() && featuredItems.length > 0;

  return (
    <main className="page-shell">
      <section className={showHeroPreviews ? "hub-hero" : "hub-hero hub-hero-solo"}>
        <div className="hero-copy">
          <h1 className="page-title">I Love Coloring Page</h1>
          <p>A calm library of printable coloring pages for classrooms, weekend projects, and quiet creative time.</p>
          <ul className="hero-facts" aria-label="Gallery summary">
            <li><strong>{rootHub.assetCount.toLocaleString()}</strong> printable pages</li>
            <li>SVG and PNG downloads</li>
            <li>Browse by theme, subject, and style</li>
          </ul>
          <div className="hero-actions">
            <Link className="button button-primary" href="/coloring-pages">
              Browse Coloring Pages
            </Link>
          </div>
        </div>
        {showHeroPreviews ? (
          <div className="hero-panel">
            <div className="hero-preview-grid" aria-label="Featured coloring page previews">
              {featuredItems.map((item, index) => (
                <div className="preview-tile" key={item.assetId}>
                  <AssetImage item={item} priority={index < 2} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title">Popular collections</h2>
            <p>Start with animals, plushies, mandalas, and seasonal pages when you want something printable right away.</p>
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
    </main>
  );
}
