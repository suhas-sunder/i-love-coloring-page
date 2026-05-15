#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const RUN_ID = "post-long-tail-r2-sampled-url-check";
const PUBLIC_ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const SVG_CORS_ORIGIN = "https://www.ilovecoloringpage.com";
const MIN_RECORDS = 200;
const CONCURRENCY = 12;
const MANIFEST_PATH = "pipeline/manifests/post-long-tail-r2-sampled-url-check-results.json";
const REPORT_PATH = "pipeline/reports/post-long-tail-r2-sampled-url-check-report.md";

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const state = await loadState();
  const sample = selectSample(state);
  const checkedRecords = await mapLimit(sample, CONCURRENCY, (record) => checkRecord(record, state));
  const summary = buildSummary(checkedRecords);
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    publicAssetBaseUrl: PUBLIC_ASSET_BASE_URL,
    svgCorsOrigin: SVG_CORS_ORIGIN,
    summary,
    checkedRecords,
    blockers: buildBlockers(summary, checkedRecords),
  };

  await writeJson(MANIFEST_PATH, payload);
  await writeText(REPORT_PATH, renderReport(payload));
  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        recordsChecked: summary.recordsChecked,
        sampledUrlCheckPassed: summary.sampledUrlCheckPassed,
        blockers: payload.blockers,
      },
      null,
      2,
    ),
  );

  if (!summary.sampledUrlCheckPassed) process.exitCode = 1;
}

async function loadState() {
  const [available, deferred, promoted, hubs] = await Promise.all([
    readJson("src/generated/coloring/runtime-available-items.json"),
    readJson("src/generated/coloring/runtime-deferred-items.json"),
    readJson("pipeline/manifests/long-tail-round-2-promoted-hubs.json"),
    readJson("src/generated/coloring/runtime-hubs.json"),
  ]);
  const deferredIds = new Set((deferred.records || deferred.items || []).map((record) => record.assetId));
  return {
    available,
    deferredIds,
    promoted,
    hubs,
    itemById: new Map(available.items.map((item) => [item.assetId, item])),
    hubBySlug: new Map(hubs.hubs.map((hub) => [hub.slug, hub])),
  };
}

function selectSample(state) {
  const selected = new Map();

  function add(assetId, hubSlug, reason) {
    const item = state.itemById.get(assetId);
    if (!item || selected.has(assetId)) return;
    selected.set(assetId, {
      assetId,
      title: item.title,
      categorySlug: item.categorySlug,
      hubSlugs: [hubSlug],
      reason,
      webpUrl: buildAssetUrl(item.assetSubpaths?.webpPreview),
      svgUrl: buildAssetUrl(item.assetSubpaths?.svg),
    });
  }

  for (const promotedHub of state.promoted.hubs) {
    const hub = state.hubBySlug.get(promotedHub.slug);
    if (!hub?.assetIds?.length) continue;
    const limit = Math.min(8, hub.assetIds.length);
    for (const assetId of hub.assetIds.slice(0, limit)) add(assetId, promotedHub.slug, "promoted hub representative sample");
  }

  if (selected.size < MIN_RECORDS) {
    for (const promotedHub of state.promoted.hubs) {
      const hub = state.hubBySlug.get(promotedHub.slug);
      if (!hub?.assetIds?.length) continue;
      for (const assetId of hub.assetIds) {
        if (selected.size >= MIN_RECORDS) break;
        add(assetId, promotedHub.slug, "promoted hub coverage fill");
      }
      if (selected.size >= MIN_RECORDS) break;
    }
  }

  return [...selected.values()].slice(0, Math.max(MIN_RECORDS, selected.size));
}

