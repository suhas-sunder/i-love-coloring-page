// The public asset base uses the production custom asset domain by default.
// NEXT_PUBLIC_COLORING_ASSET_BASE_URL remains an optional public CDN override.
type AssetSubpathsLike = {
  svg?: string | null;
  pngPreview?: string | null;
  webpPreview?: string | null;
  thumbnail?: string | null;
};

export type ResolvedColoringAssetUrls = {
  preview: string | null;
  previewFallback: string | null;
  webp: string | null;
  thumbnail: string | null;
  png: string | null;
  svg: string | null;
};

const DEFAULT_COLORING_ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const PRIVATE_STORAGE_HOST_PATTERNS = ["r2.cloudflarestorage.com", "amazonaws.com"];
const LEGACY_TEST_PREFIX = ["", "coloring", "test-v1"].join("/");
const ASSET_BASE_URL = resolveConfiguredColoringAssetBaseUrl(getPublicAssetBaseUrlOverride());
const ALLOWED_TOP_LEVEL_FOLDERS = new Set(["svg", "png", "thumbs", "webp"]);

export function resolveColoringAssetUrl(assetSubpath: string | null | undefined): string | null {
  const safeSubpath = normalizeAssetSubpath(assetSubpath);
  if (!safeSubpath) return null;

  if (ASSET_BASE_URL) {
    return `${ASSET_BASE_URL}/${encodeAssetSubpath(safeSubpath)}`;
  }

  return null;
}

export function resolveSvgAssetUrl(svgSubpath: string | null | undefined) {
  return resolveTypedAssetUrl("svg", svgSubpath);
}

export function resolvePngPreviewAssetUrl(pngPreviewSubpath: string | null | undefined) {
  return resolveTypedAssetUrl("png", pngPreviewSubpath);
}

export function resolveWebpPreviewAssetUrl(webpPreviewSubpath: string | null | undefined, pngPreviewSubpath?: string | null) {
  return resolveTypedAssetUrl("webp", webpPreviewSubpath) || resolveTypedAssetUrl("webp", deriveWebpPreviewSubpath(pngPreviewSubpath));
}

export function resolveThumbnailAssetUrl(thumbnailSubpath: string | null | undefined) {
  return resolveTypedAssetUrl("thumbs", thumbnailSubpath);
}

export function resolveColoringItemAssetUrls(assetSubpaths: AssetSubpathsLike): ResolvedColoringAssetUrls {
  const thumbnail = resolveThumbnailAssetUrl(assetSubpaths.thumbnail);
  const png = resolvePngPreviewAssetUrl(assetSubpaths.pngPreview);
  const webp = resolveWebpPreviewAssetUrl(assetSubpaths.webpPreview, assetSubpaths.pngPreview);
  const svg = resolveSvgAssetUrl(assetSubpaths.svg);

  return {
    preview: webp || png || thumbnail,
    previewFallback: png || thumbnail,
    webp,
    thumbnail,
    png,
    svg,
  };
}

export function deriveWebpPreviewSubpath(pngPreviewSubpath: string | null | undefined): string | null {
  const safeSubpath = normalizeAssetSubpath(pngPreviewSubpath);
  if (!safeSubpath || !safeSubpath.startsWith("png/") || !safeSubpath.toLowerCase().endsWith(".png")) return null;
  return `webp/${safeSubpath.slice("png/".length).replace(/\.png$/i, ".webp")}`;
}

export function hasConfiguredColoringAssetSource() {
  return Boolean(ASSET_BASE_URL);
}

export function normalizeAssetSubpath(assetSubpath: string | null | undefined): string | null {
  if (!assetSubpath) return null;
  const normalized = assetSubpath.trim();
  if (!normalized || normalized.startsWith("/") || normalized.includes("\\") || normalized.includes("\0")) return null;
  const segments = normalized.split("/");
  if (segments.length < 2) return null;
  if (!ALLOWED_TOP_LEVEL_FOLDERS.has(segments[0])) return null;
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) return null;
  return segments.join("/");
}

export function getColoringAssetContentType(assetSubpath: string | null | undefined): string | null {
  const safeSubpath = normalizeAssetSubpath(assetSubpath);
  if (!safeSubpath) return null;
  if (safeSubpath.endsWith(".svg")) return "image/svg+xml";
  if (safeSubpath.endsWith(".png")) return "image/png";
  if (safeSubpath.endsWith(".webp")) return "image/webp";
  return null;
}

export function normalizeColoringAssetBaseUrl(value: string | null | undefined): string {
  return value?.trim().replace(/\/+$/, "") || "";
}

export function resolveConfiguredColoringAssetBaseUrl(value: string | null | undefined): string {
  const normalized = normalizeColoringAssetBaseUrl(value);
  if (!normalized) return DEFAULT_COLORING_ASSET_BASE_URL;
  return isUsablePublicAssetBaseUrl(normalized) ? normalized : DEFAULT_COLORING_ASSET_BASE_URL;
}

function resolveTypedAssetUrl(expectedRoot: "svg" | "png" | "thumbs" | "webp", assetSubpath: string | null | undefined) {
  const safeSubpath = normalizeAssetSubpath(assetSubpath);
  if (!safeSubpath || !safeSubpath.startsWith(`${expectedRoot}/`)) return null;
  return resolveColoringAssetUrl(safeSubpath);
}

function encodeAssetSubpath(assetSubpath: string) {
  return assetSubpath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isUsablePublicAssetBaseUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();
    return (
      url.protocol === "https:" &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "::1" &&
      !hostname.endsWith(".r2.dev") &&
      !PRIVATE_STORAGE_HOST_PATTERNS.some((pattern) => hostname.includes(pattern)) &&
      !pathname.includes(LEGACY_TEST_PREFIX) &&
      !pathname.includes("/coloring-pages/coloring-pages")
    );
  } catch {
    return false;
  }
}

function getPublicAssetBaseUrlOverride() {
  const runtimeProcess = globalThis.process as { env?: Record<string, string | undefined> } | undefined;
  return runtimeProcess?.env?.NEXT_PUBLIC_COLORING_ASSET_BASE_URL;
}
