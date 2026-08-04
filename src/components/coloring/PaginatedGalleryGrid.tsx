"use client";

import type { PublicColoringItem } from "@/lib/coloring/types";
import { diversifyGalleryPresentation } from "@/lib/coloring/galleryPresentation";

import { GalleryGrid } from "./GalleryGrid";

export function PaginatedGalleryGrid({ items }: { items: PublicColoringItem[] }) {
  return <GalleryGrid items={diversifyGalleryPresentation(items)} />;
}
