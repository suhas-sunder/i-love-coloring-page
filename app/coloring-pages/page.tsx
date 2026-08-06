import type { Metadata } from "next";

import { PageAdSlot } from "@/components/ads/PageAdSlot";
import { CollectionPageHeader } from "@/components/coloring/CollectionPageHeader";
import { GallerySearch } from "@/components/coloring/GallerySearch";
import { HubCard } from "@/components/coloring/HubCard";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { PublicPageShell } from "@/components/site/PublicPageShell";
import {
  getAllPhase1Hubs,
  getHubFilterTags,
  getPreviewItems,
  getRootHub,
} from "@/lib/coloring/data";
import { buildColoringMetadata } from "@/lib/coloring/metadata";
import { getCollectionCount } from "@/lib/coloring/collectionCounts";
import { buildGalleryLandingJsonLd } from "@/lib/seo/pageJsonLd";

export function generateMetadata(): Metadata {
  return buildColoringMetadata("/coloring-pages");
}

const SUPPORTING_HUB_SLUGS = ["animals", "plushies", "buildings", "for-kids", "detailed-for-adults", "christmas", "fantasy", "flowers"];

export default function ColoringPagesLanding() {
  const rootHub = getRootHub();
  const rootCount = getCollectionCount(rootHub);
  const previewItems = getPreviewItems(rootHub).slice(0, 48);
  const { tags } = getHubFilterTags(rootHub);
  const hubsBySlug = new Map(getAllPhase1Hubs().map((hub) => [hub.slug, hub]));
  const supportingHubs = SUPPORTING_HUB_SLUGS.map((slug) => hubsBySlug.get(slug)).filter(Boolean);
  const intro = `${rootHub.editorial.introduction} ${rootCount.toLocaleString()} printable pages are currently available.`;

  return (
    <PublicPageShell pageFamily="gallery" className="gallery-landing-page">
      <JsonLdScript
        id="jsonld-coloring-pages"
        data={buildGalleryLandingJsonLd({ hub: rootHub, visibleItems: previewItems, description: intro })}
      />

      <CollectionPageHeader hub={rootHub} title="Printable Coloring Pages" intro={intro} />
      <PageAdSlot pageFamily="gallery" placement="post-header-banner" />

      <section className="content-section gallery-section" id="gallery" aria-labelledby="gallery-title" data-page-section="gallery">
        <div className="section-heading-row gallery-heading-row">
          <div>
            <h2 className="section-title" id="gallery-title">Find a coloring page</h2>
          </div>
        </div>
        <GallerySearch
          hubTitle={rootHub.title}
          totalItems={rootCount}
          pageItems={previewItems}
          searchDataPath="/search-data/all.json"
          filterTags={tags}
        />
      </section>

      <PageAdSlot pageFamily="gallery" placement="supporting-square" />

      <section className="content-section collection-section" aria-labelledby="browse-collections-title" data-page-section="supporting-browse">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title" id="browse-collections-title">Browse useful collections</h2>
            <p>These broad collections provide distinct starting points within the complete inventory.</p>
          </div>
        </div>
        <div className="hub-link-grid">
          {supportingHubs.map((hub) => <HubCard key={hub!.hubId} hub={hub!} />)}
        </div>
      </section>

      <PageAdSlot pageFamily="gallery" placement="related-banner" />
    </PublicPageShell>
  );
}
