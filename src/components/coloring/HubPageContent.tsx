import { AdRail } from "@/components/ads/AdRail";
import { AdSlot } from "@/components/ads/AdSlot";
import { GallerySearch } from "@/components/coloring/GallerySearch";
import { HubCard } from "@/components/coloring/HubCard";
import { HubHero, type HeroRelatedLink } from "@/components/coloring/HubHero";
import { Pagination } from "@/components/coloring/Pagination";
import { RelatedHubs } from "@/components/coloring/RelatedHubs";
import { RotatingFeaturedGrid } from "@/components/coloring/RotatingFeaturedGrid";
import { SeoContentSection } from "@/components/coloring/SeoContentSection";
import {
  getChildHubs,
  getFeaturedRotationCandidateItems,
  getGeneratedFeaturedItems,
  getHubFilterTags,
  getHubSearchEntries,
  getHubSeoContent,
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
  const featuredRotationCandidates = getFeaturedRotationCandidateItems(hub, 96);
  const allHubItems = getPublicItemsForHub(hub);
  const searchEntries = getHubSearchEntries(hub);
  const { tags, tabs } = getHubFilterTags(hub);
  const relatedHubs = getRelatedHubs(hub, 8);
  const childHubs = getChildHubs(hub, 8);
  const seoContent = getHubSeoContent(hub.hubId);
  const browsingSections = getSectionListItems(hub.sectionGroupings, 10);
  const heroRelatedLinks = getHeroRelatedLinks([...childHubs, ...relatedHubs], 6);

  return (
    <main className="page-shell">
      <AdSlot slotId="hub-header-banner" />
      <AdRail side="left" slotId="rail-left-desktop" />
      <AdRail side="right" slotId="rail-right-desktop" />
      <HubHero
        hub={hub}
        intro={friendlyHubIntro(hub.title)}
        primaryCtaLabel="Browse gallery"
        relatedTitle="Related collections"
        relatedLinks={heroRelatedLinks}
      />

      {featuredItems.length > 0 ? (
        <section className="content-section section-band featured-band" aria-labelledby="featured-pages">
          <div className="section-inner">
            <div className="section-heading-row">
              <div>
                <h2 className="section-title" id="featured-pages">Featured pages</h2>
                <p>Representative picks from this collection, selected from successful production assets.</p>
              </div>
            </div>
            <RotatingFeaturedGrid
              fallbackItems={featuredItems}
              candidateItems={featuredRotationCandidates}
              mode="hub-three-day"
              hubSlug={hub.slug}
              itemHrefBasePath={hub.route}
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

      <SeoContentSection content={seoContent} id="about-this-collection" />

      <RelatedHubs title="Related collections" hubs={relatedHubs} id="related-collections" />
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

function getHeroRelatedLinks(hubs: ColoringHub[], limit: number): HeroRelatedLink[] {
  const seen = new Set<string>();
  const links: HeroRelatedLink[] = [];

  for (const hub of hubs) {
    if (seen.has(hub.route)) continue;
    seen.add(hub.route);
    links.push({
      label: hub.title.replace(/ Coloring Pages$/, ""),
      href: hub.route,
      assetCount: hub.assetCount,
    });
    if (links.length >= limit) return links;
  }

  return links;
}