async function checkRecord(record, state) {
  const webp = await checkUrl(record.webpUrl, { expected: "webp", origin: null });
  const svg = await checkUrl(record.svgUrl, { expected: "svg", origin: SVG_CORS_ORIGIN });
  const urlText = `${record.webpUrl}\n${record.svgUrl}`;
  const checks = {
    webpHttp200: webp.status === 200,
    webpContentType: /^image\/webp\b/i.test(webp.contentType),
    svgHttp200: svg.status === 200,
    svgContentType: /^image\/svg\+xml\b|^text\/xml\b|^application\/xml\b/i.test(svg.contentType),
    svgCors: svg.corsAllowed,
    noR2Dev: !/r2\.dev/i.test(urlText),
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(urlText),
    noPngSubstitute: !/\/png\/|\.png(?:$|\?)/i.test(urlText),
    noDuplicatePrefix: !/coloring-pages\/coloring-pages/i.test(urlText),
    notDeferred: !state.deferredIds.has(record.assetId),
  };
  return {
    ...record,
    webp,
    svg,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

async function checkUrl(url, options) {
  if (!url) {
    return {
      url,
      status: 0,
      contentType: "",
      accessControlAllowOrigin: "",
      corsAllowed: false,
      method: "none",
      error: "missing url",
    };
  }
  const headers = options.origin ? { Origin: options.origin } : {};
  let response = null;
  let method = "HEAD";
  let error = "";
  try {
    response = await fetch(url, { method, headers, redirect: "follow" });
    if (response.status === 403 || response.status === 405) {
      method = "GET";
      response = await fetch(url, { method, headers: { ...headers, Range: "bytes=0-0" }, redirect: "follow" });
    }
  } catch (fetchError) {
    error = fetchError?.message || String(fetchError);
  }
  const contentType = response?.headers?.get("content-type") || "";
  const accessControlAllowOrigin = response?.headers?.get("access-control-allow-origin") || "";
  const corsAllowed =
    !options.origin ||
    accessControlAllowOrigin === "*" ||
    accessControlAllowOrigin
      .split(",")
      .map((value) => value.trim())
      .includes(options.origin);
  return {
    url,
    status: response?.status || 0,
    ok: response?.ok || false,
    contentType,
    accessControlAllowOrigin,
    corsAllowed,
    method,
    error,
  };
}

function buildSummary(results) {
  const passed = results.filter((record) => record.passed).length;
  return {
    recordsChecked: results.length,
    passedRecords: passed,
    failedRecords: results.length - passed,
    webpHttp200: results.every((record) => record.checks.webpHttp200),
    webpContentTypeImageWebp: results.every((record) => record.checks.webpContentType),
    svgHttp200: results.every((record) => record.checks.svgHttp200),
    svgContentTypeAcceptable: results.every((record) => record.checks.svgContentType),
    svgCorsPassed: results.every((record) => record.checks.svgCors),
    noR2Dev: results.every((record) => record.checks.noR2Dev),
    noLocalhost: results.every((record) => record.checks.noLocalhost),
    noPngSubstitute: results.every((record) => record.checks.noPngSubstitute),
    noDuplicatePrefix: results.every((record) => record.checks.noDuplicatePrefix),
    noDeferredRecords: results.every((record) => record.checks.notDeferred),
    sampledUrlCheckPassed: results.length >= MIN_RECORDS && passed === results.length,
  };
}

function buildBlockers(summary, results) {
  const blockers = [];
  if (summary.recordsChecked < MIN_RECORDS) blockers.push(`Only ${summary.recordsChecked} records were checked; expected at least ${MIN_RECORDS}.`);
  for (const [key, value] of Object.entries(summary)) {
    if (["recordsChecked", "passedRecords", "failedRecords", "sampledUrlCheckPassed"].includes(key)) continue;
    if (value !== true) blockers.push(`${key} failed.`);
  }
  for (const record of results.filter((entry) => !entry.passed).slice(0, 10)) {
    blockers.push(`${record.assetId} failed sampled URL checks.`);
  }
  return blockers;
}

function renderReport(payload) {
  const rows = Object.entries(payload.summary)
    .map(([key, value]) => `| ${key} | ${String(value)} |`)
    .join("\n");
  const sampleRows = payload.checkedRecords
    .slice(0, 20)
    .map((record) => `| ${record.assetId} | ${record.title} | ${record.hubSlugs.join(", ")} | ${record.passed} |`)
    .join("\n");
  return `# Post Long-Tail R2 Sampled URL Check

| Check | Result |
| --- | --- |
${rows}

## Sampled Records

| Asset ID | Title | Hub | Passed |
| --- | --- | --- | --- |
${sampleRows}

Blockers:
${payload.blockers.length ? payload.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None"}
`;
}

function buildAssetUrl(subpath) {
  if (!subpath) return "";
  return `${PUBLIC_ASSET_BASE_URL.replace(/\/$/, "")}/${subpath.replace(/^\//, "")}`;
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
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
  await writeFile(absolutePath, value, "utf8");
}
