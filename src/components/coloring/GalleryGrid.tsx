import type { PublicColoringItem } from "@/lib/coloring/types";
import { resolveColoringItemAssetUrls } from "@/lib/coloring/assets";
import { getPrintablePath } from "@/lib/coloring/printablePath";

import { ImageCard } from "./ImageCard";

type GalleryGridProps = {
  items: PublicColoringItem[];
  priorityCount?: number;
  showPrintActions?: boolean;
};

export function GalleryGrid({ items, priorityCount = 4, showPrintActions = true }: GalleryGridProps) {
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
            itemHref={getPrintablePath(item)}
            showPrintAction={showPrintActions}
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
