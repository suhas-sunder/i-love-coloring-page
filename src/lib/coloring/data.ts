import hubFeaturedItemsJson from "@/generated/coloring/runtime-hub-featured-items.json";
import hubFilterTagsJson from "@/generated/coloring/runtime-hub-filter-tags.json";
import hubsJson from "@/generated/coloring/runtime-hubs.json";
import itemsJson from "@/generated/coloring/runtime-available-items.json";
import routesJson from "@/generated/coloring/runtime-routes.json";
import searchIndexJson from "@/generated/coloring/runtime-search-index.json";
import hubSeoContentJson from "@/generated/coloring/runtime-hub-seo-content.json";
import siteMapJson from "@/generated/coloring/runtime-site-map.json";
import seoPagesJson from "@/generated/coloring/runtime-seo-pages.json";
import socialMetadataJson from "@/generated/coloring/runtime-social-metadata.json";
import printablesJson from "@/generated/coloring/runtime-printables.json";
import { getSiteUrl as getConfiguredSiteUrl } from "@/lib/site/siteConfig";

import { getPrintablePath } from "./printablePath";
import { getCollectionCount, getCollectionPageCount } from "./collectionCounts";
import { getPrintableTitleModel } from "./printableTitles";
import { selectPromotedHubs } from "./taxonomyPromotion";
import type {
  ColoringHub,
  ColoringItem,
  ColoringRoute,
  GalleryFilterTag,
  GallerySearchEntry,
  HubGalleryUx,
  HubEditorialContent,
  PagedGallery,
  PublicColoringItem,
  RuntimePrintable,
  SeoPageContent,
  SeoPageMetadata,
  SiteMapEntry,
} from "./types";

type HubsManifest = {
  hubs: ColoringHub[];
  backlogHubs: Array<{ hubId: string; slug: string; title: string; assetCount: number }>;
  sectionOnlyTopics: Array<{ hubId: string; slug: string; title: string; assetCount: number }>;
};

type ItemsManifest = {
  items: ColoringItem[];
};

type RoutesManifest = {
  routes: ColoringRoute[];
};

type SiteMapManifest = {
  entries: SiteMapEntry[];
};

type HubFeaturedItemsManifest = {
  hubs: Array<{ hubId: string; assetIds: string[] }>;
};

type HubFilterTagsManifest = {
  hubs: HubGalleryUx[];
};

type SearchIndexManifest = {
  entries: GallerySearchEntry[];
};

type SeoPagesManifest = {
  pages: SeoPageMetadata[];
};

type HubSeoContentManifest = {
  hubs: Array<{
    hubId: string;
    slug: string;
    route: string;
    contentTier: ColoringHub["contentTier"];
    editorial: HubEditorialContent;
    shortIntro: string;
  }>;
};

type SocialMetadataManifest = {
  pages: Array<{
    path: string;
    title: string;
    description: string;
    openGraph: {
      title: string;
      description: string;
      urlPath: string;
      type: "website";
      images: string[];
    };
    twitter: {
      card: "summary";
      title: string;
      description: string;
    };
    pinterest: {
      description: string;
      richPinCandidate: "article" | "none";
    };
  }>;
};

type PrintablesManifest = {
  records: RuntimePrintable[];
};

const hubsManifest = hubsJson as HubsManifest;
const itemsManifest = itemsJson as ItemsManifest;
const routesManifest = routesJson as RoutesManifest;
const siteMapManifest = siteMapJson as SiteMapManifest;
const hubFeaturedItemsManifest = hubFeaturedItemsJson as HubFeaturedItemsManifest;
const hubFilterTagsManifest = hubFilterTagsJson as HubFilterTagsManifest;
const searchIndexManifest = searchIndexJson as SearchIndexManifest;
const seoPagesManifest = seoPagesJson as SeoPagesManifest;
const hubSeoContentManifest = hubSeoContentJson as HubSeoContentManifest;
const socialMetadataManifest = socialMetadataJson as SocialMetadataManifest;
const printablesManifest = printablesJson as PrintablesManifest;

