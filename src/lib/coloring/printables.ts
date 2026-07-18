import hubsJson from "@/generated/coloring/runtime-hubs.json";
import routeIndexJson from "@/generated/coloring/runtime-printable-route-index.json";
import routeManifestJson from "@/generated/coloring/runtime-printables.json";

import type { ColoringHub, RuntimePrintable } from "./types";
export { getPrintablePath } from "./printablePath";

type RuntimePrintableManifest = { records: RuntimePrintable[] };
type RuntimePrintableIndex = { index: Record<string, number> };
type RuntimeHubsManifest = { hubs: ColoringHub[] };

const printableManifest = routeManifestJson as RuntimePrintableManifest;
const printableIndex = routeIndexJson as RuntimePrintableIndex;
const hubsManifest = hubsJson as RuntimeHubsManifest;
const hubById = new Map(hubsManifest.hubs.map((hub) => [hub.hubId, hub]));
const TERMINAL_STABLE_ID_PATTERN = /^(.+)-([a-f0-9]{10})$/;

export function getAllRuntimePrintables() {
  return printableManifest.records;
}

export function getPrintableByStableId(stableId: string) {
  if (!/^[a-f0-9]{10}$/.test(stableId)) return null;
  const index = printableIndex.index[stableId];
  if (!Number.isInteger(index) || index < 0) return null;
  const printable = printableManifest.records[index];
  return printable?.stableId === stableId ? printable : null;
}

export function parsePrintableSlugAndId(slugAndId: string) {
  const match = TERMINAL_STABLE_ID_PATTERN.exec(slugAndId);
  if (!match) return null;
  return { slug: match[1], stableId: match[2] };
}

export function getPrintableByCanonicalParams(primaryCategory: string, slugAndId: string) {
  const parsed = parsePrintableSlugAndId(slugAndId);
  if (!parsed) return null;
  const printable = getPrintableByStableId(parsed.stableId);
  if (
    !printable ||
    printable.publicAvailabilityStatus !== "available" ||
    !printable.webpPath ||
    !printable.svgPath ||
    printable.primaryCategorySlug !== primaryCategory ||
    printable.slugAndId !== slugAndId ||
    printable.canonicalSlug !== parsed.slug ||
    printable.stableId !== parsed.stableId
  ) return null;
  return printable;
}

export function getRelatedPrintables(printable: RuntimePrintable, limit = printable.relatedAssetIds.length) {
  return printable.relatedAssetIds
    .slice(0, Math.max(0, limit))
    .map((assetId) => ({ assetId, item: getPrintableByStableId(assetId.slice(-10)) }))
    .filter((entry): entry is { assetId: string; item: RuntimePrintable } => Boolean(entry.item && entry.item.assetId === entry.assetId && entry.item.publicAvailabilityStatus === "available"))
    .map((entry) => entry.item);
}

export function getRelatedPrintableHubs(printable: RuntimePrintable, limit = printable.relatedHubIds.length) {
  return printable.relatedHubIds
    .slice(0, Math.max(0, limit))
    .map((hubId) => hubById.get(hubId))
    .filter((hub): hub is ColoringHub => Boolean(hub && hub.route && hub.indexable && hub.sitemap));
}

export function getPrintablePrimaryHub(printable: RuntimePrintable) {
  const hub = hubById.get(printable.primaryHubId);
  if (!hub || !hub.route || hub.route === "/coloring-pages") {
    throw new Error(`Invalid printable primary hub: ${printable.assetId}`);
  }
  return hub;
}
