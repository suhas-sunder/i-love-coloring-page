import hubsJson from "@/generated/coloring/hubs.json";
import itemsJson from "@/generated/coloring/items.json";
import routesJson from "@/generated/coloring/routes.json";
import siteMapJson from "@/generated/coloring/site-map.json";

import type { ColoringHub, ColoringItem, ColoringRoute, PagedGallery, PublicColoringItem, SiteMapEntry } from "./types";

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

const hubsManifest = hubsJson as HubsManifest;
const itemsManifest = itemsJson as ItemsManifest;
const routesManifest = routesJson as RoutesManifest;
const siteMapManifest = siteMapJson as SiteMapManifest;

const hubsById = new Map(hubsManifest.hubs.map((hub) => [hub.hubId, hub]));
const hubsBySlug = new Map(hubsManifest.hubs.map((hub) => [hub.slug, hub]));
const itemsById = new Map(itemsManifest.items.map((item) => [item.assetId, item]));

function toPublicItem(item: ColoringItem): PublicColoringItem {
  return {
    assetId: item.assetId,
    title: item.title,
    altText: item.altText,
    assetSubpaths: item.assetSubpaths,
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

export function getPagedHubItems(hub: ColoringHub, requestedPage: number): PagedGallery {
  const pageSize = hub.galleryPageSize;
  const totalItems = hub.assetIds.length;
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
  return Math.max(1, Math.ceil(hub.assetIds.length / hub.galleryPageSize));
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

export function getPreviewItems(hub: ColoringHub) {
  return getPublicItemsByIds(hub.previewAssetIds, hub.galleryPageSize);
}

export function getRelatedHubs(hub: ColoringHub, limit = 8) {
  return hub.relatedHubIds
    .map((hubId) => hubsById.get(hubId))
    .filter((related): related is ColoringHub => Boolean(related))
    .slice(0, limit);
}

export function getChildHubs(hub: ColoringHub, limit = 8) {
  return hub.childHubIds
    .map((hubId) => hubsById.get(hubId))
    .filter((child): child is ColoringHub => Boolean(child))
    .slice(0, limit);
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
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "http://localhost:3000";
}
