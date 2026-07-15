"use client";

import type { PublicColoringItem } from "@/lib/coloring/types";

import { GalleryGrid } from "./GalleryGrid";

export function PaginatedGalleryGrid({ items }: { items: PublicColoringItem[] }) {
  return <GalleryGrid items={items} />;
}
