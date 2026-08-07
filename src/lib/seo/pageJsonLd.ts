import ogImagesJson from "@/generated/coloring/og-images.json";
import { getHubPagePath } from "@/lib/coloring/data";
import { getPrintablePath } from "@/lib/coloring/printablePath";
import type { ColoringHub, PublicColoringItem } from "@/lib/coloring/types";
import { siteConfig } from "@/lib/site/siteConfig";

import {
  absoluteUrl,
  buildCollectionPageJsonLdSchemas,
  buildHomeJsonLdSchemas,
  buildTrustPageJsonLdSchema,
  type BreadcrumbEntry,
  type ItemListEntry,
  type JsonLdObject,
  type PageSchemaType,
} from "./jsonLd";

type OgImageMetadata = {
  ogImagePath: string;
  ogImageUrl: string;
  width: number;
  height: number;
  alt: string;
};

type OgImagesManifest = {
  defaults: {
    fallbackPath: string;
    fallbackUrl: string;
    width: number;
    height: number;
    alt: string;
  };
  metadataByPath: Record<string, OgImageMetadata>;
};

const ogImagesManifest = ogImagesJson as OgImagesManifest;
const VISIBLE_ITEMLIST_LIMIT = 8;

export function buildHomePageJsonLd(): JsonLdObject[] {
  const ogImage = getRouteOgImage("/");
  return buildHomeJsonLdSchemas({
    siteUrl: siteConfig.siteUrl,
    siteName: siteConfig.siteName,
    description: "Printable coloring pages organized by useful subjects, styles, holidays, and themes.",
    ogImageUrl: ogImage.ogImageUrl,
    ogImageWidth: ogImage.width,
    ogImageHeight: ogImage.height,
  });
}

export function buildGalleryLandingJsonLd(options: {
  hub: ColoringHub;
  visibleItems: PublicColoringItem[];
  description?: string;
}): JsonLdObject[] {
  return buildHubCollectionJsonLd({
    hub: options.hub,
    page: 1,
    visibleItems: options.visibleItems,
    description: options.description || options.hub.metaDescription,
  });
}

export function buildHubPageJsonLd(options: {
  hub: ColoringHub;
  page: number;
  visibleItems: PublicColoringItem[];
}): JsonLdObject[] {
  const pageSuffix = options.page > 1 ? `, Page ${options.page}` : "";
  return buildHubCollectionJsonLd({
    hub: options.hub,
    page: options.page,
    visibleItems: options.visibleItems,
    name: `${options.hub.h1}${pageSuffix}`,
    description:
      options.page > 1
        ? `${options.hub.metaDescription} Continue browsing page ${options.page} of this printable collection.`
        : options.hub.metaDescription,
  });
}

export function buildTrustPageJsonLd(options: {
  path: string;
  title: string;
  description: string;
  schemaType: PageSchemaType;
  contactEmail?: string;
}): JsonLdObject {
  const ogImage = getRouteOgImage(options.path);
  return buildTrustPageJsonLdSchema({
    siteUrl: siteConfig.siteUrl,
    siteName: siteConfig.siteName,
    path: options.path,
    name: options.title,
    description: options.description,
    schemaType: options.schemaType,
    ogImageUrl: ogImage.ogImageUrl,
    ogImageWidth: ogImage.width,
    ogImageHeight: ogImage.height,
    contactEmail: options.contactEmail,
  });
}

function buildHubCollectionJsonLd(options: {
  hub: ColoringHub;
  page: number;
  visibleItems: PublicColoringItem[];
  name?: string;
  description: string;
}) {
  const path = getHubPagePath(options.hub, options.page);
  const ogImage = getRouteOgImage(options.hub.route);
  return buildCollectionPageJsonLdSchemas({
    siteUrl: siteConfig.siteUrl,
    siteName: siteConfig.siteName,
    path,
    name: options.name || options.hub.h1,
    description: options.description,
    ogImageUrl: ogImage.ogImageUrl,
    ogImageWidth: ogImage.width,
    ogImageHeight: ogImage.height,
    breadcrumbs: getBreadcrumbEntries(options.hub, path, options.page),
    itemListItems: getItemListEntries(options.visibleItems),
  });
}

function getBreadcrumbEntries(hub: ColoringHub, currentPath: string, page: number): BreadcrumbEntry[] {
  const crumbs: BreadcrumbEntry[] = [{ name: "Home", path: "/" }];
  crumbs.push(...hub.breadcrumbPath.map((entry) => ({
    name: entry.label,
    path: entry.route || hub.route,
  })));

  if (page > 1 && !crumbs.some((entry) => entry.path === currentPath)) {
    crumbs.push({ name: `Page ${page}`, path: currentPath });
  }

  return crumbs;
}

function getItemListEntries(items: PublicColoringItem[]): ItemListEntry[] {
  return items.slice(0, VISIBLE_ITEMLIST_LIMIT).map((item) => ({
    name: item.title,
    url: absoluteUrl(siteConfig.siteUrl, getPrintablePath(item)),
  }));
}

function getRouteOgImage(path: string): OgImageMetadata {
  return ogImagesManifest.metadataByPath[path] || {
    ogImagePath: ogImagesManifest.defaults.fallbackPath,
    ogImageUrl: ogImagesManifest.defaults.fallbackUrl,
    width: ogImagesManifest.defaults.width,
    height: ogImagesManifest.defaults.height,
    alt: ogImagesManifest.defaults.alt,
  };
}
