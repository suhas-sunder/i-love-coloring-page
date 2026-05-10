const ASSET_BASE_URL = process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL?.replace(/\/+$/, "") || "";
const USE_LOCAL_PROXY = process.env.NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY === "1";
const ALLOWED_TOP_LEVEL_FOLDERS = new Set(["svg", "png", "thumbs"]);

export function resolveColoringAssetUrl(assetSubpath: string | null | undefined): string | null {
  const safeSubpath = normalizeAssetSubpath(assetSubpath);
  if (!safeSubpath) return null;

  if (ASSET_BASE_URL) {
    return `${ASSET_BASE_URL}/${safeSubpath}`;
  }

  if (USE_LOCAL_PROXY) {
    return `/api/coloring-assets/${safeSubpath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;
  }

  return null;
}

export function hasConfiguredColoringAssetSource() {
  return Boolean(ASSET_BASE_URL || USE_LOCAL_PROXY);
}

export function normalizeAssetSubpath(assetSubpath: string | null | undefined): string | null {
  if (!assetSubpath) return null;
  const normalized = assetSubpath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  if (!ALLOWED_TOP_LEVEL_FOLDERS.has(segments[0])) return null;
  if (segments.some((segment) => segment === "." || segment === ".." || segment.includes(":"))) return null;
  return segments.join("/");
}
