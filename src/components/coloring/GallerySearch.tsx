"use client";

import { useDeferredValue, useMemo, useState } from "react";

import type { GalleryFilterTag, GallerySearchEntry, PublicColoringItem } from "@/lib/coloring/types";

import { GalleryFilters } from "./GalleryFilters";
import { GalleryGrid } from "./GalleryGrid";

export const MAX_INTERACTIVE_RESULTS = 48;

type GallerySearchProps = {
  hubTitle: string;
  totalItems: number;
  pageItems: PublicColoringItem[];
  allItems: PublicColoringItem[];
  featuredItems: PublicColoringItem[];
  searchEntries: GallerySearchEntry[];
  filterTags: GalleryFilterTag[];
  itemHrefBasePath?: string;
  tabs: Array<Pick<GalleryFilterTag, "id" | "label" | "assetCount">>;
};

type GalleryMode = "featured" | "all" | string;

export function GallerySearch({
  hubTitle,
  totalItems,
  pageItems,
  allItems,
  featuredItems,
  searchEntries,
  filterTags,
  itemHrefBasePath = "",
  tabs,
}: GallerySearchProps) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<GalleryMode>("all");
  const deferredQuery = useDeferredValue(query);
  const itemById = useMemo(() => new Map(allItems.map((item) => [item.assetId, item])), [allItems]);
  const normalizedQuery = normalizeSearchInput(deferredQuery);
  const visibleTabs = useMemo(
    () => [
      { id: "featured", label: "Featured", assetCount: featuredItems.length },
      { id: "all", label: "All", assetCount: totalItems },
      ...tabs.filter((tab) => tab.assetCount >= Math.min(12, Math.max(3, Math.floor(totalItems / 24)))),
    ],
    [featuredItems.length, tabs, totalItems],
  );

  const isDefaultAllView = activeMode === "all" && !activeTag && !normalizedQuery;
  const featuredIds = useMemo(() => new Set(featuredItems.map((item) => item.assetId)), [featuredItems]);

  const resultEntries = useMemo(() => {
    if (activeMode === "featured" && !activeTag && !normalizedQuery) {
      return featuredItems
        .map((item) => searchEntries.find((entry) => entry.assetId === item.assetId))
        .filter((entry): entry is GallerySearchEntry => Boolean(entry));
    }

    return searchEntries.filter((entry) => {
      if (activeMode === "featured" && !featuredIds.has(entry.assetId)) return false;
      if (activeMode !== "all" && activeMode !== "featured" && !entry.tags.includes(activeMode)) return false;
      if (activeTag && !entry.tags.includes(activeTag)) return false;
      if (normalizedQuery && !entry.searchText.includes(normalizedQuery)) return false;
      return true;
    });
  }, [activeMode, activeTag, featuredIds, featuredItems, normalizedQuery, searchEntries]);

  const resultItems = isDefaultAllView
    ? pageItems
    : resultEntries
        .slice(0, MAX_INTERACTIVE_RESULTS)
        .map((entry) => itemById.get(entry.assetId))
        .filter((item): item is PublicColoringItem => Boolean(item));
  const resultCount = isDefaultAllView ? totalItems : resultEntries.length;
  const capped = !isDefaultAllView && resultEntries.length > MAX_INTERACTIVE_RESULTS;

  return (
    <div className="gallery-explorer">
      <div className="gallery-controls">
        <label className="gallery-search">
          <span>Search this collection</span>
          <input
            type="search"
            value={query}
            aria-label="Search this collection"
            placeholder={`Search ${hubTitle.replace(/ Coloring Pages$/, "").toLowerCase()} pages`}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>

        <div className="gallery-tabs" role="tablist" aria-label="Gallery views">
          {visibleTabs.map((tab) => (
            <button
              className="gallery-tab"
              type="button"
              role="tab"
              aria-selected={activeMode === tab.id}
              key={tab.id}
              onClick={() => setActiveMode(tab.id)}
            >
              {tab.label}
              <span>{tab.assetCount.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      <GalleryFilters tags={filterTags} activeTag={activeTag} onTagChange={setActiveTag} />

      <p className="results-note" aria-live="polite">
        {isDefaultAllView
          ? `Showing this page of ${totalItems.toLocaleString()} ${hubTitle.toLowerCase()}.`
          : `Showing ${resultItems.length.toLocaleString()} of ${resultCount.toLocaleString()} matching pages.`}
        {capped ? " Refine the search to narrow the list." : ""}
      </p>

      <GalleryGrid
        items={resultItems}
        getItemHref={(item) => `${itemHrefBasePath}#asset-${item.assetId}`}
        priorityCount={activeMode === "featured" ? 6 : 4}
      />
    </div>
  );
}

function normalizeSearchInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
