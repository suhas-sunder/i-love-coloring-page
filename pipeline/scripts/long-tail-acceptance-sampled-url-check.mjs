#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const RUN_ID = "long-tail-acceptance-sampled-url-check";
const PUBLIC_ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const SVG_CORS_ORIGIN = "http://localhost:3005";
const MIN_RECORDS = 150;
const CONCURRENCY = 10;

const REQUIRED_SLUGS = [
  "t-rex",
  "dragons",
  "mushrooms",
  "sushi",
  "bakery",
  "christmas-dogs",
  "bears",
  "pumpkins",
  "wolves",
  "velociraptors",
  "geometric-dogs",
  "chibi-dogs",
  "plushie-cats",
  "plushie-unicorns",
  "robots",
  "roses",
];

const MANIFEST_PATH = "pipeline/manifests/long-tail-acceptance-sampled-url-check-results.json";
const REPORT_PATH = "pipeline/reports/long-tail-acceptance-sampled-url-check-report.md";

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const state = await loadState();
  const sample = selectSample(state);
  const results = await mapLimit(sample, CONCURRENCY, (record) => checkRecord(record));
  const summary = buildSummary(results);
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    publicAssetBaseUrl: PUBLIC_ASSET_BASE_URL,
    svgCorsOrigin: SVG_CORS_ORIGIN,
    summary,
    checkedRecords: results,
    blockers: buildBlockers(summary, results),
  };

  await writeJson(MANIFEST_PATH, payload);
  await writeText(REPORT_PATH, renderReport(payload));
  await refreshAcceptanceGate();

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        status: summary.status,
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
  const [available, implementation, hubs] = await Promise.all([
    readJson("src/generated/coloring/runtime-available-items.json"),
    readJson("pipeline/manifests/long-tail-hub-implementation-results.json"),
    readJson("src/generated/coloring/runtime-hubs.json"),
  ]);
  return {
    available,
    implementation,
    hubs,
    availableById: new Map(available.items.map((item) => [item.assetId, item])),
    hubBySlug: new Map(hubs.hubs.map((hub) => [hub.slug, hub])),
  };
}

function selectSample(state) {
  const selected = new Map();

  function addAsset(assetId, hubSlug, reason) {
    if (selected.has(assetId)) {
      const existing = selected.get(assetId);
      existing.hubSlugs = unique([...existing.hubSlugs, hubSlug]);
      existing.reasons = unique([...existing.reasons, reason]);
      return;
    }
    const item = state.availableById.get(assetId);
    if (!item) return;
    selected.set(assetId, {
      assetId,
      title: item.title,
      categorySlug: item.categorySlug,
      hubSlugs: [hubSlug],
      reasons: [reason],
      webpUrl: buildAssetUrl(item.assetSubpaths.webpPreview),
      svgUrl: buildAssetUrl(item.assetSubpaths.svg),
    });
  }

  for (const slug of REQUIRED_SLUGS) {
    const hub = state.hubBySlug.get(slug);
    if (!hub) continue;
    const limit = slug === "t-rex" ? hub.assetIds.length : Math.min(12, hub.assetIds.length);
    for (const assetId of hub.assetIds.slice(0, limit)) addAsset(assetId, slug, "required promoted hub sample");
  }

  for (const promotedHub of state.implementation.promotedHubs.filter((hub) => hub.assetCount <= 15)) {
    const hub = state.hubBySlug.get(promotedHub.slug);
    if (!hub) continue;
    for (const assetId of hub.assetIds.slice(0, Math.min(4, hub.assetIds.length))) addAsset(assetId, hub.slug, "lower-count promoted hub sample");
  }

  for (const promotedHub of state.implementation.promotedHubs) {
    const hub = state.hubBySlug.get(promotedHub.slug);
    if (!hub) continue;
    const highDetailIds = hub.assetIds.filter((assetId) => {
      const item = state.availableById.get(assetId);
      return /detailed|mandala|geometric|pattern|intricate/i.test(`${item?.title || ""} ${item?.filenameSlug || ""}`);
    });
    for (const assetId of highDetailIds.slice(0, 3)) addAsset(assetId, hub.slug, "high-detail style sample");
    if (selected.size >= MIN_RECORDS + 24) break;
  }

  let index = 0;
  const promotedHubs = state.implementation.promotedHubs;
  while (selected.size < MIN_RECORDS && index < 1000) {
    for (const promotedHub of promotedHubs) {
      const hub = state.hubBySlug.get(promotedHub.slug);
      if (!hub?.assetIds?.length) continue;
      const assetId = hub.assetIds[index % hub.assetIds.length];
      addAsset(assetId, hub.slug, "coverage fill sample");
      if (selected.size >= MIN_RECORDS) break;
    }
    index += 1;
  }

  return [...selected.values()].slice(0, Math.max(MIN_RECORDS, selected.size));
}

