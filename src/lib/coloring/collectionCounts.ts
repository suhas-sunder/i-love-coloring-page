import hubCountsJson from "@/generated/coloring/runtime-hub-counts.json";

import type { ColoringHub } from "./types";

export type CollectionCountSource = Pick<ColoringHub, "hubId" | "assetIds" | "galleryPageSize">;

/**
 * Hub membership is the authoritative count source. The generated assetCount
 * field is retained as an audit snapshot, but public behavior must not trust it.
 */
export function getCollectionCount(hub: Pick<CollectionCountSource, "assetIds">) {
  return new Set(hub.assetIds).size;
}

export function getCollectionPageCount(hub: CollectionCountSource) {
  return Math.max(1, Math.ceil(getCollectionCount(hub) / hub.galleryPageSize));
}

export function getCollectionCountById(hubId: string) {
  const count = (hubCountsJson.counts as Record<string, number>)[hubId];
  if (!Number.isInteger(count) || count < 0) throw new Error(`Missing authoritative collection count for ${hubId}`);
  return count;
}

export function assertCollectionCountSnapshot(hub: Pick<ColoringHub, "hubId" | "assetCount" | "assetIds">) {
  const authoritativeCount = getCollectionCount(hub);
  if (hub.assetCount !== authoritativeCount) {
    throw new Error(
      `Collection count snapshot mismatch for ${hub.hubId}: stored=${hub.assetCount}, authoritative=${authoritativeCount}`,
    );
  }
  return authoritativeCount;
}
