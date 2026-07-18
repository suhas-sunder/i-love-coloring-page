import Link from "next/link";

import { resolveColoringItemAssetUrls } from "@/lib/coloring/assets";
import { getCollectionCount } from "@/lib/coloring/collectionCounts";
import type { ColoringHub, PublicColoringItem } from "@/lib/coloring/types";

import { AssetImage } from "./AssetImage";

type HubCardProps = {
  hub: ColoringHub;
  compact?: boolean;
  previewItem?: PublicColoringItem | null;
};

export function HubCard({ hub, compact = false, previewItem = null }: HubCardProps) {
  const collectionCount = getCollectionCount(hub);
  if (previewItem) {
    const urls = resolveColoringItemAssetUrls(previewItem.assetSubpaths);
    return (
      <Link className="hub-preview-card" href={hub.route} prefetch={false}>
        <span className="hub-preview-card-media">
          <AssetImage item={previewItem} imageUrl={urls.preview} fallbackImageUrl={urls.previewFallback} />
        </span>
        <span className="hub-preview-card-body">
          <span className="hub-link-title">{hub.title.replace(/ Coloring Pages$/, "")}</span>
          <strong className="hub-link-count">{collectionCount.toLocaleString()} pages</strong>
        </span>
      </Link>
    );
  }

  return (
    <Link className={compact ? "hub-link hub-link-compact" : "hub-link"} href={hub.route} prefetch={false}>
      <span className="hub-link-title">{hub.title.replace(/ Coloring Pages$/, "")}</span>
      <strong className="hub-link-count">{collectionCount.toLocaleString()} pages</strong>
    </Link>
  );
}
