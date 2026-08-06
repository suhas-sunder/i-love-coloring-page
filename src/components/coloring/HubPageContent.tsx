import Link from "next/link";

import { PageAdSlot } from "@/components/ads/PageAdSlot";
import { PublicPageShell } from "@/components/site/PublicPageShell";
import {
  getChildHubs,
  getFeaturedRotationCandidateItems,
  getGeneratedFeaturedItems,
  getHubFilterTags,
  getPagedHubItems,
  getRelatedHubs,
} from "@/lib/coloring/data";
import type { ColoringHub } from "@/lib/coloring/types";
import { getCollectionCount } from "@/lib/coloring/collectionCounts";
import { buildHubPageJsonLd } from "@/lib/seo/pageJsonLd";

import { JsonLdScript } from "../seo/JsonLdScript";
import { CollectionPageHeader } from "./CollectionPageHeader";
import { GallerySearch } from "./GallerySearch";
import { HubCard } from "./HubCard";
import { Pagination } from "./Pagination";
import { PaginatedGalleryGrid } from "./PaginatedGalleryGrid";
import { RelatedHubs } from "./RelatedHubs";
import { RotatingFeaturedGrid } from "./RotatingFeaturedGrid";

type HubPageContentProps = {
  hub: ColoringHub;
  page: number;
};

