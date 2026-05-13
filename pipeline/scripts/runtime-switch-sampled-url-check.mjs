#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GENERATED_AT = new Date().toISOString();
const DEFAULT_PUBLIC_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const DEFAULT_SAMPLE_SIZE = 120;
const CONCURRENCY = 8;
const SVG_CORS_ORIGINS = ["https://www.ilovecoloringpage.com", "http://localhost:3005", "http://127.0.0.1:3005"];

const INPUTS = {
  assetPaths: "src/generated/coloring/runtime-asset-paths.json",
  availableItems: "src/generated/coloring/runtime-available-items.json",
  searchIndex: "src/generated/coloring/runtime-search-index.json",
  hubs: "src/generated/coloring/runtime-hubs.json",
  readiness: "pipeline/manifests/runtime-switch-readiness.json",
};

const OUTPUT_JSON = "pipeline/manifests/runtime-switch-sampled-url-check-results.json";
const OUTPUT_REPORT = "pipeline/reports/runtime-switch-sampled-url-check-report.md";

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const assetPaths = await readJson(INPUTS.assetPaths);
  const availableItems = await readJson(INPUTS.availableItems);
  const searchIndex = await readJson(INPUTS.searchIndex);
  const hubs = await readJson(INPUTS.hubs);
  const selectedRecords = selectSample(assetPaths.records, availableItems.items, searchIndex.entries, hubs.hubs, args.sampleSize);
  const checks = buildChecks(selectedRecords, args.publicBaseUrl);
  const results = [];
  await runPool(checks, CONCURRENCY, async (check) => {
    results.push(await runCheck(check));
  });
  results.sort((left, right) => `${left.assetId}:${left.type}:${left.origin || ""}`.localeCompare(`${right.assetId}:${right.type}:${right.origin || ""}`));
  const failed = results.filter((result) => !result.ok);
  const payload = {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-sampled-url-check-results",
    publicBaseUrl: args.publicBaseUrl,
    summary: {
      fullVerificationSkipped: true,
      sampledRecords: selectedRecords.length,
      urlChecks: results.filter((result) => result.type === "url").length,
      corsChecks: results.filter((result) => result.type === "svg-cors").length,
      failedChecks: failed.length,
      passed: failed.length === 0,
      svgChecksPassed: results.filter((result) => result.kind === "svg").every((result) => result.ok),
      webpChecksPassed: results.filter((result) => result.kind === "webp").every((result) => result.ok),
      pngSubstituteUsed: false,
      r2DevUrlCount: results.filter((result) => /r2\.dev/i.test(result.url)).length,
      duplicatePrefixCount: results.filter((result) => /coloring-pages\/coloring-pages/.test(result.url)).length,
      oldTestPrefixCount: results.filter((result) => /coloring\/test-v1/.test(result.url)).length,
      categoriesRepresented: new Set(selectedRecords.map((record) => record.category)).size,
      stPatricksDayIncluded: selectedRecords.some((record) => record.category === "st-patricks-day"),
      animalsAlligatorIncluded: selectedRecords.some((record) => record.assetId === "animals__animals-alligator__4feec8505a"),
      catsPlayingCardsIncluded: selectedRecords.some((record) => record.assetId === "animals-playing-cards__cats-playing-cards__c22648db9b"),
    },
    selectedRecords: selectedRecords.map((record) => ({
      assetId: record.assetId,
      category: record.category,
      webpPreviewSubpath: record.webpPreviewSubpath,
      internalSvgSubpath: record.internalSvgSubpath,
    })),
    results,
  };
  await writeJson(OUTPUT_JSON, payload);
  await writeText(OUTPUT_REPORT, renderReport(payload));
  await updateReadiness(payload);
  console.log(JSON.stringify(payload.summary, null, 2));
  if (!payload.summary.passed) process.exitCode = 1;
}

function selectSample(records, items, searchEntries, hubs, sampleSize) {
  const byAssetId = new Map(records.map((record) => [record.assetId, record]));
  const searchById = new Map(searchEntries.map((entry) => [entry.assetId, entry]));
  const selected = new Map();
  function add(assetId) {
    const record = byAssetId.get(assetId);
    if (record) selected.set(assetId, record);
  }

  add("animals__animals-alligator__4feec8505a");
  for (const record of records.filter((record) => record.category === "st-patricks-day").slice(0, 5)) add(record.assetId);
  for (const hub of hubs) {
    add((hub.featuredAssetIds || [])[0]);
    add((hub.assetIds || [])[0]);
  }
  for (const item of items) {
    const search = searchById.get(item.assetId);
    if (search?.tags?.includes("detailed")) add(item.assetId);
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

function buildChecks(records, publicBaseUrl) {
  const base = publicBaseUrl.replace(/\/+$/, "");
  const checks = [];
  for (const record of records) {
    assertRuntimeSubpath(record.webpPreviewSubpath, "webp");
    assertRuntimeSubpath(record.internalSvgSubpath, "svg");
    checks.push({
      type: "url",
      kind: "webp",
      assetId: record.assetId,
      category: record.category,
      url: `${base}/${record.webpPreviewSubpath}`,
      expectedContentType: "image/webp",
    });
    checks.push({
      type: "url",
      kind: "svg",
      assetId: record.assetId,
      category: record.category,
      url: `${base}/${record.internalSvgSubpath}`,
      expectedContentType: "image/svg+xml",
    });
    for (const origin of SVG_CORS_ORIGINS) {
      checks.push({
        type: "svg-cors",
        kind: "svg",
        assetId: record.assetId,
        category: record.category,
        url: `${base}/${record.internalSvgSubpath}`,
        expectedContentType: "image/svg+xml",
        origin,
      });
    }
  }
  return checks;
}

async function runCheck(check) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await runCheckOnce(check, attempt);
    if (result.ok || attempt === 2) return result;
    await delay(250 * attempt);
  }
}

