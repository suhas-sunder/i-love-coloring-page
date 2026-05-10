import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssetImage } from "@/components/coloring/AssetImage";
import { FilterChips } from "@/components/coloring/FilterChips";
import { GalleryGrid } from "@/components/coloring/GalleryGrid";
import { HubCard } from "@/components/coloring/HubCard";
import { HubHero } from "@/components/coloring/HubHero";
import { Pagination } from "@/components/coloring/Pagination";
import { RelatedHubs } from "@/components/coloring/RelatedHubs";
import { hasConfiguredColoringAssetSource } from "@/lib/coloring/assets";
import {
  getChildHubs,
  getFeaturedItems,
  getHubBySlug,
  getNonRootPhase1Hubs,
  getPagedHubItems,
  getParentHub,
  getRelatedHubs,
  getSiteUrl,
  parsePageParam,
} from "@/lib/coloring/data";

type HubPageProps = {
  params: Promise<{ hubSlug: string }>;
  searchParams?: Promise<{ page?: string | string[] }>;
};

export function generateStaticParams() {
  return getNonRootPhase1Hubs().map((hub) => ({ hubSlug: hub.slug }));
}

export async function generateMetadata({ params }: HubPageProps): Promise<Metadata> {
  const { hubSlug } = await params;
  const hub = getHubBySlug(hubSlug);
  if (!hub) return {};

  return {
    title: hub.metaTitle,
    description: hub.metaDescription,
    alternates: {
      canonical: `${getSiteUrl()}${hub.route}`,
    },
    openGraph: {
      title: hub.metaTitle,
      description: hub.metaDescription,
      url: `${getSiteUrl()}${hub.route}`,
      type: "website",
    },
  };
}

export default async function HubPage({ params, searchParams }: HubPageProps) {
  const { hubSlug } = await params;
  const hub = getHubBySlug(hubSlug);
  if (!hub) notFound();

  const resolvedSearchParams = await searchParams;
  const page = parsePageParam(resolvedSearchParams?.page);
  const pagedGallery = getPagedHubItems(hub, page);
  const featuredItems = getFeaturedItems(hub);
  const relatedHubs = getRelatedHubs(hub, 8);
  const childHubs = getChildHubs(hub, 8);
  const parentHub = getParentHub(hub);
  const showHeroPreviews = hasConfiguredColoringAssetSource() && featuredItems.length > 0;

  return (
    <main className="page-shell">
      <HubHero hub={hub} intro={friendlyHubIntro(hub.title)}>
        {showHeroPreviews ? (
          <div className="hero-preview-grid" aria-label={`${hub.title} featured previews`}>
            {featuredItems.slice(0, 4).map((item) => (
              <div className="preview-tile" key={item.assetId}>
                <AssetImage item={item} priority />
              </div>
            ))}
          </div>
        ) : null}
      </HubHero>

      {parentHub || childHubs.length > 0 ? (
        <section className="content-section split-section">
          {parentHub ? (
            <div>
              <h2 className="section-title">More in this area</h2>
              <div className="hub-link-grid hub-link-grid-compact">
                <HubCard hub={parentHub} compact />
              </div>
            </div>
          ) : (
            <div />
          )}
          {childHubs.length > 0 ? (
            <div>
              <h2 className="section-title">Narrow the search</h2>
              <div className="hub-link-grid hub-link-grid-compact">
                {childHubs.map((child) => (
                  <HubCard key={child.hubId} hub={child} compact />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {hub.sectionGroupings.length > 0 ? (
        <section className="content-section section-band">
          <div className="section-inner split-section">
            <div>
              <h2 className="section-title">Ways to browse this collection</h2>
              <p className="section-copy">These common themes can help you find a page faster.</p>
            </div>
            <ul className="section-list">
              {hub.sectionGroupings.slice(0, 2).flatMap((group) =>
                group.items.slice(0, 6).map((item) => (
                  <li key={`${group.groupingId}-${item.term}`}>
                    <span>{item.label}</span>
                    <strong>{item.assetCount.toLocaleString()}</strong>
                  </li>
                )),
              )}
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

      <RelatedHubs title="You might also like" hubs={relatedHubs} />
    </main>
  );
}

function friendlyHubIntro(title: string) {
  const collectionName = title.replace(/ Coloring Pages$/, "");
  const readableName = collectionName.charAt(0).toLowerCase() + collectionName.slice(1);
  const subject = /coloring pages/i.test(readableName) ? readableName : `${readableName} coloring pages`;
  return `Find ${subject} to print or download, then use the gallery below to keep browsing.`;
}
