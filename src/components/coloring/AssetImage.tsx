"use client";

import type { PublicColoringItem } from "@/lib/coloring/types";

type AssetImageProps = {
  item: PublicColoringItem;
  imageUrl: string | null;
  priority?: boolean;
};

export function AssetImage({ item, imageUrl, priority = false }: AssetImageProps) {
  if (!imageUrl) return <AssetPlaceholder title={item.title} />;

  return (
    <object
      aria-label={item.altText}
      className="asset-image"
      data={imageUrl}
      data-priority={priority ? "true" : "false"}
      role="img"
      type="image/png"
    >
      <AssetPlaceholder title={item.title} />
    </object>
  );
}

function AssetPlaceholder({ title }: { title: string }) {
  return (
    <div className="asset-placeholder" aria-label={`${title} preview unavailable`}>
      <span>Preview unavailable</span>
    </div>
  );
}
