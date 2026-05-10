import type { PublicColoringItem } from "@/lib/coloring/types";
import { resolveColoringItemAssetUrls } from "@/lib/coloring/assets";

import { ImageCard } from "./ImageCard";

type GalleryGridProps = {
  items: PublicColoringItem[];
  priorityCount?: number;
};

export function GalleryGrid({ items, priorityCount = 4 }: GalleryGridProps) {
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
      {items.map((item, index) => (
        <ImageCard
          key={item.assetId}
          item={item}
          priority={index < priorityCount}
          assetUrls={resolveColoringItemAssetUrls(item.assetSubpaths)}
        />
      ))}
    </div>
  );
}
