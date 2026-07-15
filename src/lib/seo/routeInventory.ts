import "server-only";

import hubsJson from "@/generated/coloring/runtime-hubs.json";
import printablesJson from "@/generated/coloring/runtime-printables.json";
import routesJson from "@/generated/coloring/runtime-routes.json";
import { getPrintablePath } from "@/lib/coloring/printablePath";
import type { ColoringHub, RuntimePrintable } from "@/lib/coloring/types";
import { trustPages } from "@/lib/trust/trustPages";

type RouteFamily =
  | "homepage"
  | "main-gallery"
  | "public-hub"
  | "paginated-hub"
  | "canonical-printable"
  | "trust-page"
  | "html-sitemap"
  | "metadata-route";

export type CrawlableRoute = {
  path: string;
  family: RouteFamily;
  indexable: boolean;
  includeInXmlSitemap: boolean;
};

type HubsManifest = { hubs: ColoringHub[] };
type RoutesManifest = { routes: Array<{ path: string; indexable: boolean; sitemap: boolean }> };
type PrintablesManifest = { records: RuntimePrintable[] };

const hubsManifest = hubsJson as HubsManifest;
const routesManifest = routesJson as RoutesManifest;
const printablesManifest = printablesJson as PrintablesManifest;

export const REGULAR_SITEMAP_SAFE_URL_LIMIT = 45_000;
export const REGULAR_SITEMAP_SAFE_BYTE_LIMIT = 45 * 1024 * 1024;

export const nonIndexableRouteStates = [
  "search",
  "filter",
  "sort",
  "modal",
  "preview",
  "print",
  "download",
  "raw-webp",
  "raw-svg",
  "deferred-printable",
  "backlog-hub",
  "section-only-topic",
  "rejected-hub",
  "alternate-printable-category",
  "alternate-printable-slug",
  "malformed-printable-route",
  "internal-next-artifact",
] as const;

export function getRouteInventory(): CrawlableRoute[] {
  const routes: CrawlableRoute[] = [
    route("/", "homepage", true, true),
    ...getPublicHubRoutes(),
    ...getPaginatedHubRoutes(),
    ...printablesManifest.records.map((printable) =>
      route(getPrintablePath(printable), "canonical-printable", true, true),
    ),
    ...trustPages.map((page) => route(page.path, "trust-page", page.indexable, page.indexable)),
    route("/sitemap", "html-sitemap", true, true),
    route("/sitemap.xml", "metadata-route", false, false),
    route("/robots.txt", "metadata-route", false, false),
    route("/image-sitemap.xml", "metadata-route", false, false),
  ];

  assertUniquePaths(routes);
  return routes;
}

export function getRegularSitemapRoutes() {
  return getRouteInventory().filter((entry) => entry.indexable && entry.includeInXmlSitemap);
}

export function getIndexablePaginationRoutes() {
  return getRouteInventory().filter((entry) => entry.family === "paginated-hub" && entry.indexable);
}

function getPublicHubRoutes() {
  return routesManifest.routes
    .filter((entry) => entry.indexable && entry.sitemap)
    .map((entry) =>
      route(
        entry.path,
        entry.path === "/coloring-pages" ? "main-gallery" : "public-hub",
        true,
        true,
      ),
    );
}

function getPaginatedHubRoutes() {
  return hubsManifest.hubs.flatMap((hub) => {
    if (hub.route === "/coloring-pages" || !hub.indexable || !hub.sitemap) return [];
    const pageCount = Math.max(1, Math.ceil(hub.assetIds.length / hub.galleryPageSize));
    return Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      route(`${hub.route}/page/${index + 2}`, "paginated-hub", true, false),
    );
  });
}

function route(
  path: string,
  family: RouteFamily,
  indexable: boolean,
  includeInXmlSitemap: boolean,
): CrawlableRoute {
  return { path, family, indexable, includeInXmlSitemap };
}

function assertUniquePaths(routes: CrawlableRoute[]) {
  const seen = new Set<string>();
  for (const entry of routes) {
    if (seen.has(entry.path)) throw new Error(`Duplicate crawl route: ${entry.path}`);
    seen.add(entry.path);
  }
}
