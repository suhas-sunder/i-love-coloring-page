"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type {
  GalleryFilterTag,
  PublicColoringItem,
  StaticSearchItem,
  StaticSearchPayload,
} from "@/lib/coloring/types";
import { diversifyGalleryPresentation } from "@/lib/coloring/galleryPresentation";
import { normalizeSearchText, rankSearchItems } from "@/lib/search/ranking";
import { readGallerySession, sortGalleryEntries, writeGallerySession, type GallerySort } from "@/lib/coloring/galleryState";

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
  priorityCount?: number;
  pagination?: {
    basePath: string;
    currentPage: number;
    pageSize: number;
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
  priorityCount = 4,
  pagination,
}: GallerySearchProps) {
  const [query, setQuery] = useState("");
  const [activeFilterIds, setActiveFilterIds] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(INTERACTIVE_RESULT_BATCH_SIZE);
  const [sort, setSort] = useState<GallerySort>("recommended");
  const [expanded, setExpanded] = useState(false);
  const [restored, setRestored] = useState(false);
  const [searchItems, setSearchItems] = useState<StaticSearchItem[] | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const loadStateRef = useRef<LoadState>("idle");
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearchText(deferredQuery);
  const hasInteractiveState = Boolean(normalizedQuery || activeFilterIds.length > 0 || sort !== "recommended");
  const isStaticPageView = !hasInteractiveState;
  const needsCatalog = hasInteractiveState || expanded;
  const storageKey = `coloring-gallery:v1:${searchDataPath}:${pagination?.currentPage || 1}`;
  const searchPlaceholder = getGallerySearchPlaceholder(hubTitle);
  const presentedPageItems = useMemo(() => diversifyGalleryPresentation(pageItems), [pageItems]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      loadStateRef.current = "idle";
    };
  }, []);

  useEffect(() => {
    function restore(event?: Event) {
      if (event && (event as CustomEvent<string>).detail !== storageKey) return;
      try {
        const saved = readGallerySession(sessionStorage.getItem(storageKey), filterTags.map((tag) => tag.id), totalItems);
        if (saved) {
          setQuery(saved.query);
          setActiveFilterIds(saved.filters);
          setSort(saved.sort);
          setVisibleCount(saved.visibleCount);
          setExpanded(saved.expanded);
          if (saved.query || saved.filters.length || saved.sort !== "recommended" || saved.expanded) void ensureSearchData();
        }
      } catch { /* Browsing works when storage is unavailable. */ }
    }
    restore();
    setRestored(true);
    window.addEventListener("coloring-gallery-restore", restore);
    return () => window.removeEventListener("coloring-gallery-restore", restore);
    // Each explorer is keyed by collection and static page by its caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    writeGallerySession(storageKey, { query, filters: activeFilterIds, sort, visibleCount, expanded });
  }, [activeFilterIds, expanded, query, restored, sort, storageKey, visibleCount]);

  async function ensureSearchData({ retry = false } = {}) {
    if (searchItems || loadStateRef.current === "loaded" || loadStateRef.current === "loading") return;
    if (loadStateRef.current === "error" && !retry) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    loadStateRef.current = "loading";
    setLoadState("loading");
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 8_000);

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
      if (!mountedRef.current || (controller.signal.aborted && !timedOut)) return;
      loadStateRef.current = "error";
      setLoadState("error");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  const resultEntries = useMemo(() => {
    if (!searchItems) return [];
    const filtered = searchItems.filter((entry) => activeFilterIds.every((filterId) => entry.tags.includes(filterId)));
    const ranked = !normalizedQuery ? filtered : rankSearchItems(
      filtered.map((entry) => ({
        ...entry,
        stableKey: entry.id,
        primaryLabel: entry.primary,
        searchTerms: entry.tags,
        normalizedText: entry.text,
      })),
      normalizedQuery,
    ).map((result) => result.item);
    if (!hasInteractiveState && expanded) {
      const initialIds = new Set(presentedPageItems.map((item) => item.assetId));
      const byId = new Map(ranked.map((entry) => [entry.id, entry]));
      return [...presentedPageItems.flatMap((item) => byId.has(item.assetId) ? [byId.get(item.assetId)!] : []), ...ranked.filter((entry) => !initialIds.has(entry.id))];
    }
    return sortGalleryEntries(ranked, sort);
  }, [activeFilterIds, expanded, hasInteractiveState, normalizedQuery, presentedPageItems, searchItems, sort]);

  let resultItems: PublicColoringItem[];
  let resultCount: number;
  if (!needsCatalog || !searchItems) {
    resultItems = presentedPageItems;
    resultCount = totalItems;
  } else {
    resultItems = resultEntries.slice(0, visibleCount).map(toPublicItem);
    resultCount = resultEntries.length;
  }
  const canShowMore = resultItems.length < resultCount && (needsCatalog || !pagination);
  const activeLabels = activeFilterIds.map((id) => filterTags.find((tag) => tag.id === id)?.label).filter(Boolean) as string[];

  function clearAll() {
    setQuery("");
    setActiveFilterIds([]);
    setSort("recommended");
    setExpanded(false);
    setVisibleCount(INTERACTIVE_RESULT_BATCH_SIZE);
  }

  function changeFilters(ids: string[]) {
    setActiveFilterIds(ids);
    setExpanded(false);
    setVisibleCount(INTERACTIVE_RESULT_BATCH_SIZE);
    if (ids.length > 0) void ensureSearchData();
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
              placeholder={searchPlaceholder}
              maxLength={200}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setQuery(value);
                setExpanded(false);
                setVisibleCount(INTERACTIVE_RESULT_BATCH_SIZE);
                if (normalizeSearchText(value)) void ensureSearchData();
              }}
            />
          </label>
          <GalleryFilters
            tags={filterTags}
            activeFilterIds={activeFilterIds}
            onActiveFilterIdsChange={changeFilters}
          />
          <label className="gallery-sort"><span>Sort by</span><select value={sort} onChange={(event) => {
            setSort(event.currentTarget.value as GallerySort);
            setExpanded(false);
            setVisibleCount(INTERACTIVE_RESULT_BATCH_SIZE);
            void ensureSearchData();
          }}><option value="recommended">{normalizedQuery ? "Best match" : "Recommended"}</option><option value="title-asc">Title: A to Z</option><option value="title-desc">Title: Z to A</option></select></label>
        </div>

        <div className="gallery-control-summary">
          <p aria-live="polite">
            {isStaticPageView
              ? pagination
                ? `Showing ${((pagination.currentPage - 1) * pagination.pageSize + 1).toLocaleString()}-${Math.min(pagination.currentPage * pagination.pageSize, totalItems).toLocaleString()} of ${totalItems.toLocaleString()} coloring pages`
                : `Showing ${resultItems.length.toLocaleString()} of ${totalItems.toLocaleString()} coloring pages`
              : searchItems
                ? `${resultCount.toLocaleString()} matching coloring pages`
                : `Showing the current gallery while results are ${loadState === "error" ? "unavailable" : "loading"}`}
          </p>
          {hasInteractiveState || expanded ? <button className="button button-ghost button-small" type="button" onClick={clearAll}>Clear all</button> : null}
        </div>
        {activeLabels.length > 0 ? <div className="gallery-active-filters" aria-label="Active filters:">{activeFilterIds.map((id) => <button className="button button-subtle button-small" type="button" key={id} aria-label={`Remove ${filterTags.find((tag) => tag.id === id)?.label} filter`} onClick={() => changeFilters(activeFilterIds.filter((value) => value !== id))}>{filterTags.find((tag) => tag.id === id)?.label}<span aria-hidden="true">×</span></button>)}</div> : null}
      </div>

      {needsCatalog && loadState === "loading" ? <p className="results-note" role="status">Loading matching coloring pages…</p> : null}
      {needsCatalog && loadState === "error" ? (
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
        <GalleryGrid items={resultItems} priorityCount={priorityCount} />
      )}

      {canShowMore ? (
        <div className="gallery-show-more">
          <button className="button button-subtle" type="button" disabled={loadState === "loading"} onClick={() => {
            setVisibleCount((count) => count + INTERACTIVE_RESULT_BATCH_SIZE);
            if (!pagination) setExpanded(true);
            void ensureSearchData({ retry: loadState === "error" });
          }}>Show more</button>
          <span aria-live="polite">Showing {resultItems.length.toLocaleString()} of {resultCount.toLocaleString()}</span>
        </div>
      ) : null}

      {isStaticPageView && pagination ? <Pagination {...pagination} /> : null}
    </div>
  );
}

function getGallerySearchPlaceholder(hubTitle: string) {
  const collectionName = hubTitle.replace(/ Coloring Pages$/, "").trim();
  if (!collectionName || collectionName.toLowerCase() === "coloring pages") return "Search coloring pages";
  return `Search ${collectionName.toLowerCase()} coloring pages`;
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
