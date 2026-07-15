"use client";

import { useEffect, useState } from "react";

import {
  getHomepageReloadSeed,
  getHubRotationSeed,
  getRotatingFeaturedItems,
} from "@/lib/coloring/featuredRotation";
import type { PublicColoringItem } from "@/lib/coloring/types";

import { GalleryGrid } from "./GalleryGrid";

type RotatingFeaturedGridProps = {
  fallbackItems: PublicColoringItem[];
  candidateItems: PublicColoringItem[];
  mode: "homepage-random" | "hub-three-day";
  hubSlug?: string;
  priorityCount?: number;
};

export function RotatingFeaturedGrid({
  fallbackItems,
  candidateItems,
  mode,
  hubSlug = "coloring-pages",
  priorityCount = 6,
}: RotatingFeaturedGridProps) {
  const [items, setItems] = useState(fallbackItems);

  useEffect(() => {
    const seed = mode === "homepage-random" ? getHomepageReloadSeed() : getHubRotationSeed(hubSlug);
    const nextItems = getRotatingFeaturedItems({
      candidates: candidateItems,
      fallbackItems,
      count: fallbackItems.length,
      seed,
      keyFn: (item) => item.assetId,
    });
    setItems(nextItems);
  }, [candidateItems, fallbackItems, hubSlug, mode]);

  return (
    <div
      className="rotating-featured-grid"
      data-featured-rotation-hub={hubSlug}
      data-featured-rotation-mode={mode}
    >
      <GalleryGrid items={items} priorityCount={priorityCount} />
    </div>
  );
}