const hubsById = new Map(hubsManifest.hubs.map((hub) => [hub.hubId, hub]));
const hubsBySlug = new Map(hubsManifest.hubs.map((hub) => [hub.slug, hub]));
const itemsById = new Map(itemsManifest.items.map((item) => [item.assetId, item]));
const featuredByHubId = new Map(hubFeaturedItemsManifest.hubs.map((entry) => [entry.hubId, entry.assetIds]));
const filterUxByHubId = new Map(hubFilterTagsManifest.hubs.map((entry) => [entry.hubId, entry]));
const searchEntryByAssetId = new Map(searchIndexManifest.entries.map((entry) => [entry.assetId, entry]));
const seoPageByPath = new Map(seoPagesManifest.pages.map((entry) => [entry.path, entry]));
const hubSeoContentByHubId = new Map(hubSeoContentManifest.hubs.map((entry) => [entry.hubId, entry]));
const socialMetadataByPath = new Map(socialMetadataManifest.pages.map((entry) => [entry.path, entry]));
const printableByAssetId = new Map(printablesManifest.records.map((entry) => [entry.assetId, entry]));

function toPublicItem(item: ColoringItem): PublicColoringItem {
  const printable = printableByAssetId.get(item.assetId);
  if (!printable) throw new Error(`Missing canonical printable record for ${item.assetId}`);
  const titleModel = getPrintableTitleModel(printable);

  return {
    assetId: item.assetId,
    title: titleModel.displayTitle,
    altText: titleModel.shortAccessibleTitle,
    downloadBaseName: titleModel.downloadBaseName,
    assetSubpaths: item.assetSubpaths,
    canonicalPath: printable.canonicalPath,
  };
}

export function getRootHub() {
  const rootHub = hubsManifest.hubs.find((hub) => hub.route === "/coloring-pages");
  if (!rootHub) throw new Error("Missing root coloring pages hub");
  return rootHub;
}

export function getAllPhase1Hubs() {
  return hubsManifest.hubs;
}

export function getNonRootPhase1Hubs() {
  return hubsManifest.hubs.filter((hub) => hub.route !== "/coloring-pages");
}

export function getHubBySlug(slug: string) {
  return hubsBySlug.get(slug) || null;
}

export function getHubById(hubId: string | null | undefined) {
  if (!hubId) return null;
  return hubsById.get(hubId) || null;
}

export function getItemsByIds(assetIds: string[], limit = assetIds.length) {
  return assetIds
    .slice(0, limit)
    .map((assetId) => itemsById.get(assetId))
    .filter((item): item is ColoringItem => Boolean(item));
}

export function getPublicItemsByIds(assetIds: string[], limit = assetIds.length) {
  return getItemsByIds(assetIds, limit).map(toPublicItem);
}

export function getPublicItemsForHub(hub: ColoringHub) {
  return getPublicItemsByIds(hub.assetIds);
}

export function getPagedHubItems(hub: ColoringHub, requestedPage: number): PagedGallery {
  const pageSize = hub.galleryPageSize;
  const totalItems = getCollectionCount(hub);
  const totalPages = getHubPageCount(hub);
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (currentPage - 1) * pageSize;
  const items = getPublicItemsByIds(hub.assetIds.slice(start, start + pageSize));

  return {
    items,
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    hasPreviousPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
  };
}

export function getHubPageCount(hub: ColoringHub) {
  return getCollectionPageCount(hub);
}

export function getHubPagePath(hub: ColoringHub, page: number) {
  return page <= 1 ? hub.route : `${hub.route}/page/${page}`;
}

export function getStaticHubPageParams() {
  return getNonRootPhase1Hubs().flatMap((hub) => {
    const totalPages = getHubPageCount(hub);
    const params: Array<{ hubSlug: string; page: string }> = [];
    for (let page = 2; page <= totalPages; page += 1) {
      params.push({ hubSlug: hub.slug, page: String(page) });
    }
    return params;
  });
}

export function getFeaturedItems(hub: ColoringHub) {
  return getPublicItemsByIds(hub.featuredAssetIds, 12);
}

export function getGeneratedFeaturedItems(hub: ColoringHub) {
  return getPublicItemsByIds(featuredByHubId.get(hub.hubId) || hub.featuredAssetIds, 12);
}

