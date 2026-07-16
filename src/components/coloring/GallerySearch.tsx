"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type {
  GalleryFilterTag,
  PublicColoringItem,
  StaticSearchItem,
  StaticSearchPayload,
} from "@/lib/coloring/types";
import { normalizeSearchText, rankSearchItems } from "@/lib/search/ranking";

import { GalleryFilters } from "./GalleryFilters";
import { GalleryGrid } from "./GalleryGrid";
import { Pagination } from "./Pagination";

export const INTERACTIVE_RESULT_BATCH_SIZE = 48;

type GallerySearchProps = {
  hubTitle: string;
  totalItems: number;
  pageItems: PublicColoringItem[];
  searchDataPath: string;
  filterTags: GalleryFilterTag[];
  pagination?: {
    basePath: string;
    currentPage: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
};

type LoadState = "idle" | "loading" | "loaded" | "error";

export function GallerySearch({
  hubTitle,
  totalItems,
  pageItems,
  searchDataPath,
  filterTags,
  pagination,
}: GallerySearchProps) {
  const [query, setQuery] = useState("");
  const [activeFilterIds, setActiveFilterIds] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(INTERACTIVE_RESULT_BATCH_SIZE);
  const [searchItems, setSearchItems] = useState<StaticSearchItem[] | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const loadStateRef = useRef<LoadState>("idle");
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearchText(deferredQuery);
  const filterKey = activeFilterIds.join("|");
  const hasInteractiveState = Boolean(normalizedQuery || activeFilterIds.length > 0);
  const isStaticPageView = !hasInteractiveState;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => setVisibleCount(INTERACTIVE_RESULT_BATCH_SIZE), [filterKey, normalizedQuery]);

  async function ensureSearchData({ retry = false } = {}) {
    if (searchItems || loadStateRef.current === "loading") return;
    if (loadStateRef.current === "error" && !retry) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    loadStateRef.current = "loading";
    setLoadState("loading");

    try {
      const response = await fetch(searchDataPath, { cache: retry ? "no-store" : "force-cache", signal: controller.signal });
      if (!response.ok) throw new Error(`Search data request failed with ${response.status}`);
      const payload = (await response.json()) as StaticSearchPayload;
      if (payload.version !== 1 || !Array.isArray(payload.items) || payload.count !== payload.items.length) {
        throw new Error("Search data response is invalid");
      }
      if (!mountedRef.current || controller.signal.aborted) return;
      setSearchItems(payload.items);
      loadStateRef.current = "loaded";
      setLoadState("loaded");
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) return;
      loadStateRef.current = "error";
      setLoadState("error");
    }
  }

  const resultEntries = useMemo(() => {
    if (!hasInteractiveState || !searchItems) return [];
    const filtered = searchItems.filter((entry) => activeFilterIds.every((filterId) => entry.tags.includes(filterId)));
    if (!normalizedQuery) return filtered;
    return rankSearchItems(
      filtered.map((entry) => ({
        ...entry,
        stableKey: entry.id,
        primaryLabel: entry.primary,
        searchTerms: entry.tags,
        normalizedText: entry.text,
      })),
      normalizedQuery,
    ).map((result) => result.item);
  }, [activeFilterIds, hasInteractiveState, normalizedQuery, searchItems]);

  let resultItems: PublicColoringItem[];
  let resultCount: number;
  if (isStaticPageView || !searchItems) {
    resultItems = pageItems;
    resultCount = totalItems;
  } else {
    resultItems = resultEntries.slice(0, visibleCount).map(toPublicItem);
    resultCount = resultEntries.length;
  }
  const canShowMore = Boolean(searchItems && hasInteractiveState && resultItems.length < resultCount);
  const activeLabels = activeFilterIds.map((id) => filterTags.find((tag) => tag.id === id)?.label).filter(Boolean) as string[];

  function clearAll() {
    setQuery("");
    setActiveFilterIds([]);
  }

  return (
    <div className="gallery-explorer">
      <div className="gallery-controls" aria-label="Search and filter controls">
        <div className="gallery-search-row">
          <label className="gallery-search">
            <span>Search this collection</span>
            <input
              type="search"
              value={query}
              aria-label="Search this collection"
              placeholder={`Search ${hubTitle.replace(/ Coloring Pages$/, "").toLowerCase()} pages`}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setQuery(value);
                if (normalizeSearchText(value)) void ensureSearchData();
              }}
            />
          </label>
          <GalleryFilters
            tags={filterTags}
            activeFilterIds={activeFilterIds}
            onActiveFilterIdsChange={(ids) => {
              setActiveFilterIds(ids);
              if (ids.length > 0) void ensureSearchData();
            }}
          />
        </div>

        <div className="gallery-control-summary">
          <p aria-live="polite">
            {isStaticPageView
              ? `${totalItems.toLocaleString()} coloring pages`
              : searchItems
                ? `${resultCount.toLocaleString()} matching coloring pages`
                : `Showing the current gallery while results are ${loadState === "error" ? "unavailable" : "loading"}`}
          </p>
          {activeLabels.length > 0 ? <span>Active filters: {activeLabels.join(", ")}</span> : null}
          {hasInteractiveState ? <button className="button button-ghost button-small" type="button" onClick={clearAll}>Clear all</button> : null}
        </div>
      </div>

      {hasInteractiveState && loadState === "loading" ? <p className="results-note" role="status">Loading matching coloring pages…</p> : null}
      {hasInteractiveState && loadState === "error" ? (
        <div className="gallery-search-error" role="alert">
          <p>Search could not be completed. The initial gallery is still available.</p>
          <button className="button button-subtle" type="button" onClick={() => void ensureSearchData({ retry: true })}>Try again</button>
        </div>
      ) : null}

      {!isStaticPageView && searchItems && resultCount === 0 ? (
        <div className="empty-state">
          <h2 className="section-title">No matching coloring pages</h2>
          <p>Try another search or clear your filters.</p>
          <button className="button button-subtle" type="button" onClick={clearAll}>Clear all</button>
        </div>
      ) : (
        <GalleryGrid items={resultItems} priorityCount={4} />
      )}

      {canShowMore ? (
        <div className="gallery-show-more">
          <button className="button button-subtle" type="button" onClick={() => setVisibleCount((count) => count + INTERACTIVE_RESULT_BATCH_SIZE)}>Show more</button>
          <span aria-live="polite">Showing {resultItems.length.toLocaleString()} of {resultCount.toLocaleString()}</span>
        </div>
      ) : null}

      {isStaticPageView && pagination ? <Pagination {...pagination} /> : null}
    </div>
  );
}

function toPublicItem(entry: StaticSearchItem): PublicColoringItem {
  return {
    assetId: entry.id,
    title: entry.title,
    altText: entry.alt,
    downloadBaseName: entry.download || entry.title,
    canonicalPath: entry.path,
    assetSubpaths: { svg: entry.svg, webpPreview: entry.webp, pngPreview: null, thumbnail: null },
  };
}
