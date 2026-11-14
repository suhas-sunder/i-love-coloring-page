import type { StaticSearchItem } from "./types";

export type GallerySort = "recommended" | "title-asc" | "title-desc";
export type GallerySession = { query: string; filters: string[]; sort: GallerySort; visibleCount: number; expanded: boolean };

export function writeGallerySession(key: string, state: GallerySession, notify = false) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ version: 1, ...state }));
    if (notify) window.dispatchEvent(new CustomEvent("coloring-gallery-restore", { detail: key }));
  }
  catch { /* Storage may be disabled or full; core browsing remains available. */ }
}

export function readGallerySession(raw: string | null, allowedFilters: string[], total: number): GallerySession | null {
  if (!raw || raw.length > 8_000) return null;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.query !== "string" || !Array.isArray(value.filters)) return null;
    return {
      query: value.query.slice(0, 200),
      filters: [...new Set<string>(value.filters.filter((id: unknown): id is string => typeof id === "string" && allowedFilters.includes(id)))],
      sort: value.sort === "title-asc" || value.sort === "title-desc" ? value.sort : "recommended",
      visibleCount: Number.isInteger(value.visibleCount) ? Math.max(48, Math.min(total, value.visibleCount)) : 48,
      expanded: value.expanded === true,
    };
  } catch { return null; }
}

export function sortGalleryEntries(items: StaticSearchItem[], sort: GallerySort) {
  if (sort === "recommended") return items;
  const direction = sort === "title-desc" ? -1 : 1;
  return [...items].sort((a, b) => direction * a.title.localeCompare(b.title, "en", { numeric: true, sensitivity: "base" }) || a.path.localeCompare(b.path));
}