export function getFeaturedRotationCandidateItems(hub: ColoringHub, limit = 96) {
  const generatedFeaturedIds = featuredByHubId.get(hub.hubId) || [];
  const candidateIds = getDiverseRotationAssetIds(
    [...generatedFeaturedIds, ...hub.previewAssetIds, ...hub.assetIds],
    limit,
  );
  return getPublicItemsByIds(candidateIds, candidateIds.length);
}

export function getColoringItemHref(item: Pick<PublicColoringItem, "assetId" | "canonicalPath">) {
  return getPrintablePath(item);
}

export function getHubFilterTags(hub: ColoringHub): { tags: GalleryFilterTag[]; tabs: HubGalleryUx["tabs"] } {
  const ux = filterUxByHubId.get(hub.hubId);
  return {
    tags: ux?.tags || [],
    tabs: ux?.tabs || [],
  };
}

export function getHubSearchEntries(hub: ColoringHub) {
  return hub.assetIds
    .map((assetId) => searchEntryByAssetId.get(assetId))
    .filter((entry): entry is GallerySearchEntry => Boolean(entry));
}

export function getPreviewItems(hub: ColoringHub) {
  return getPublicItemsByIds(hub.previewAssetIds, hub.galleryPageSize);
}

export function getRelatedHubs(hub: ColoringHub, limit = 8) {
  const candidates = hub.relatedHubIds
    .map((hubId) => hubsById.get(hubId))
    .filter((related): related is ColoringHub => Boolean(related));
  return selectPromotedHubs(hub, candidates, limit);
}

export function getChildHubs(hub: ColoringHub, limit = 8) {
  const candidates = hub.childHubIds
    .map((hubId) => hubsById.get(hubId))
    .filter((child): child is ColoringHub => Boolean(child));
  return selectPromotedHubs(hub, candidates, limit);
}

export function getParentHub(hub: ColoringHub) {
  return getHubById(hub.parentHubId);
}

export function getIndexableRoutes() {
  return routesManifest.routes;
}

export function getSitemapEntries() {
  return siteMapManifest.entries;
}

export function getSeoPageMetadata(path: string) {
  return seoPageByPath.get(path) || null;
}

export function getSeoPageContent(path: string) {
  return seoPageByPath.get(path)?.content || null;
}

export function getHubSeoContent(hubId: string) {
  return hubSeoContentByHubId.get(hubId) || null;
}

export function getSocialMetadata(path: string) {
  return socialMetadataByPath.get(path) || null;
}

export function getBacklogHubCount() {
  return hubsManifest.backlogHubs.length;
}

export function getSectionOnlyTopicCount() {
  return hubsManifest.sectionOnlyTopics.length;
}

export function parsePageParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function parseStaticPageParam(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed > 1 ? parsed : null;
}

export function getSiteUrl() {
  return getConfiguredSiteUrl();
}

function getDiverseRotationAssetIds(assetIds: string[], limit: number) {
  const safeLimit = Math.max(0, limit);
  if (safeLimit === 0) return [];

  const seenIds = new Set<string>();
  const buckets = new Map<string, string[]>();

  for (const assetId of assetIds) {
    if (seenIds.has(assetId) || !itemsById.has(assetId)) continue;
    seenIds.add(assetId);

    const bucketKey = getRotationBucketKey(assetId);
    const bucket = buckets.get(bucketKey) || [];
    bucket.push(assetId);
    buckets.set(bucketKey, bucket);
  }

  const selected: string[] = [];
  const bucketKeys = Array.from(buckets.keys());
  let cursor = 0;

  while (selected.length < safeLimit && bucketKeys.length > 0) {
    const bucketKey = bucketKeys[cursor % bucketKeys.length];
    const bucket = buckets.get(bucketKey) || [];
    const nextId = bucket.shift();

    if (nextId) selected.push(nextId);
    if (bucket.length === 0) {
      buckets.delete(bucketKey);
      bucketKeys.splice(cursor % bucketKeys.length, 1);
      if (bucketKeys.length === 0) break;
      cursor %= bucketKeys.length;
    } else {
      cursor = (cursor + 1) % bucketKeys.length;
    }
  }

  return selected;
}

function getRotationBucketKey(assetId: string) {
  const categoryPrefix = assetId.split("__")[0];
  return categoryPrefix || "misc";
}
