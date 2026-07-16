import {
  ASSET_BASE_URL,
  IMAGE_SITEMAP_PATH,
  RUN_ID,
  SITE_URL,
  buildMarkdownTable,
  hasBannedUrlPattern,
  makeGeneratedAt,
  publicPageUrl,
  readJson,
  resolveWebpUrl,
  writeJson,
  writeText,
} from "./image-sitemap-utils.mjs";

const RUNTIME_PRINTABLES = "src/generated/coloring/runtime-printables.json";
const FROZEN_ROUTE_MANIFEST = "pipeline/manifests/runtime-printable-route-manifest.json";
const DEFERRED_ITEMS = "src/generated/coloring/runtime-deferred-items.json";
const DATA_MANIFEST = "pipeline/manifests/image-sitemap-data.json";
const DATA_REPORT = "pipeline/reports/image-sitemap-data-report.md";
const PRINTABLE_PATH_PATTERN = /^\/printables\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{10}$/;

async function main() {
  const runtimePrintables = await readJson(RUNTIME_PRINTABLES);
  const frozenRoutes = await readJson(FROZEN_ROUTE_MANIFEST);
  const deferred = await readJson(DEFERRED_ITEMS);
  const data = buildImageSitemapData({ runtimePrintables, frozenRoutes, deferred });

  await writeJson(DATA_MANIFEST, data);
  await writeText(DATA_REPORT, buildDataReport(data));

  if (data.summary.invalidEntryCount > 0) {
    throw new Error(`Image sitemap data contains ${data.summary.invalidEntryCount} invalid entries`);
  }
}

