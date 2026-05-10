import type { Metadata } from "next";

import { AssetImage } from "@/components/coloring/AssetImage";
import { FilterChips } from "@/components/coloring/FilterChips";
import { GalleryGrid } from "@/components/coloring/GalleryGrid";
import { HubCard } from "@/components/coloring/HubCard";
import { HubHero } from "@/components/coloring/HubHero";
import { RelatedHubs } from "@/components/coloring/RelatedHubs";
import {
  getAllPhase1Hubs,
  getBacklogHubCount,
  getChildHubs,
  getFeaturedItems,
  getPreviewItems,
  getRootHub,
  getSectionOnlyTopicCount,
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
  const previewItems = getPreviewItems(rootHub);
  const hubs = getAllPhase1Hubs().filter((hub) => hub.route !== "/coloring-pages");
  const popularThemes = hubs.filter((hub) => ["christmas", "halloween", "birthday", "holidays", "fantasy", "mythology"].includes(hub.slug));
  const subjectHubs = hubs.filter((hub) => ["animals", "dinosaurs", "dogs", "cats", "flowers", "birds", "sea-life", "vehicles"].includes(hub.slug));
  const styleHubs = hubs.filter((hub) => ["mandalas", "geometric", "cute", "chibi", "kawaii", "detailed-for-adults", "for-kids", "easy"].includes(hub.slug));
  const childHubs = getChildHubs(rootHub, 12);

  return (
    <main className="page-shell">
      <HubHero hub={rootHub}>
        <div className="hero-preview-grid" aria-label="Featured coloring page previews">
          {featuredItems.map((item, index) => (
            <div className="image-card" key={item.assetId}>
              <div className="image-card-media">
                <AssetImage item={item} priority={index < 2} />
              </div>
            </div>
          ))}
        </div>
      </HubHero>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <h2 className="sky-heading">Start with the strongest hubs</h2>
            <p>These pages are built from the approved Round 4A taxonomy, not the original source folders.</p>
          </div>
        </div>
        <div className="hub-card-grid">
          {hubs.slice(0, 12).map((hub) => (
            <HubCard key={hub.hubId} hub={hub} />
          ))}
        </div>
      </section>

      <section className="content-section split-section">
        <div>
          <h2 className="sky-heading">Browse by theme</h2>
          <p className="section-copy">Seasonal and story-led hubs make it easier to find pages for holidays, classrooms, and weekend printing.</p>
        </div>
        <div className="hub-card-grid compact-grid">
          {popularThemes.map((hub) => (
            <HubCard key={hub.hubId} hub={hub} compact />
          ))}
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <h2 className="sky-heading">Browse by subject</h2>
            <p>Use subject hubs when you know what you want to print first.</p>
          </div>
        </div>
        <div className="hub-card-grid">
          {subjectHubs.map((hub) => (
            <HubCard key={hub.hubId} hub={hub} />
          ))}
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading-row">
          <div>
            <h2 className="sky-heading">Browse by style and difficulty</h2>
            <p>Choose simple, cute, chibi, detailed, or mandala-style pages without creating thin duplicate routes.</p>
          </div>
        </div>
        <div className="hub-card-grid">
          {styleHubs.map((hub) => (
            <HubCard key={hub.hubId} hub={hub} />
          ))}
        </div>
      </section>

      <section className="content-section" id="gallery">
        <div className="section-heading-row">
          <div>
            <h2 className="sky-heading">Preview the gallery</h2>
            <p>Showing a limited first set from {rootHub.assetCount.toLocaleString()} approved coloring pages. Large hubs use pagination instead of loading everything at once.</p>
          </div>
        </div>
        <FilterChips sections={rootHub.sectionGroupings} />
        <GalleryGrid items={previewItems} />
      </section>

      <RelatedHubs title="More ways to browse" hubs={childHubs} />

      <section className="content-section">
        <div className="empty-state">
          <h2 className="sky-heading">Publishing rules carried forward</h2>
          <p>
            Phase 2 has {getBacklogHubCount().toLocaleString()} backlog hubs and {getSectionOnlyTopicCount().toLocaleString()} section-only topics.
            They stay out of the sitemap until a later promotion pass.
          </p>
        </div>
      </section>
    </main>
  );
}
