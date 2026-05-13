#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GENERATED_AT = new Date().toISOString();
const SITE_ORIGIN = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const DEFAULT_SAMPLE_SIZE = 160;
const CONCURRENCY = 8;
const OUTPUT_JSON = "pipeline/manifests/live-production-sampled-asset-check-results.json";
const OUTPUT_REPORT = "pipeline/reports/live-production-sampled-asset-check-report.md";

const REQUIRED_COVERAGE = [
  { id: "animals", hubs: ["animals"], categories: ["animals"] },
  { id: "anime-girls", hubs: ["anime-girls"], categories: ["anime-girls"] },
  { id: "geometric", hubs: ["geometric"], categories: ["mandala", "mandala-geometry-patterns"] },
  { id: "mandalas", hubs: ["mandalas"], categories: ["mandala", "mandala-geometry-patterns"] },
  { id: "christmas", hubs: ["christmas"], categories: ["christmas", "holiday"] },
  { id: "plushies", hubs: ["plushies"], categories: ["plushies", "anime-girls"] },
  { id: "st-patricks-day", hubs: ["st-patricks-day"], categories: ["st-patricks-day"] },
  { id: "playing-cards", hubs: ["playing-cards"], categories: ["animals-playing-cards"] },
  { id: "fantasy", hubs: ["fantasy"], categories: ["fantasy"] },
  { id: "plants", hubs: ["plants"], categories: ["indoor-plants", "gardening", "flowers"] },
];

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const assetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const items = await readJson("src/generated/coloring/runtime-available-items.json");
  const search = await readJson("src/generated/coloring/runtime-search-index.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const selected = selectSample(assetPaths.records, items.items, search.entries, hubs.hubs, args.sampleSize);
  const checks = buildChecks(selected);
  const results = [];
  await runPool(checks, CONCURRENCY, async (check) => {
    results.push(await runCheck(check));
  });
  results.sort((left, right) => `${left.assetId}:${left.kind}:${left.type}:${left.origin || ""}`.localeCompare(`${right.assetId}:${right.kind}:${right.type}:${right.origin || ""}`));
  const failed = results.filter((result) => !result.ok);
  const categories = new Set(selected.map((record) => record.category));
  const coverageStatus = buildCoverageStatus(selected, hubs.hubs);
  const payload = {
    generatedAt: GENERATED_AT,
    runId: "live-production-sampled-asset-check-results",
    publicBaseUrl: ASSET_BASE_URL,
    siteOrigin: SITE_ORIGIN,
    summary: {
      fullVerificationSkipped: true,
      sampledRecords: selected.length,
      urlChecks: results.filter((result) => result.type === "url").length,
      corsChecks: results.filter((result) => result.type === "svg-cors").length,
      failedChecks: failed.length,
      passed: failed.length === 0,
      webpChecksPassed: results.filter((result) => result.kind === "webp").every((result) => result.ok),
      svgChecksPassed: results.filter((result) => result.kind === "svg").every((result) => result.ok),
      svgCorsPassed: results.filter((result) => result.type === "svg-cors").every((result) => result.ok),
      pngSubstituteUsed: false,
      r2DevUrlCount: results.filter((result) => /r2\.dev/i.test(result.url)).length,
      localhostUrlCount: results.filter((result) => /localhost|127\.0\.0\.1/i.test(result.url)).length,
      duplicatePrefixCount: results.filter((result) => /coloring-pages\/coloring-pages/.test(result.url)).length,
      categoriesRepresented: categories.size,
      requiredCategoriesRepresented: coverageStatus.every((entry) => entry.represented),
      coverageStatus,
      animalsAlligatorIncluded: selected.some((record) => record.assetId === "animals__animals-alligator__4feec8505a"),
      catsPlayingCardsIncluded: selected.some((record) => record.assetId === "animals-playing-cards__cats-playing-cards__c22648db9b"),
      stPatricksDayIncluded: selected.some((record) => record.category === "st-patricks-day"),
    },
    selectedRecords: selected.map(({ assetId, category, webpPreviewSubpath, internalSvgSubpath }) => ({
      assetId,
      category,
      webpPreviewSubpath,
      internalSvgSubpath,
    })),
    results,
  };
  await writeJson(OUTPUT_JSON, payload);
  await writeText(OUTPUT_REPORT, renderReport(payload));
  console.log(JSON.stringify(payload.summary, null, 2));
  if (!payload.summary.passed || !payload.summary.requiredCategoriesRepresented || !payload.summary.animalsAlligatorIncluded) process.exitCode = 1;
}

