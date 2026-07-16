import type { Metadata } from "next";

import { PageAdSlot } from "@/components/ads/PageAdSlot";
import { CollectionPageHeader } from "@/components/coloring/CollectionPageHeader";
import { GallerySearch } from "@/components/coloring/GallerySearch";
import { HubCard } from "@/components/coloring/HubCard";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { PublicPageShell } from "@/components/site/PublicPageShell";
import { SupportingInformation } from "@/components/site/SupportingInformation";
import {
  getAllPhase1Hubs,
  getHubFilterTags,
  getPreviewItems,
  getRootHub,
} from "@/lib/coloring/data";
import { buildColoringMetadata } from "@/lib/coloring/metadata";
import { buildGalleryLandingJsonLd } from "@/lib/seo/pageJsonLd";

export function generateMetadata(): Metadata {
  return buildColoringMetadata("/coloring-pages");
}

const SUPPORTING_HUB_SLUGS = ["animals", "plushies", "buildings", "for-kids", "detailed-for-adults", "christmas", "fantasy", "flowers"];

export default function ColoringPagesLanding() {
  const rootHub = getRootHub();
  const previewItems = getPreviewItems(rootHub).slice(0, 48);
  const { tags } = getHubFilterTags(rootHub);
  const hubsBySlug = new Map(getAllPhase1Hubs().map((hub) => [hub.slug, hub]));
  const supportingHubs = SUPPORTING_HUB_SLUGS.map((slug) => hubsBySlug.get(slug)).filter(Boolean);
  const intro = `Browse, search, print, and download from ${rootHub.assetCount.toLocaleString()} available printable coloring pages.`;

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
            <p>Search the library first, or use a subject, style, season, or difficulty filter.</p>
          </div>
        </div>
        <GallerySearch
          hubTitle={rootHub.title}
          totalItems={rootHub.assetCount}
          pageItems={previewItems}
          searchDataPath="/search-data/all.json"
          filterTags={tags}
        />
      </section>

      <section className="content-section collection-section" aria-labelledby="browse-collections-title" data-page-section="supporting-browse">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title" id="browse-collections-title">Browse useful collections</h2>
            <p>Move into a focused public gallery when a broad search is more than you need.</p>
          </div>
        </div>
        <div className="hub-link-grid">
          {supportingHubs.map((hub) => <HubCard key={hub!.hubId} hub={hub!} />)}
        </div>
      </section>

      <SupportingInformation
        pageFamily="gallery"
        title="How to use the gallery"
        intro="Search and filters change only the current browser view; every normal image and title still opens one canonical printable page."
        sections={[
          { title: "Choose a page", body: "Use the search field for a subject or select a filter for a broader group. Clear the controls to return to the original static gallery view." },
          { title: "Print or download", body: "Open a printable page for its larger preview. Print is separate from PNG, JPG, and WebP download preparation." },
        ]}
      />

      <PageAdSlot pageFamily="gallery" placement="related-banner" />
    </PublicPageShell>
  );
}
