"use client";

import { useState } from "react";

import type { GalleryFilterTag } from "@/lib/coloring/types";

type GalleryFiltersProps = {
  tags: GalleryFilterTag[];
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
};

const INITIAL_VISIBLE_TAGS = 9;

export function GalleryFilters({ tags, activeTag, onTagChange }: GalleryFiltersProps) {
  const [showAll, setShowAll] = useState(false);
  if (tags.length === 0) return null;

  const visibleTags = showAll ? tags : tags.slice(0, INITIAL_VISIBLE_TAGS);
  const hiddenCount = Math.max(0, tags.length - visibleTags.length);

  return (
    <div className="gallery-filter-panel" aria-label="Filter this collection">
      <div className="filter-chips" role="list" aria-label="Useful filters">
        <button
          className="filter-chip"
          type="button"
          aria-pressed={!activeTag}
          onClick={() => onTagChange(null)}
        >
          All
        </button>
        {visibleTags.map((tag) => (
          <button
            className="filter-chip"
            type="button"
            aria-pressed={activeTag === tag.id}
            key={tag.id}
            onClick={() => onTagChange(activeTag === tag.id ? null : tag.id)}
          >
            {tag.label}
            <span>{tag.assetCount.toLocaleString()}</span>
          </button>
        ))}
      </div>
      {hiddenCount > 0 ? (
        <button className="button button-ghost button-small filter-more" type="button" onClick={() => setShowAll(true)}>
          More filters
        </button>
      ) : null}
    </div>
  );
}