async function runCheckOnce(check, attempt) {
  const startedAt = Date.now();
  try {
    const headers = check.origin ? { Origin: check.origin } : {};
    const response = await fetchWithTimeout(check.url, { method: "GET", headers, cache: "no-store" }, 12000);
    const contentType = response.headers.get("content-type") || "";
    const cacheControl = response.headers.get("cache-control") || "";
    const accessControlAllowOrigin = response.headers.get("access-control-allow-origin") || "";
    const statusOk = response.status === 200;
    const contentTypeOk = contentType.toLowerCase().includes(check.expectedContentType);
    const corsOk = check.type !== "svg-cors" || accessControlAllowOrigin === "*" || accessControlAllowOrigin === check.origin;
    const body = await response.arrayBuffer();
    const nonZeroBytes = body.byteLength > 0;
    return {
      type: check.type,
      kind: check.kind,
      assetId: check.assetId,
      category: check.category,
      url: check.url,
      origin: check.origin || null,
      status: response.status,
      ok: statusOk && contentTypeOk && corsOk && nonZeroBytes,
      contentType,
      expectedContentType: check.expectedContentType,
      cacheControl,
      accessControlAllowOrigin,
      nonZeroBytes,
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

async function updateReadiness(urlPayload) {
  const readiness = await readJson(INPUTS.readiness);
  readiness.sampled_url_checks_passed = urlPayload.summary.passed;
  readiness.blockers = (readiness.blockers || []).filter((blocker) => blocker !== "Sampled public URL checks have not run yet.");
  if (!urlPayload.summary.passed) readiness.blockers.push("Sampled public URL checks failed.");
  await writeJson(INPUTS.readiness, readiness);
}

function renderReport(payload) {
  return `# Runtime Switch Sampled URL Check Report

- Public base URL: ${payload.publicBaseUrl}
- Full verification skipped: ${payload.summary.fullVerificationSkipped}
- Sampled records: ${payload.summary.sampledRecords}
- URL checks: ${payload.summary.urlChecks}
- CORS checks: ${payload.summary.corsChecks}
- Failed checks: ${payload.summary.failedChecks}
- Passed: ${payload.summary.passed}
- Categories represented: ${payload.summary.categoriesRepresented}
- St Patricks Day included: ${payload.summary.stPatricksDayIncluded}
- Animals alligator included: ${payload.summary.animalsAlligatorIncluded}
- Cats playing cards URL structure included: ${payload.summary.catsPlayingCardsIncluded}
- PNG substitute used: ${payload.summary.pngSubstituteUsed}
- r2.dev URLs: ${payload.summary.r2DevUrlCount}
- Duplicate prefix URLs: ${payload.summary.duplicatePrefixCount}
`;
}

function assertRuntimeSubpath(subpath, kind) {
  if (!subpath?.startsWith(`${kind}/`)) throw new Error(`Invalid ${kind} runtime subpath: ${subpath}`);
  if (subpath.includes("coloring-pages/coloring-pages")) throw new Error(`Duplicate prefix in runtime subpath: ${subpath}`);
  if (subpath.includes("coloring/test-v1")) throw new Error(`Old test prefix in runtime subpath: ${subpath}`);
  if (/\/(?:png|thumbs)\//i.test(subpath)) throw new Error(`PNG/thumb path is not allowed: ${subpath}`);
}

function parseArgs(rawArgs) {
  const parsed = {
    publicBaseUrl: DEFAULT_PUBLIC_BASE_URL,
    sampleSize: DEFAULT_SAMPLE_SIZE,
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--public-base-url") parsed.publicBaseUrl = rawArgs[++index] || DEFAULT_PUBLIC_BASE_URL;
    else if (arg === "--sample-size") parsed.sampleSize = Number(rawArgs[++index] || DEFAULT_SAMPLE_SIZE);
  }
  parsed.sampleSize = Number.isFinite(parsed.sampleSize) && parsed.sampleSize >= 100 ? Math.floor(parsed.sampleSize) : DEFAULT_SAMPLE_SIZE;
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