function selectSample(records, items, searchEntries, hubs, sampleSize) {
  const byAssetId = new Map(records.map((record) => [record.assetId, record]));
  const searchById = new Map(searchEntries.map((entry) => [entry.assetId, entry]));
  const byHubSlug = new Map(hubs.map((hub) => [hub.slug || hub.normalizedSlug, hub]));
  const selected = new Map();
  function add(assetId) {
    const record = byAssetId.get(assetId);
    if (record) selected.set(assetId, record);
  }

  add("animals__animals-alligator__4feec8505a");
  add("animals-playing-cards__cats-playing-cards__c22648db9b");
  for (const coverage of REQUIRED_COVERAGE) {
    for (const hubSlug of coverage.hubs || []) {
      const hub = byHubSlug.get(hubSlug);
      for (const assetId of [...(hub?.featuredAssetIds || []), ...(hub?.assetIds || [])].slice(0, 8)) add(assetId);
    }
    for (const category of coverage.categories || []) {
      for (const record of records.filter((entry) => entry.category === category).slice(0, 6)) add(record.assetId);
    }
  }
  for (const hub of hubs) {
    add((hub.featuredAssetIds || [])[0]);
    add((hub.assetIds || [])[0]);
  }
  for (const item of items) {
    const entry = searchById.get(item.assetId);
    if (entry?.tags?.includes("detailed")) add(item.assetId);
    if (selected.size >= sampleSize) break;
  }
  for (const record of records) {
    if (selected.size >= sampleSize) break;
    add(record.assetId);
  }

  return [...selected.values()]
    .sort((left, right) => left.category.localeCompare(right.category) || left.assetId.localeCompare(right.assetId))
    .slice(0, sampleSize);
}

function buildCoverageStatus(selected, hubs) {
  const selectedIds = new Set(selected.map((record) => record.assetId));
  const selectedCategories = new Set(selected.map((record) => record.category));
  const byHubSlug = new Map(hubs.map((hub) => [hub.slug || hub.normalizedSlug, hub]));
  return REQUIRED_COVERAGE.map((coverage) => {
    const categoryMatch = (coverage.categories || []).some((category) => selectedCategories.has(category));
    const hubMatch = (coverage.hubs || []).some((hubSlug) => {
      const hub = byHubSlug.get(hubSlug);
      return Boolean(hub?.assetIds?.some((assetId) => selectedIds.has(assetId)));
    });
    return {
      id: coverage.id,
      represented: categoryMatch || hubMatch,
      categoryMatch,
      hubMatch,
    };
  });
}

function buildChecks(records) {
  const checks = [];
  for (const record of records) {
    assertRuntimeSubpath(record.webpPreviewSubpath, "webp");
    assertRuntimeSubpath(record.internalSvgSubpath, "svg");
    checks.push({
      type: "url",
      kind: "webp",
      assetId: record.assetId,
      category: record.category,
      url: `${ASSET_BASE_URL}/${record.webpPreviewSubpath}`,
      expectedContentType: "image/webp",
    });
    checks.push({
      type: "url",
      kind: "svg",
      assetId: record.assetId,
      category: record.category,
      url: `${ASSET_BASE_URL}/${record.internalSvgSubpath}`,
      expectedContentType: "image/svg+xml",
    });
    checks.push({
      type: "svg-cors",
      kind: "svg",
      assetId: record.assetId,
      category: record.category,
      url: `${ASSET_BASE_URL}/${record.internalSvgSubpath}`,
      expectedContentType: "image/svg+xml",
      origin: SITE_ORIGIN,
    });
  }
  return checks;
}

