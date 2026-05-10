import { AssetImage } from "@/components/coloring/AssetImage";
import { FilterChips } from "@/components/coloring/FilterChips";
import { GalleryGrid } from "@/components/coloring/GalleryGrid";
import { HubCard } from "@/components/coloring/HubCard";
import { HubHero } from "@/components/coloring/HubHero";
import { Pagination } from "@/components/coloring/Pagination";
import { RelatedHubs } from "@/components/coloring/RelatedHubs";
import { hasConfiguredColoringAssetSource, resolveColoringAssetUrl } from "@/lib/coloring/assets";
import { getChildHubs, getFeaturedItems, getPagedHubItems, getRelatedHubs } from "@/lib/coloring/data";
import type { ColoringHub } from "@/lib/coloring/types";

type HubPageContentProps = {
  hub: ColoringHub;
  page: number;
};

export function HubPageContent({ hub, page }: HubPageContentProps) {
  const pagedGallery = getPagedHubItems(hub, page);
  const featuredItems = getFeaturedItems(hub);
  const relatedHubs = getRelatedHubs(hub, 8);
  const childHubs = getChildHubs(hub, 8);
  const browsingSections = getSectionListItems(hub.sectionGroupings, 10);
  const showHeroPreviews = hasConfiguredColoringAssetSource() && featuredItems.length > 0;

  return (
    <main className="page-shell">
      <HubHero hub={hub} intro={friendlyHubIntro(hub.title)}>
        {showHeroPreviews ? (
          <div className="hero-preview-grid" aria-label={`${hub.title} featured previews`}>
            {featuredItems.slice(0, 4).map((item) => (
              <div className="preview-tile" key={item.assetId}>
                <AssetImage
                  item={item}
                  imageUrl={resolveColoringAssetUrl(item.assetSubpaths.thumbnail || item.assetSubpaths.pngPreview)}
                  priority
                />
              </div>
            ))}
          </div>
        ) : null}
      </HubHero>

      {childHubs.length > 0 ? (
        <section className="content-section">
          <div className="section-heading-row">
            <div>
              <h2 className="section-title">Browse within this collection</h2>
              <p>Use these focused collections when you already know the kind of page you want.</p>
            </div>
          </div>
          <div className="hub-link-grid hub-link-grid-compact">
            {childHubs.map((child) => (
              <HubCard key={child.hubId} hub={child} compact />
            ))}
          </div>
        </section>
      ) : null}

      {browsingSections.length > 0 ? (
        <section className="content-section section-band">
          <div className="section-inner split-section">
            <div>
              <h2 className="section-title">Ways to browse this collection</h2>
              <p className="section-copy">These common themes can help you find a page faster.</p>
            </div>
            <ul className="section-list">
              {browsingSections.map((item) => (
                <li key={item.term}>
                  <span>{item.label}</span>
                  <strong>{item.assetCount.toLocaleString()}</strong>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="content-section" id="gallery">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title">Printable gallery</h2>
            <p>
              Showing {pagedGallery.items.length.toLocaleString()} of {pagedGallery.totalItems.toLocaleString()} pages.
              Use the page controls to keep browsing quick.
            </p>
          </div>
        </div>
        <FilterChips sections={hub.sectionGroupings} />
        <GalleryGrid items={pagedGallery.items} />
        <Pagination
          basePath={hub.route}
          currentPage={pagedGallery.currentPage}
          totalPages={pagedGallery.totalPages}
          hasPreviousPage={pagedGallery.hasPreviousPage}
          hasNextPage={pagedGallery.hasNextPage}
        />
      </section>

      <RelatedHubs title="More coloring pages to try" hubs={relatedHubs} />
    </main>
  );
}

function friendlyHubIntro(title: string) {
  if (title === "Coloring Pages for Kids") {
    return "Simple printable pages for kids, with PNG and SVG downloads ready when you find one you like.";
  }

  if (title === "Detailed Coloring Pages for Adults") {
    return "More intricate designs for relaxed coloring, ready to print or download from the gallery.";
  }

  const collectionName = title.replace(/ Coloring Pages$/, "");
  return `${collectionName} coloring pages you can print or download. Browse the first set below, then use the page controls for more designs.`;
}

function getSectionListItems(sections: ColoringHub["sectionGroupings"], limit: number) {
  const seenTerms = new Set<string>();
  const items: Array<{ term: string; label: string; assetCount: number }> = [];

  for (const section of sections) {
    for (const item of section.items) {
      if (seenTerms.has(item.term)) continue;
      seenTerms.add(item.term);
      items.push(item);
      if (items.length >= limit) return items;
    }
  }

  return items;
}
