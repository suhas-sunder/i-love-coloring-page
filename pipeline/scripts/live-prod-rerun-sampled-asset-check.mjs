#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();
const SITE_ORIGIN = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const SAMPLE_SIZE = 160;
const CONCURRENCY = 8;
const REQUIRED_ASSET_ID = "animals__animals-alligator__4feec8505a";
const OUTPUT_JSON = "pipeline/manifests/live-prod-rerun-sampled-asset-check-results.json";
const OUTPUT_REPORT = "pipeline/reports/live-prod-rerun-sampled-asset-check-report.md";

const REQUIRED_HUBS = [
  "animals",
  "anime-girls",
  "geometric",
  "mandalas",
  "christmas",
  "plushies",
  "st-patricks-day",
  "detailed-for-adults",
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const generatedAt = new Date().toISOString();
  const assetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const selected = selectSample(assetPaths.records, hubs.hubs);
  const checks = buildChecks(selected);
  const results = [];

  await runPool(checks, CONCURRENCY, async (check) => {
    results.push(await runCheck(check));
  });
  results.sort((left, right) => `${left.assetId}:${left.type}:${left.kind}`.localeCompare(`${right.assetId}:${right.type}:${right.kind}`));

  const failed = results.filter((result) => !result.ok);
  const coverage = buildCoverage(selected, hubs.hubs);
  const payload = {
    generatedAt,
    runId: "live-prod-rerun-sampled-asset-check",
    siteOrigin: SITE_ORIGIN,
    assetBaseUrl: ASSET_BASE_URL,
    summary: {
      sampledRecords: selected.length,
      urlChecks: results.filter((result) => result.type === "url").length,
      corsChecks: results.filter((result) => result.type === "svg-cors").length,
      failedChecks: failed.length,
      webpHttp200: results.filter((result) => result.kind === "webp" && result.status === 200).length,
      webpImageWebp: results.filter((result) => result.kind === "webp" && /^image\/webp\b/i.test(result.contentType || "")).length,
      svgHttp200: results.filter((result) => result.kind === "svg" && result.status === 200).length,
      svgImageSvg: results.filter((result) => result.kind === "svg" && /^image\/svg\+xml\b/i.test(result.contentType || "")).length,
      svgCorsWithProductionOrigin: results.filter((result) => result.type === "svg-cors" && result.corsOk).length,
      animalsAlligatorIncluded: selected.some((record) => record.assetId === REQUIRED_ASSET_ID),
      requiredHubCoveragePassed: coverage.every((entry) => entry.represented),
      noR2Dev: results.every((result) => !/r2\.dev/i.test(result.url)),
      noLocalhost: results.every((result) => !/localhost|127\.0\.0\.1/i.test(result.url)),
      noPngSubstitute: results.every((result) => !/\/png\//i.test(result.url) && !/\/thumbs\//i.test(result.url)),
      noDuplicatePrefix: results.every((result) => !/coloring-pages\/coloring-pages/i.test(result.url)),
      noMissingUploadedAvailableRecordsInSample: failed.length === 0,
      passed: failed.length === 0 && selected.length >= 150 && coverage.every((entry) => entry.represented),
    },
    requiredHubCoverage: coverage,
    selectedRecords: selected.map((record) => ({
      assetId: record.assetId,
      category: record.category,
      webpUrl: record.expectedPublicWebpUrl || buildAssetUrl(record.webpPreviewSubpath),
      svgUrl: record.expectedPublicSvgUrl || buildAssetUrl(record.internalSvgSubpath),
    })),
    results,
  };

  await writeJson(OUTPUT_JSON, payload);
  await writeText(OUTPUT_REPORT, renderReport(payload));
  console.log(JSON.stringify(payload.summary, null, 2));
}

function selectSample(records, hubs) {
  const byId = new Map(records.map((record) => [record.assetId, record]));
  const hubBySlug = new Map(hubs.map((hub) => [hub.slug || hub.normalizedSlug, hub]));
  const selected = new Map();

  function add(assetId) {
    const record = byId.get(assetId);
    if (record) selected.set(record.assetId, record);
  }

  add(REQUIRED_ASSET_ID);
  for (const slug of REQUIRED_HUBS) {
    const hub = hubBySlug.get(slug);
    for (const assetId of [...(hub?.featuredAssetIds || []), ...(hub?.assetIds || [])].slice(0, 16)) {
      add(assetId);
    }
  }

  const requiredCategories = ["animals", "anime-girls", "mandala", "mandala-geometry-patterns", "christmas", "plushies", "st-patricks-day"];
  for (const category of requiredCategories) {
    for (const record of records.filter((entry) => entry.category === category).slice(0, 10)) {
      add(record.assetId);
    }
  }

  for (const record of records) {
    if (selected.size >= SAMPLE_SIZE) break;
    add(record.assetId);
  }

  return [...selected.values()].slice(0, SAMPLE_SIZE);
}

function buildCoverage(selected, hubs) {
  const selectedIds = new Set(selected.map((record) => record.assetId));
  const hubBySlug = new Map(hubs.map((hub) => [hub.slug || hub.normalizedSlug, hub]));
  return REQUIRED_HUBS.map((slug) => {
    const hub = hubBySlug.get(slug);
    const matchedAssetIds = (hub?.assetIds || []).filter((assetId) => selectedIds.has(assetId));
    return {
      slug,
      represented: matchedAssetIds.length > 0,
      matchedCount: matchedAssetIds.length,
    };
  });
}

function buildChecks(records) {
  const checks = [];
  for (const record of records) {
    const webpUrl = record.expectedPublicWebpUrl || buildAssetUrl(record.webpPreviewSubpath);
    const svgUrl = record.expectedPublicSvgUrl || buildAssetUrl(record.internalSvgSubpath);
    checks.push({
      type: "url",
      kind: "webp",
      assetId: record.assetId,
      category: record.category,
      url: webpUrl,
      expectedContentType: "image/webp",
    });
    checks.push({
      type: "url",
      kind: "svg",
      assetId: record.assetId,
      category: record.category,
      url: svgUrl,
      expectedContentType: "image/svg+xml",
    });
    checks.push({
      type: "svg-cors",
      kind: "svg",
      assetId: record.assetId,
      category: record.category,
      url: svgUrl,
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
      headers: check.origin ? { Origin: check.origin } : {},
      cache: "no-store",
    }, 15000);
    const bytes = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "";
    const accessControlAllowOrigin = response.headers.get("access-control-allow-origin") || "";
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
      ok: response.status === 200 && contentTypeOk && corsOk && bytes.byteLength > 0,
      contentType,
      accessControlAllowOrigin,
      corsOk,
      byteLength: bytes.byteLength,
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
      contentType: "",
      accessControlAllowOrigin: "",
      corsOk: false,
      error: error?.message || String(error),
      attempt,
      elapsedMs: Date.now() - startedAt,
    };
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
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

function buildAssetUrl(subpath) {
  return `${ASSET_BASE_URL}/${String(subpath || "").replace(/^\/+/, "")}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, data) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${text.replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`, "utf8");
}

function renderReport(payload) {
  return [
    "# Live Production Rerun Sampled Asset Check",
    "",
    `- Sampled records: ${payload.summary.sampledRecords}`,
    `- URL checks: ${payload.summary.urlChecks}`,
    `- CORS checks: ${payload.summary.corsChecks}`,
    `- Failed checks: ${payload.summary.failedChecks}`,
    `- Animals Alligator included: ${payload.summary.animalsAlligatorIncluded}`,
    `- Required hub coverage passed: ${payload.summary.requiredHubCoveragePassed}`,
    `- WebP HTTP 200: ${payload.summary.webpHttp200}`,
    `- WebP image/webp: ${payload.summary.webpImageWebp}`,
    `- SVG HTTP 200: ${payload.summary.svgHttp200}`,
    `- SVG image/svg+xml: ${payload.summary.svgImageSvg}`,
    `- SVG CORS with production origin: ${payload.summary.svgCorsWithProductionOrigin}`,
    `- No r2.dev: ${payload.summary.noR2Dev}`,
    `- No localhost: ${payload.summary.noLocalhost}`,
    `- No PNG substitute: ${payload.summary.noPngSubstitute}`,
    `- No duplicate prefix: ${payload.summary.noDuplicatePrefix}`,
    `- Missing uploaded available records in sample: ${!payload.summary.noMissingUploadedAvailableRecordsInSample}`,
    `- Result: ${payload.summary.passed}`,
  ].join("\n");
}