async function checkRecord(record) {
  const webp = await checkUrl(record.webpUrl, {
    expected: "webp",
    origin: null,
  });
  const svg = await checkUrl(record.svgUrl, {
    expected: "svg",
    origin: SVG_CORS_ORIGIN,
  });
  const urlText = `${record.webpUrl}\n${record.svgUrl}`;
  const checks = {
    webpHttp200: webp.status === 200,
    webpContentType: /^image\/webp\b/i.test(webp.contentType),
    svgHttp200: svg.status === 200,
    svgContentType: isAcceptableSvgContentType(svg.contentType),
    svgCors: svg.corsAllowed,
    noR2Dev: !/r2\.dev/i.test(urlText),
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(urlText),
    noPngSubstitute: !/\/png\/|\.png(?:$|\?)/i.test(urlText),
    noDuplicatePrefix: !/coloring-pages\/coloring-pages/i.test(urlText),
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
    return { url, status: 0, contentType: "", accessControlAllowOrigin: "", corsAllowed: false, method: "none", error: "missing url" };
  }
  const headers = options.origin ? { Origin: options.origin } : {};
  let response = null;
  let method = "HEAD";
  let error = "";
  try {
    response = await fetch(url, { method, headers, redirect: "follow" });
    if (response.status === 405 || response.status === 403) {
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
    contentType,
    accessControlAllowOrigin,
    corsAllowed,
    method,
    error,
  };
}

function buildSummary(results) {
  const recordsChecked = results.length;
  const summary = {
    status: "completed",
    recordsChecked,
    minRecordsRequired: MIN_RECORDS,
    webpHttp200Count: results.filter((record) => record.checks.webpHttp200).length,
    webpContentTypePassCount: results.filter((record) => record.checks.webpContentType).length,
    svgHttp200Count: results.filter((record) => record.checks.svgHttp200).length,
    svgContentTypePassCount: results.filter((record) => record.checks.svgContentType).length,
    svgCorsPassCount: results.filter((record) => record.checks.svgCors).length,
    noR2Dev: results.every((record) => record.checks.noR2Dev),
    noLocalhost: results.every((record) => record.checks.noLocalhost),
    noPngSubstitute: results.every((record) => record.checks.noPngSubstitute),
    noDuplicatePrefix: results.every((record) => record.checks.noDuplicatePrefix),
    tRexRecordsChecked: results.filter((record) => record.hubSlugs.includes("t-rex")).length,
    requiredHubsCovered: REQUIRED_SLUGS.filter((slug) => results.some((record) => record.hubSlugs.includes(slug))),
    failedRecords: results.filter((record) => !record.passed).length,
  };
  return {
    ...summary,
    sampledUrlCheckPassed:
      recordsChecked >= MIN_RECORDS &&
      summary.failedRecords === 0 &&
      summary.noR2Dev &&
      summary.noLocalhost &&
      summary.noPngSubstitute &&
      summary.noDuplicatePrefix,
  };
}

function buildBlockers(summary, results) {
  const blockers = [];
  if (summary.recordsChecked < MIN_RECORDS) blockers.push(`Only ${summary.recordsChecked} records checked; ${MIN_RECORDS} required.`);
  if (summary.failedRecords > 0) blockers.push(`${summary.failedRecords} sampled records failed URL checks.`);
  if (!summary.noR2Dev) blockers.push("A sampled URL used r2.dev.");
  if (!summary.noLocalhost) blockers.push("A sampled URL used localhost.");
  if (!summary.noPngSubstitute) blockers.push("A sampled URL used a PNG substitute.");
  if (!summary.noDuplicatePrefix) blockers.push("A sampled URL used a duplicate coloring-pages prefix.");
  return blockers.map((blocker) => {
    const failedExamples = results.filter((record) => !record.passed).slice(0, 5).map((record) => record.assetId);
    return failedExamples.length ? `${blocker} Examples: ${failedExamples.join(", ")}` : blocker;
  });
}

function renderReport(payload) {
  const failed = payload.checkedRecords.filter((record) => !record.passed).slice(0, 20);
  const lines = [`# Long-Tail Acceptance Sampled URL Check

- Status: ${payload.summary.status}
- Passed: ${payload.summary.sampledUrlCheckPassed}
- Records checked: ${payload.summary.recordsChecked}
- Required records: ${payload.summary.minRecordsRequired}
- WebP HTTP 200: ${payload.summary.webpHttp200Count}
- WebP content type pass: ${payload.summary.webpContentTypePassCount}
- SVG HTTP 200: ${payload.summary.svgHttp200Count}
- SVG content type pass: ${payload.summary.svgContentTypePassCount}
- SVG CORS pass: ${payload.summary.svgCorsPassCount}
- T-Rex records checked: ${payload.summary.tRexRecordsChecked}
- Required hubs covered: ${payload.summary.requiredHubsCovered.join(", ")}
- No r2.dev: ${payload.summary.noR2Dev}
- No localhost: ${payload.summary.noLocalhost}
- No PNG substitute: ${payload.summary.noPngSubstitute}
- No duplicate prefix: ${payload.summary.noDuplicatePrefix}
- Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}
`];

  if (failed.length) {
    lines.push("## Failed Samples");
    lines.push("");
    lines.push(
      failed
        .map((record) => `- ${record.assetId}: WebP ${record.webp.status} ${record.webp.contentType}; SVG ${record.svg.status} ${record.svg.contentType}; CORS ${record.svg.accessControlAllowOrigin || "missing"}`)
        .join("\n"),
    );
  } else {
    lines.push("No sampled URL failures were found.");
  }

  return `${lines.join("\n")}\n`;
}

function buildAssetUrl(subpath) {
  return subpath ? `${PUBLIC_ASSET_BASE_URL}/${subpath.replace(/^\/+/, "")}` : "";
}

function isAcceptableSvgContentType(contentType) {
  return /image\/svg\+xml|application\/svg\+xml|text\/xml|application\/xml|application\/octet-stream/i.test(contentType);
}

async function refreshAcceptanceGate() {
  await execFileAsync("node", ["pipeline/scripts/build-long-tail-acceptance-gate.mjs"], {
    cwd: REPO_ROOT,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10,
  });
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex], currentIndex);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, payload) {
  await writeText(relativePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeText(relativePath, contents) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}

function unique(values) {
  return [...new Set(values)];
}
