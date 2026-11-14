import type { Metadata } from "next";
import Link from "next/link";

import { PageAdSlot } from "@/components/ads/PageAdSlot";
import { HubCard } from "@/components/coloring/HubCard";
import { AssetImage } from "@/components/coloring/AssetImage";
import { RotatingFeaturedGrid } from "@/components/coloring/RotatingFeaturedGrid";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { PublicPageShell } from "@/components/site/PublicPageShell";
import {
  getAllPhase1Hubs,
  getFeaturedRotationCandidateItems,
  getGeneratedFeaturedItems,
  getPagedHubItems,
  getPreviewItems,
  getRootHub,
} from "@/lib/coloring/data";
import { buildColoringMetadata } from "@/lib/coloring/metadata";
import type { ColoringHub } from "@/lib/coloring/types";
import { getCollectionCount } from "@/lib/coloring/collectionCounts";
import { buildHomePageJsonLd } from "@/lib/seo/pageJsonLd";
import { resolveColoringItemAssetUrls } from "@/lib/coloring/assets";
import { getPrintablePath } from "@/lib/coloring/printablePath";

export function generateMetadata(): Metadata {
  return buildColoringMetadata("/");
}

const PRIMARY_COLLECTION_SLUGS = ["animals", "christmas", "for-kids", "detailed-for-adults", "dogs", "plushies"];
const DISCOVERY_COLLECTION_SLUGS = ["fantasy", "flowers", "dinosaurs", "vehicles", "sea-life", "easy"];

export default function HomePage() {
  const rootHub = getRootHub();
  const rootCount = getCollectionCount(rootHub);
  const featuredItems = getGeneratedFeaturedItems(rootHub).slice(0, 8);
  const featuredRotationCandidates = getFeaturedRotationCandidateItems(rootHub, 64);
  const hubs = getAllPhase1Hubs();
  const primaryHubs = selectHubs(hubs, PRIMARY_COLLECTION_SLUGS);
  const discoveryHubs = selectHubs(hubs, DISCOVERY_COLLECTION_SLUGS);
  const candidateIds = new Set(featuredRotationCandidates.map((item) => item.assetId));
  const heroItems = selectHubs(hubs, ["flowers", "dinosaurs", "mandalas"]).flatMap((hub) => {
    const item = [...getGeneratedFeaturedItems(hub), ...getPagedHubItems(hub, 1).items].find((entry) => !candidateIds.has(entry.assetId));
    return item ? [item] : [];
  });

  return (
    <PublicPageShell pageFamily="home" className="home-page">
      <JsonLdScript id="jsonld-home" data={buildHomePageJsonLd()} />

      <header className="home-hero" data-page-section="hero">
        <div className="home-hero-copy">
        <h1 className="page-title page-title-wide">I Love Coloring Page</h1>
        <p className="page-intro">
          Find a subject you love. Choose from {rootCount.toLocaleString()} coloring pages, take a closer look, and print or save your favorite.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/coloring-pages" prefetch={false}>Browse all coloring pages</Link>
          <Link className="button button-ghost" href="#primary-collections" prefetch={false}>Browse collections</Link>
        </div>
        <p className="utility-note">Printable PDFs · PNG and JPG page images · No account needed</p>
        </div>
        <div className="home-artwork" aria-label="Explore printable artwork">
          {heroItems.map((item) => {
            const urls = resolveColoringItemAssetUrls(item.assetSubpaths);
            return <Link href={getPrintablePath(item)} key={item.assetId} prefetch={false} aria-label={`View ${item.title} printable page`}><AssetImage item={item} imageUrl={urls.preview} fallbackImageUrl={urls.previewFallback} priority interactive /></Link>;
          })}
        </div>
      </header>

      <section className="content-section collection-section" id="primary-collections" aria-labelledby="primary-collections-title" data-page-section="primary-collections">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title" id="primary-collections-title">Start with a collection</h2>
            <p>Pick a subject or explore a different style.</p>
          </div>
        </div>
        <div className="hub-preview-grid">
          {primaryHubs.map((hub) => <HubCard key={hub.hubId} hub={hub} previewItem={getPreviewItems(hub)[0] || null} />)}
        </div>
      </section>

      <PageAdSlot pageFamily="home" placement="post-header-banner" />

      <section className="content-section section-band featured-band" aria-labelledby="fresh-pages" data-page-section="fresh-printables">
        <div className="section-inner">
          <div className="section-heading-row">
            <div>
              <h2 className="section-title" id="fresh-pages">Fresh printable pages</h2>
              <p>Open a page to inspect the artwork, or use Print for a quick preview.</p>
            </div>
          </div>
          <RotatingFeaturedGrid
            fallbackItems={featuredItems}
            candidateItems={featuredRotationCandidates}
            mode="homepage-random"
            hubSlug={rootHub.slug || "coloring-pages"}
            priorityCount={0}
          />
        </div>
      </section>

      <PageAdSlot pageFamily="home" placement="supporting-square" />

      <section className="content-section collection-section" aria-labelledby="more-collections-title" data-page-section="additional-discovery">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title" id="more-collections-title">More ways to browse</h2>
            <p>From flowers and sea life to fantasy and vehicles.</p>
          </div>
        </div>
        <div className="hub-link-grid">
          {discoveryHubs.map((hub) => <HubCard key={hub.hubId} hub={hub} />)}
        </div>
      </section>

      <section className="content-section browse-complete-library" aria-labelledby="browse-complete-title" data-page-section="related-browse">
        <div>
          <h2 className="section-title" id="browse-complete-title">Browse the complete library</h2>
          <p className="section-copy">Use the main gallery for search and filters, or open the grouped sitemap when you want a collection index.</p>
        </div>
        <div className="hero-actions">
          <Link className="button button-primary" href="/coloring-pages" prefetch={false}>Open the main gallery</Link>
          <Link className="button button-subtle" href="/sitemap" prefetch={false}>View the sitemap</Link>
        </div>
      </section>

      <PageAdSlot pageFamily="home" placement="related-banner" />
    </PublicPageShell>
  );
}

function selectHubs(hubs: ColoringHub[], slugs: string[]) {
  const bySlug = new Map(hubs.map((hub) => [hub.slug, hub]));
  return slugs.map((slug) => bySlug.get(slug)).filter((hub): hub is ColoringHub => Boolean(hub));
}
