import Link from "next/link";

import { AdRail } from "@/components/ads/AdRail";
import { AdSlot } from "@/components/ads/AdSlot";
import { AssetImage } from "@/components/coloring/AssetImage";
import { GalleryGrid } from "@/components/coloring/GalleryGrid";
import { GallerySearch } from "@/components/coloring/GallerySearch";
import { HubCard } from "@/components/coloring/HubCard";
import { HubHero } from "@/components/coloring/HubHero";
import { Pagination } from "@/components/coloring/Pagination";
import { RelatedHubs } from "@/components/coloring/RelatedHubs";
import { hasConfiguredColoringAssetSource, resolveColoringAssetUrl } from "@/lib/coloring/assets";
import {
  getChildHubs,
  getColoringItemHref,
  getGeneratedFeaturedItems,
  getHubFilterTags,
  getHubSearchEntries,
  getPagedHubItems,
  getPublicItemsForHub,
  getRelatedHubs,
} from "@/lib/coloring/data";
import type { ColoringHub } from "@/lib/coloring/types";

type HubPageContentProps = {
  hub: ColoringHub;
  page: number;
};

export function HubPageContent({ hub, page }: HubPageContentProps) {
  const pagedGallery = getPagedHubItems(hub, page);
  const featuredItems = getGeneratedFeaturedItems(hub);
  const allHubItems = getPublicItemsForHub(hub);
  const searchEntries = getHubSearchEntries(hub);
  const { tags, tabs } = getHubFilterTags(hub);
  const relatedHubs = getRelatedHubs(hub, 8);
  const childHubs = getChildHubs(hub, 8);
  const browsingSections = getSectionListItems(hub.sectionGroupings, 10);
  const showHeroPreviews = hasConfiguredColoringAssetSource() && featuredItems.length > 0;

  return (
    <main className="page-shell">
      <AdRail />
      <HubHero hub={hub} intro={friendlyHubIntro(hub.title)} primaryCtaLabel="Browse gallery">
        {showHeroPreviews ? (
          <div className="hero-preview-grid hero-preview-grid-compact" aria-label={`${hub.title} featured previews`}>
            {featuredItems.slice(0, 6).map((item) => (
              <div className="preview-tile" key={item.assetId}>
                <Link className="preview-tile-link" href={getColoringItemHref(item, hub.route)} prefetch={false}>
                  <AssetImage
                    item={item}
                    imageUrl={resolveColoringAssetUrl(item.assetSubpaths.thumbnail || item.assetSubpaths.pngPreview)}
                    priority
                  />
                </Link>
              </div>
            ))}
          </div>
        ) : null}
      </HubHero>

      {featuredItems.length > 0 ? (
        <section className="content-section section-band featured-band" aria-labelledby="featured-pages">
          <div className="section-inner">
            <div className="section-heading-row">
              <div>
                <h2 className="section-title" id="featured-pages">Featured pages</h2>
                <p>Representative picks from this collection, selected from successful production assets.</p>
              </div>
            </div>
            <GalleryGrid
              items={featuredItems}
              getItemHref={(item) => getColoringItemHref(item, hub.route)}
              priorityCount={6}
            />
          </div>
        </section>
      ) : null}

      <section className="content-section gallery-section" id="gallery">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title">Printable gallery</h2>
            <p>
              Search this collection, use a useful filter, or keep browsing page {pagedGallery.currentPage.toLocaleString()}.
            </p>
          </div>
        </div>
        <GallerySearch
          hubTitle={hub.title}
          totalItems={pagedGallery.totalItems}
          pageItems={pagedGallery.items}
          allItems={allHubItems}
          featuredItems={featuredItems}
          searchEntries={searchEntries}
          filterTags={tags}
          itemHrefBasePath={hub.route}
          tabs={tabs}
        />
        <Pagination
          basePath={hub.route}
          currentPage={pagedGallery.currentPage}
          totalPages={pagedGallery.totalPages}
          hasPreviousPage={pagedGallery.hasPreviousPage}
          hasNextPage={pagedGallery.hasNextPage}
        />
      </section>

      <AdSlot slotId="hub-after-gallery" />

      {childHubs.length > 0 || browsingSections.length > 0 ? (
        <section className="content-section supporting-browse" aria-labelledby="supporting-browse-title">
          <div className="section-heading-row">
            <div>
              <h2 className="section-title" id="supporting-browse-title">More ways to browse</h2>
              <p>Use these links after the gallery when you want a narrower collection or a familiar theme.</p>
            </div>
          </div>
          <div className="supporting-browse-grid">
            {childHubs.length > 0 ? (
              <div>
                <h3 className="supporting-title">Related collections</h3>
                <div className="hub-link-grid hub-link-grid-compact">
                  {childHubs.map((child) => (
                    <HubCard key={child.hubId} hub={child} compact />
                  ))}
                </div>
              </div>
            ) : null}
            {browsingSections.length > 0 ? (
              <div className="section-list-group">
                <h3 className="supporting-title">Common themes</h3>
                <ul className="section-list">
                  {browsingSections.map((item) => (
                    <li key={item.term}>
                      <span>{item.label}</span>
                      <strong>{item.assetCount.toLocaleString()}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <AdSlot slotId="hub-lower-content" />

      <section className="content-section section-band">
        <div className="section-inner split-section">
          <div>
            <h2 className="section-title">Print what fits the moment</h2>
            <p className="section-copy">
              Keep browsing by page when you want to explore, or use search and filters when you already have a subject, style, or season in mind.
            </p>
          </div>
          <ul className="section-list">
            <li>
              <span>Downloads</span>
              <strong>Downloadable files</strong>
            </li>
            <li>
              <span>Printing</span>
              <strong>Available from each image card</strong>
            </li>
            <li>
              <span>Routes</span>
              <strong>No per-image pages</strong>
            </li>
          </ul>
        </div>
      </section>

      <RelatedHubs title="Related collections" hubs={relatedHubs} />
    </main>
  );
}

function friendlyHubIntro(title: string) {
  if (title === "Coloring Pages for Kids") {
    return "Simple printable pages for kids, with downloads and print controls ready when you find one you like.";
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
