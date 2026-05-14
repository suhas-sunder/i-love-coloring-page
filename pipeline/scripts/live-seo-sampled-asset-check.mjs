import {
  ASSET_BASE_URL,
  ORIGIN,
  ensureOutputDirs,
  fetchWithRedirects,
  readJson,
  readManifestIfExists,
  writeJson,
  writeReport,
} from "./live-seo-utils.mjs";

const TARGET_HUB_SLUGS = [
  "animals",
  "anime-girls",
  "geometric",
  "mandalas",
  "christmas",
  "plushies",
  "t-rex",
  "dragons",
  "mushrooms",
  "sushi",
  "bakery",
  "wolves",
  "pumpkins",
  "st-patricks-day",
];
const MIN_SAMPLE_RECORDS = 200;

async function main() {
  await ensureOutputDirs();
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const freshness = await readManifestIfExists("pipeline/manifests/live-seo-deploy-freshness-check.json");
  const deferredIds = new Set((deferred.items || deferred.records || []).map((entry) => entry.assetId).filter(Boolean));
  const itemById = new Map((available.items || []).map((item) => [item.assetId, item]));
  const hubBySlug = new Map((hubs.hubs || []).map((hub) => [hub.slug || "coloring-pages", hub]));
  const samples = selectSamples(itemById, hubBySlug);
  const results = await mapWithConcurrency(samples, 10, checkItem);

  const summary = {
    blockedByProductionFreshness: freshness?.summary?.productionSiteReachable === false,
    sampledRecordCount: results.length,
    targetMinimum: MIN_SAMPLE_RECORDS,
    sampledAssetCheckPassed:
      results.length >= MIN_SAMPLE_RECORDS &&
      results.every((entry) =>
        entry.webpStatus === 200 &&
        entry.webpContentTypeOk &&
        entry.svgStatus === 200 &&
        entry.svgContentTypeOk &&
        entry.svgCorsPassed &&
        entry.noR2Dev &&
        entry.noLocalhost &&
        entry.noPngSubstitute &&
        entry.noDuplicatePrefix &&
        !deferredIds.has(entry.assetId),
      ),
    webpHttp200: results.every((entry) => entry.webpStatus === 200),
    webpContentTypeImageWebp: results.every((entry) => entry.webpContentTypeOk),
    svgHttp200: results.every((entry) => entry.svgStatus === 200),
    svgContentTypeAcceptable: results.every((entry) => entry.svgContentTypeOk),
    svgCorsPassed: results.every((entry) => entry.svgCorsPassed),
    noR2Dev: results.every((entry) => entry.noR2Dev),
    noLocalhost: results.every((entry) => entry.noLocalhost),
    noPngSubstitute: results.every((entry) => entry.noPngSubstitute),
    noDuplicatePrefix: results.every((entry) => entry.noDuplicatePrefix),
    noDeferredRecords: results.every((entry) => !deferredIds.has(entry.assetId)),
    includedAnimalsAlligator: results.some((entry) => /animals-alligator/i.test(entry.assetId) || /Animals Alligator/i.test(entry.title)),
    targetHubSlugs: TARGET_HUB_SLUGS,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    phase: "live-seo-verification",
    summary,
    samples: results,
  };

  await writeJson("pipeline/manifests/live-seo-sampled-asset-check-results.json", result);
  await writeReport("pipeline/reports/live-seo-sampled-asset-check-report.md", report(result));
  console.log(`Live sampled asset check complete: ${summary.sampledAssetCheckPassed ? "passed" : "blocked"}.`);
}

function selectSamples(itemById, hubBySlug) {
  const seen = new Set();
  const samples = [];

  function addItem(item, sourceHubSlug) {
    if (!item || seen.has(item.assetId)) return;
    const webp = resolveAssetUrl(item.assetSubpaths.webpPreview);
    const svg = resolveAssetUrl(item.assetSubpaths.svg);
    if (!webp || !svg) return;
    seen.add(item.assetId);
    samples.push({ item, sourceHubSlug, webp, svg });
  }

  for (const slug of TARGET_HUB_SLUGS) {
    const hub = hubBySlug.get(slug);
    if (!hub) continue;
    for (const assetId of hub.assetIds.slice(0, 18)) addItem(itemById.get(assetId), slug);
  }

  const animalsAlligator = [...itemById.values()].find((item) => /animals-alligator/i.test(item.assetId) || /Animals Alligator/i.test(item.title));
  addItem(animalsAlligator, "animals");

  for (const item of itemById.values()) {
    if (samples.length >= MIN_SAMPLE_RECORDS) break;
    addItem(item, "broad-fill");
  }

  return samples.slice(0, Math.max(MIN_SAMPLE_RECORDS, samples.length));
}

async function checkItem(sample) {
  const [webp, svg] = await Promise.all([
    fetchWithRedirects(sample.webp),
    fetchWithRedirects(sample.svg, { headers: { Origin: ORIGIN } }),
  ]);
  const urls = `${sample.webp}\n${sample.svg}`;
  return {
    assetId: sample.item.assetId,
    title: sample.item.title,
    sourceHubSlug: sample.sourceHubSlug,
    webpUrl: sample.webp,
    webpStatus: webp.status,
    webpContentType: webp.contentType,
    webpContentTypeOk: /image\/webp/i.test(webp.contentType),
    svgUrl: sample.svg,
    svgStatus: svg.status,
    svgContentType: svg.contentType,
    svgContentTypeOk: /image\/svg\+xml|application\/xml|text\/xml|text\/plain|application\/octet-stream/i.test(svg.contentType),
    svgAccessControlAllowOrigin: svg.accessControlAllowOrigin,
    svgCorsPassed: svg.accessControlAllowOrigin === "*" || svg.accessControlAllowOrigin === ORIGIN,
    noR2Dev: !/r2\.dev/i.test(urls),
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(urls),
    noPngSubstitute: !/\/png\/|\.png(?:[?#]|$)/i.test(sample.webp),
    noDuplicatePrefix: !/coloring-pages\/coloring-pages/i.test(urls),
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function resolveAssetUrl(subpath) {
  if (!subpath) return null;
  const normalized = subpath.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("\\") || normalized.includes("\0")) return null;
  return `${ASSET_BASE_URL}/${normalized.split("/").map(encodeURIComponent).join("/")}`;
}

function report(result) {
  const s = result.summary;
  return `# Live SEO Sampled Asset Check Report

- Sampled records: ${s.sampledRecordCount}
- Sampled asset check passed: ${s.sampledAssetCheckPassed}
- WebP HTTP 200: ${s.webpHttp200}
- WebP content type image/webp: ${s.webpContentTypeImageWebp}
- SVG HTTP 200: ${s.svgHttp200}
- SVG content type acceptable: ${s.svgContentTypeAcceptable}
- SVG CORS passed for ${ORIGIN}: ${s.svgCorsPassed}
- No r2.dev/localhost: ${s.noR2Dev && s.noLocalhost}
- No PNG substitute: ${s.noPngSubstitute}
- No duplicate prefix: ${s.noDuplicatePrefix}
- No deferred records: ${s.noDeferredRecords}
- Animals Alligator included: ${s.includedAnimalsAlligator}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