async function runCheck(check) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await runCheckOnce(check, attempt);
    if (result.ok || attempt === 2) return result;
    await delay(300 * attempt);
  }
}

async function runCheckOnce(check, attempt) {
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(check.url, {
      method: "GET",
      headers: check.origin ? { Origin: check.origin } : {},
      cache: "no-store",
    }, 15000);
    const body = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "";
    const accessControlAllowOrigin = response.headers.get("access-control-allow-origin") || "";
    const cacheControl = response.headers.get("cache-control") || "";
    const contentTypeOk = contentType.toLowerCase().includes(check.expectedContentType);
    const corsOk = check.type !== "svg-cors" || accessControlAllowOrigin === "*" || accessControlAllowOrigin === check.origin;
    return {
      type: check.type,
      kind: check.kind,
      assetId: check.assetId,
      category: check.category,
      url: check.url,
      origin: check.origin || null,
      status: response.status,
      ok: response.status === 200 && contentTypeOk && corsOk && body.byteLength > 0,
      contentType,
      cacheControl,
      accessControlAllowOrigin,
      byteLength: body.byteLength,
      attempt,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      type: check.type,
      kind: check.kind,
      assetId: check.assetId,
      category: check.category,
      url: check.url,
      origin: check.origin || null,
      status: 0,
      ok: false,
      error: error?.message || String(error),
      attempt,
      elapsedMs: Date.now() - startedAt,
    };
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, concurrency, worker) {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current]);
    }
  });
  await Promise.all(workers);
}

function assertRuntimeSubpath(subpath, kind) {
  if (!subpath?.startsWith(`${kind}/`)) throw new Error(`Invalid ${kind} runtime subpath: ${subpath}`);
  if (/\/(?:png|thumbs)\//i.test(subpath)) throw new Error(`PNG/thumb path is not allowed: ${subpath}`);
  if (subpath.includes("coloring-pages/coloring-pages")) throw new Error(`Duplicate prefix in runtime subpath: ${subpath}`);
}

function renderReport(payload) {
  return `# Live Production Sampled Asset Check

- Public base URL: ${payload.publicBaseUrl}
- Site origin: ${payload.siteOrigin}
- Full verification skipped: ${payload.summary.fullVerificationSkipped}
- Sampled records: ${payload.summary.sampledRecords}
- URL checks: ${payload.summary.urlChecks}
- SVG CORS checks: ${payload.summary.corsChecks}
- Failed checks: ${payload.summary.failedChecks}
- WebP checks passed: ${payload.summary.webpChecksPassed}
- SVG checks passed: ${payload.summary.svgChecksPassed}
- SVG CORS passed: ${payload.summary.svgCorsPassed}
- Required hub/category coverage represented: ${payload.summary.requiredCategoriesRepresented}
- Animals alligator included: ${payload.summary.animalsAlligatorIncluded}
- Cats playing cards included: ${payload.summary.catsPlayingCardsIncluded}
- PNG substitute used: ${payload.summary.pngSubstituteUsed}
- Duplicate prefix URLs: ${payload.summary.duplicatePrefixCount}
- Passed: ${payload.summary.passed}
`;
}

function parseArgs(rawArgs) {
  const parsed = { sampleSize: DEFAULT_SAMPLE_SIZE };
  for (let index = 0; index < rawArgs.length; index += 1) {
    if (rawArgs[index] === "--sample-size") parsed.sampleSize = Number(rawArgs[++index] || DEFAULT_SAMPLE_SIZE);
  }
  parsed.sampleSize = Number.isFinite(parsed.sampleSize) && parsed.sampleSize >= 150 ? Math.floor(parsed.sampleSize) : DEFAULT_SAMPLE_SIZE;
  return parsed;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, String(value).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"), "utf8");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
