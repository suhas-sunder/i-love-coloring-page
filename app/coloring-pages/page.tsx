import type { Metadata } from "next";

import { AssetImage } from "@/components/coloring/AssetImage";
import { FilterChips } from "@/components/coloring/FilterChips";
import { GalleryGrid } from "@/components/coloring/GalleryGrid";
import { HubCard } from "@/components/coloring/HubCard";
import { HubHero } from "@/components/coloring/HubHero";
import { RelatedHubs } from "@/components/coloring/RelatedHubs";
import { hasConfiguredColoringAssetSource, resolveColoringAssetUrl } from "@/lib/coloring/assets";
import {
  getAllPhase1Hubs,
  getChildHubs,
  getFeaturedItems,
  getPreviewItems,
  getRootHub,
  getSiteUrl,
} from "@/lib/coloring/data";

export function generateMetadata(): Metadata {
  const hub = getRootHub();
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

export default function ColoringPagesLanding() {
  const rootHub = getRootHub();
  const featuredItems = getFeaturedItems(rootHub).slice(0, 4);
  const previewItems = getPreviewItems(rootHub).slice(0, 12);
  const hubs = getAllPhase1Hubs().filter((hub) => hub.route !== "/coloring-pages");
  const featuredHubs = hubs.filter((hub) => ["plushies", "animals", "mandalas", "anime-girls", "chibi", "fantasy", "christmas", "halloween"].includes(hub.slug));
  const popularThemes = hubs.filter((hub) => ["christmas", "halloween", "birthday", "holidays", "fantasy", "mythology", "medieval-fantasy", "st-patricks-day"].includes(hub.slug));
  const subjectHubs = hubs.filter((hub) => ["animals", "plushies", "dinosaurs", "prehistoric-animals", "plants", "indoor-plants", "sea-life", "vehicles"].includes(hub.slug));
  const styleHubs = hubs.filter((hub) => ["mandalas", "geometric", "cute", "chibi", "kawaii", "detailed-for-adults", "for-kids", "easy"].includes(hub.slug));
  const childHubs = getChildHubs(rootHub, 12);
  const showHeroPreviews = hasConfiguredColoringAssetSource() && featuredItems.length > 0;

  return (
    <main className="page-shell">
      <HubHero
        hub={rootHub}
        intro="Browse printable coloring pages by subject, season, style, and difficulty. Choose a collection, then download or print the pages you like."
      >
        {showHeroPreviews ? (
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
        ) : null}
      </HubHero>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title">Popular coloring page collections</h2>
            <p>Start with the broad collections people usually need first: animals, plushies, mandalas, fantasy themes, and holidays.</p>
          </div>
        </div>
        <div className="hub-link-grid">
          {featuredHubs.map((hub) => (
            <HubCard key={hub.hubId} hub={hub} />
          ))}
        </div>
      </section>

      <section className="content-section split-section">
        <div>
            <h2 className="section-title">Seasonal favorites</h2>
          <p className="section-copy">Find holiday pages and fantasy themes for classrooms, parties, or weekend printing.</p>
        </div>
        <div className="hub-link-grid hub-link-grid-compact">
          {popularThemes.map((hub) => (
            <HubCard key={hub.hubId} hub={hub} compact />
          ))}
        </div>
      </section>

      <section className="content-section section-band">
        <div className="section-inner">
          <div className="section-heading-row">
            <div>
              <h2 className="section-title">Browse by subject</h2>
              <p>Go straight to familiar subjects like animals, plants, vehicles, dinosaurs, sea life, and plushies.</p>
            </div>
          </div>
          <div className="hub-link-grid">
            {subjectHubs.map((hub) => (
              <HubCard key={hub.hubId} hub={hub} />
            ))}
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title">Style and difficulty</h2>
            <p>Choose simple pages, detailed designs, cute art, chibi characters, geometric patterns, or mandalas.</p>
          </div>
        </div>
        <div className="hub-link-grid">
          {styleHubs.map((hub) => (
            <HubCard key={hub.hubId} hub={hub} />
          ))}
        </div>
      </section>

      <section className="content-section" id="gallery">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title">Preview the gallery</h2>
            <p>A small sample from {rootHub.assetCount.toLocaleString()} printable pages. Open a collection when you are ready to browse more.</p>
          </div>
        </div>
        <FilterChips sections={rootHub.sectionGroupings} />
        <GalleryGrid items={previewItems} />
      </section>

      <RelatedHubs title="More ways to browse" hubs={childHubs} />
    </main>
  );
}