export function HubPageContent({ hub, page }: HubPageContentProps) {
  const isPageOne = page === 1;
  const collectionCount = getCollectionCount(hub);
  const pageFamily = isPageOne ? "hub" : "hub-pagination";
  const pagedGallery = getPagedHubItems(hub, page);
  const featuredItems = getGeneratedFeaturedItems(hub).slice(0, 8);
  const featuredRotationCandidates = getFeaturedRotationCandidateItems(hub, 64);
  const { tags } = getHubFilterTags(hub);
  const relatedHubs = getRelatedHubs(hub, 12)
    .filter((related) => related.route !== hub.route && related.route !== "/coloring-pages")
    .slice(0, 8);
  const childHubs = getChildHubs(hub, 8).filter((child) => child.route !== hub.route);
  const showFeatured = isPageOne && collectionCount >= 12 && featuredItems.length >= 4;
  const jsonLdItems = showFeatured ? featuredItems : pagedGallery.items;
  const intro = hub.editorial.introduction;

  return (
    <PublicPageShell pageFamily={pageFamily} className={isPageOne ? "hub-page hub-page-one" : "hub-page hub-pagination-page"}>
      <JsonLdScript
        id={`jsonld-hub-${hub.slug}-${page}`}
        data={buildHubPageJsonLd({ hub, page, visibleItems: jsonLdItems })}
      />

      <CollectionPageHeader
        hub={hub}
        page={page}
        intro={isPageOne ? intro : `Continue browsing ${hub.title.toLowerCase()} with a distinct set of printable pages from this collection.`}
      />

      {isPageOne ? (
        <>
          {showFeatured ? (
            <section className="content-section section-band featured-band" aria-labelledby="featured-pages" data-page-section="featured-printables">
              <div className="section-inner">
                <div className="section-heading-row">
                  <div>
                    <h2 className="section-title" id="featured-pages">Featured printables</h2>
                  </div>
                </div>
                <RotatingFeaturedGrid
                  fallbackItems={featuredItems}
                  candidateItems={featuredRotationCandidates}
                  mode="hub-three-day"
                  hubSlug={hub.slug}
                  priorityCount={2}
                />
              </div>
            </section>
          ) : null}

          <section className="content-section gallery-section" id="gallery" aria-labelledby="printable-gallery-title" data-page-section="gallery">
            <div className="section-heading-row gallery-heading-row">
              <div>
                <h2 className="section-title" id="printable-gallery-title">Printable gallery</h2>
              </div>
            </div>
            <GallerySearch
              hubTitle={hub.title}
              totalItems={pagedGallery.totalItems}
              pageItems={pagedGallery.items}
              searchDataPath={`/search-data/hubs/${hub.slug}.json`}
              filterTags={tags}
              priorityCount={showFeatured ? 0 : 4}
              pagination={{
                basePath: hub.route,
                currentPage: pagedGallery.currentPage,
                totalPages: pagedGallery.totalPages,
                hasPreviousPage: pagedGallery.hasPreviousPage,
                hasNextPage: pagedGallery.hasNextPage,
              }}
            />
          </section>

          <PageAdSlot pageFamily="hub" placement="post-header-banner" />

          {hub.editorial.scope || hub.editorial.distinction || hub.editorial.selectionGuidance ? (
            <section className="content-section hub-editorial-details" aria-labelledby="collection-scope-title" data-page-section="collection-scope">
              <h2 className="section-title" id="collection-scope-title">About this collection</h2>
              {hub.editorial.scope ? <p>{hub.editorial.scope}</p> : null}
              {hub.editorial.distinction ? <p>{hub.editorial.distinction}</p> : null}
              {hub.editorial.selectionGuidance ? <p>{hub.editorial.selectionGuidance}</p> : null}
            </section>
          ) : null}

          {childHubs.length > 0 ? (
            <section className="content-section collection-section" aria-labelledby="narrower-browse-title" data-page-section="narrower-browse">
              <div className="section-heading-row">
                <div>
                  <h2 className="section-title" id="narrower-browse-title">Narrower ways to browse</h2>
                </div>
              </div>
              <div className="hub-link-grid hub-link-grid-compact">
                {childHubs.map((child) => <HubCard key={child.hubId} hub={child} compact />)}
              </div>
            </section>
          ) : null}

          <div data-page-section="related-collections">
            <RelatedHubs
              title="Related Collections"
              hubs={relatedHubs}
              interstitial={<PageAdSlot pageFamily="hub" placement="supporting-square" />}
            />
          </div>
        </>
      ) : (
        <>
          <section className="content-section paginated-gallery-section" aria-labelledby="page-gallery-title" data-page-section="paginated-gallery">
            <div className="section-heading-row">
              <div>
                <h2 className="section-title" id="page-gallery-title">More {collectionName(hub)}</h2>
              </div>
            </div>
            <p className="results-note" aria-live="polite">
              Showing {(((pagedGallery.currentPage - 1) * pagedGallery.pageSize) + 1).toLocaleString()}-{Math.min(pagedGallery.currentPage * pagedGallery.pageSize, pagedGallery.totalItems).toLocaleString()} of {pagedGallery.totalItems.toLocaleString()} printables.
            </p>
            <PaginatedGalleryGrid items={pagedGallery.items} />
            <Pagination
              basePath={hub.route}
              currentPage={pagedGallery.currentPage}
              totalPages={pagedGallery.totalPages}
              hasPreviousPage={pagedGallery.hasPreviousPage}
              hasNextPage={pagedGallery.hasNextPage}
            />
          </section>

          <PageAdSlot pageFamily="hub-pagination" placement="post-header-banner" />

          <section className="content-section pagination-return" aria-labelledby="return-to-collection-title" data-page-section="return-to-collection">
            <div>
              <h2 className="section-title" id="return-to-collection-title">Return to the collection</h2>
              <p className="section-copy">Start again at page one or continue with a nearby public collection.</p>
            </div>
            <div className="pagination-return-links">
              <Link className="button button-primary" href={hub.route} prefetch={false}>View {hub.title}</Link>
              {relatedHubs.slice(0, 3).map((related) => (
                <Link className="button button-subtle" href={related.route} key={related.hubId} prefetch={false}>
                  {collectionName(related)}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      <PageAdSlot pageFamily={pageFamily} placement="related-banner" />
    </PublicPageShell>
  );
}

function collectionName(hub: ColoringHub) {
  return hub.title.replace(/ Coloring Pages$/, "");
}
