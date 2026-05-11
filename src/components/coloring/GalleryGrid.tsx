import type { PublicColoringItem } from "@/lib/coloring/types";
import { resolveColoringItemAssetUrls } from "@/lib/coloring/assets";

import { ImageCard } from "./ImageCard";

type GalleryGridProps = {
  items: PublicColoringItem[];
  getItemHref?: (item: PublicColoringItem) => string;
  priorityCount?: number;
};

export function GalleryGrid({ items, getItemHref, priorityCount = 4 }: GalleryGridProps) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <h2 className="section-title">No coloring pages in this view</h2>
        <p>Try another collection or return to the main coloring pages gallery.</p>
      </div>
    );
  }

  return (
    <div className="gallery-grid">
      {items.map((item, index) => {
        const resolvedUrls = resolveColoringItemAssetUrls(item.assetSubpaths);
        return (
          <ImageCard
            key={item.assetId}
            item={item}
            itemHref={getItemHref ? getItemHref(item) : `#asset-${item.assetId}`}
            priority={index < priorityCount}
            assetUrls={{
              preview: resolvedUrls.preview,
              fallbackPreview: resolvedUrls.previewFallback,
              thumbnail: resolvedUrls.thumbnail,
              png: resolvedUrls.png,
              internalSvg: resolvedUrls.svg,
            }}
          />
        );
      })}
    </div>
  );
}