export function buildImageSitemapData({ runtimePrintables, frozenRoutes, deferred }) {
  const generatedAt = makeGeneratedAt([runtimePrintables, frozenRoutes, deferred]);
  const routeByAssetId = new Map(frozenRoutes.routes.map((entry) => [entry.assetId, entry]));
  const deferredIds = new Set(deferred.records.map((entry) => entry.assetId));

  const imageEntries = runtimePrintables.records
    .map((record) => {
      const frozenRoute = routeByAssetId.get(record.assetId);
      const pageUrl = publicPageUrl(record.canonicalPath);
      const imageUrl = resolveWebpUrl(record.webpPath);
      const imageTitle = normalizePublicTitle(record.displayTitle);
      const errors = validateEntry({ record, frozenRoute, deferredIds, pageUrl, imageUrl, imageTitle });
      return {
        assetId: record.assetId,
        canonicalPath: record.canonicalPath,
        pageUrl,
        imageUrl,
        imageTitle,
        sourceRuntimeAssetPath: record.webpPath,
        validationStatus: errors.length === 0 ? "valid" : "invalid",
        errors,
      };
    })
    .sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath) || left.assetId.localeCompare(right.assetId));

  const pageUrls = imageEntries.map((entry) => entry.pageUrl);
  const imageUrls = imageEntries.map((entry) => entry.imageUrl);
  const invalidEntries = imageEntries.filter((entry) => entry.errors.length > 0);

  return {
    generatedAt,
    runId: `${RUN_ID}-canonical-printable-data`,
    strategy: {
      name: "one-frozen-canonical-printable-page-to-one-public-webp",
      description:
        "Each runtime printable uses its frozen canonicalPath as the HTML page location and its centralized runtime WebP path as the sole image location.",
      ordering: "canonicalPath ascending, then assetId ascending",
      titleSource: "runtime-printables.records.displayTitle",
    },
    generator: {
      owner: "pipeline/scripts/build-image-sitemap-data.mjs + pipeline/scripts/build-image-sitemap-xml.mjs",
      inputs: [RUNTIME_PRINTABLES, FROZEN_ROUTE_MANIFEST, DEFERRED_ITEMS],
      outputs: [DATA_MANIFEST, DATA_REPORT, IMAGE_SITEMAP_PATH],
    },
    summary: {
      runtimePrintableCount: runtimePrintables.records.length,
      frozenRouteCount: frozenRoutes.routes.length,
      deferredRecordsExcluded: deferred.records.length,
      pageUrlCount: pageUrls.length,
      imageEntryCount: imageEntries.length,
      uniquePageUrlCount: new Set(pageUrls).size,
      uniqueImageUrlCount: new Set(imageUrls).size,
      invalidEntryCount: invalidEntries.length,
      canonicalPrintablePagesOnly: imageEntries.every((entry) => entry.pageUrl.startsWith(`${SITE_URL}/printables/`)),
      publicWebpOnly: imageEntries.every((entry) => entry.imageUrl.startsWith(`${ASSET_BASE_URL}/webp/`) && entry.imageUrl.endsWith(".webp")),
      svgUrlsExcluded: imageEntries.every((entry) => !/\/svg\/|\.svg(?:$|[?#])/i.test(entry.imageUrl)),
      pngThumbUrlsExcluded: imageEntries.every((entry) => !/\/png\/|\/thumbs\/|\.png(?:$|[?#])/i.test(entry.imageUrl)),
      localUrlsExcluded: imageEntries.every((entry) => !/localhost|127\.0\.0\.1/i.test(`${entry.pageUrl}\n${entry.imageUrl}`)),
      privateUrlsExcluded: imageEntries.every((entry) => !/cloudflarestorage|amazonaws/i.test(`${entry.pageUrl}\n${entry.imageUrl}`)),
      r2DevUrlsExcluded: imageEntries.every((entry) => !/r2\.dev/i.test(`${entry.pageUrl}\n${entry.imageUrl}`)),
    },
    imageEntries,
    invalidEntries,
  };
}

function validateEntry({ record, frozenRoute, deferredIds, pageUrl, imageUrl, imageTitle }) {
  const errors = [];
  if (!frozenRoute || frozenRoute.canonicalPath !== record.canonicalPath) errors.push("frozen-route-mismatch");
  if (!PRINTABLE_PATH_PATTERN.test(record.canonicalPath)) errors.push("malformed-canonical-path");
  if (record.publicAvailabilityStatus !== "available") errors.push("not-publicly-available");
  if (deferredIds.has(record.assetId)) errors.push("deferred-record");
  if (!pageUrl.startsWith(`${SITE_URL}/printables/`)) errors.push("invalid-page-url");
  if (!imageUrl.startsWith(`${ASSET_BASE_URL}/webp/`) || !imageUrl.endsWith(".webp")) errors.push("invalid-webp-url");
  if (hasBannedUrlPattern(pageUrl) || hasBannedUrlPattern(imageUrl)) errors.push("banned-url-pattern");
  if (!imageTitle || /\.(?:svg|png|webp|jpe?g)$/i.test(imageTitle)) errors.push("invalid-public-title");
  if (/coloring page\s+coloring page/i.test(imageTitle)) errors.push("duplicate-coloring-page-title");
  if (imageTitle.includes(record.assetId) || imageTitle.includes(record.stableId)) errors.push("internal-id-in-title");
  return errors;
}

function normalizePublicTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function buildDataReport(data) {
  return `# Canonical Printable Image Sitemap Data

${data.strategy.description}

${buildMarkdownTable(
  ["Metric", "Value"],
  [
    ["Runtime printables", data.summary.runtimePrintableCount],
    ["Frozen printable routes", data.summary.frozenRouteCount],
    ["Deferred records excluded", data.summary.deferredRecordsExcluded],
    ["Canonical page/image pairs", data.summary.imageEntryCount],
    ["Unique page URLs", data.summary.uniquePageUrlCount],
    ["Unique WebP URLs", data.summary.uniqueImageUrlCount],
    ["Invalid entries", data.summary.invalidEntryCount],
  ],
)}

## Generator contract

- Inputs: ${data.generator.inputs.map((entry) => `\`${entry}\``).join(", ")}
- Outputs: ${data.generator.outputs.map((entry) => `\`${entry}\``).join(", ")}
- Ordering: ${data.strategy.ordering}
- Image title source: ${data.strategy.titleSource}

SVG, PNG, thumbnails, deferred records, hub page locations, local URLs, private storage endpoints, and r2.dev URLs are excluded.
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
