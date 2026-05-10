"use client";

import { useState } from "react";

import type { PublicColoringItem } from "@/lib/coloring/types";

type AssetImageProps = {
  item: PublicColoringItem;
  imageUrl: string | null;
  priority?: boolean;
};

export function AssetImage({ item, imageUrl, priority = false }: AssetImageProps) {
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) return <AssetPlaceholder title={item.title} />;

  return (
    <img
      alt={item.altText}
      className="asset-image"
      data-priority={priority ? "true" : "false"}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      onError={() => setFailed(true)}
      src={imageUrl}
    />
  );
}

function AssetPlaceholder({ title }: { title: string }) {
  return (
    <div className="asset-placeholder" aria-label={`${title} preview unavailable`}>
      <span>Preview unavailable</span>
    </div>
  );
}
