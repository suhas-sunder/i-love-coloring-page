"use client";

import { useMemo, useState } from "react";

import { resolveColoringAssetUrl } from "@/lib/coloring/assets";
import type { PublicColoringItem } from "@/lib/coloring/types";

type AssetImageProps = {
  item: PublicColoringItem;
  priority?: boolean;
};

export function AssetImage({ item, priority = false }: AssetImageProps) {
  const [failed, setFailed] = useState(false);
  const imageUrl = useMemo(
    () => resolveColoringAssetUrl(item.assetSubpaths.thumbnail || item.assetSubpaths.pngPreview),
    [item.assetSubpaths.pngPreview, item.assetSubpaths.thumbnail],
  );

  if (!imageUrl || failed) {
    return (
      <div className="asset-placeholder" aria-label={`${item.title} preview unavailable`}>
        <span>{item.title}</span>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={item.altText}
      className="asset-image"
      loading={priority ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  );
}
