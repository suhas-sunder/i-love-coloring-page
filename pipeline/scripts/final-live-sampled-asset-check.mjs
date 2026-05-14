#!/usr/bin/env node

import {
  ASSET_BASE_URL,
  EXPECTED_RUNTIME_RECORDS,
  SITE_URL,
  bool,
  fetchWithRedirects,
  renderTable,
  selectSampleAssetRecords,
  writeJson,
  writeReport,
} from "./final-live-utils.mjs";

const outputFiles = {
  manifest: "pipeline/manifests/final-live-sampled-asset-check-results.json",
  report: "pipeline/reports/final-live-sampled-asset-check-report.md",
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const { records, coverage } = await selectSampleAssetRecords(250);
  const checks = await mapWithConcurrency(records.slice(0, 250), 8, checkRecord);
  const payload = buildPayload(checks, coverage);
  await writeJson(outputFiles.manifest, payload);
  await writeReport(outputFiles.report, renderReport(payload));
  console.log(JSON.stringify({
    checked: payload.summary.checkedRecordCount,
    sampledAssetCheckPassed: payload.summary.sampledAssetCheckPassed,
    requiredCoveragePassed: payload.summary.requiredCoveragePassed,
    blockers: payload.blockers,
  }, null, 2));
}

async function checkRecord(record) {
  const webpUrl = record.expectedPublicWebpUrl;
  const svgUrl = record.expectedPublicSvgUrl;
  const [webp, svg] = await Promise.all([
    fetchAssetHeaders(webpUrl, false),
    fetchAssetHeaders(svgUrl, true),
  ]);
  return {
    assetId: record.assetId,
    title: record.item?.title || "",
    category: record.category,
    sampleReason: record.sampleReason,
    webpUrl,
    svgUrl,
    webp,
    svg,
    checks: {
      runtimeAvailable: record.status === "runtime_available",
      webpReturns200: webp.status === 200,
      webpContentTypeOk: /image\/webp/i.test(webp.contentType),
      svgReturns200: svg.status === 200,
      svgContentTypeOk: /image\/svg\+xml|application\/octet-stream|text\/xml|application\/xml/i.test(svg.contentType),
      svgCorsPasses: svg.accessControlAllowOrigin === SITE_URL || svg.accessControlAllowOrigin === "*",
      noR2Dev: !/r2\.dev/i.test(`${webpUrl}\n${svgUrl}`),
      noLocalhost: !/localhost|127\.0\.0\.1/i.test(`${webpUrl}\n${svgUrl}`),
      noPngSubstitute: !/\/png\/|\/thumbs\/|\.(?:png|jpg|jpeg)(?:$|\?)/i.test(webpUrl),
      noDuplicatePrefix: !/coloring-pages\/coloring-pages/i.test(`${webpUrl}\n${svgUrl}`),
    },
  };
}

async function fetchAssetHeaders(url, withOrigin) {
  const headers = withOrigin ? { Origin: SITE_URL } : {};
  let result = await fetchWithRedirects(url, { method: "HEAD", headers, accept: "image/*,*/*", timeoutMs: 20_000 });
  if (![200, 301, 302, 304].includes(result.status) || !result.contentType) {
    result = await fetchWithRedirects(url, { method: "GET", headers, accept: "image/*,*/*", timeoutMs: 25_000 });
  }
  return {
    status: result.status,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    bodySize: result.bodySize,
    accessControlAllowOrigin: result.accessControlAllowOrigin,
    error: result.error,
  };
}

function buildPayload(checks, coverage) {
  const failed = checks.filter((check) => !Object.values(check.checks).every(Boolean));
  const summary = {
    expectedRuntimeRecords: EXPECTED_RUNTIME_RECORDS,
    checkedRecordCount: checks.length,
    requiredCoverage,
    requiredCoveragePassed: Object.values(coverage).every(Boolean),
    webpReturns200: checks.every((check) => check.checks.webpReturns200),
    webpContentTypeOk: checks.every((check) => check.checks.webpContentTypeOk),
    svgReturns200: checks.every((check) => check.checks.svgReturns200),
    svgContentTypeOk: checks.every((check) => check.checks.svgContentTypeOk),
    svgCorsPassesWithOrigin: checks.every((check) => check.checks.svgCorsPasses),
    noR2Dev: checks.every((check) => check.checks.noR2Dev),
    noLocalhost: checks.every((check) => check.checks.noLocalhost),
    noPngSubstitute: checks.every((check) => check.checks.noPngSubstitute),
    noDuplicatePrefix: checks.every((check) => check.checks.noDuplicatePrefix),
    noDeferredRecordsInSample: checks.every((check) => check.checks.runtimeAvailable),
    failedRecordCount: failed.length,
  };
  summary.sampledAssetCheckPassed = [
    summary.checkedRecordCount >= 250,
    summary.requiredCoveragePassed,
    summary.webpReturns200,
    summary.webpContentTypeOk,
    summary.svgReturns200,
    summary.svgContentTypeOk,
    summary.svgCorsPassesWithOrigin,
    summary.noR2Dev,
    summary.noLocalhost,
    summary.noPngSubstitute,
    summary.noDuplicatePrefix,
    summary.noDeferredRecordsInSample,
  ].every(Boolean);

  const blockers = [];
  if (!summary.sampledAssetCheckPassed) blockers.push("One or more sampled live WebP/SVG asset checks failed.");

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-live-sampled-asset-check-results",
    assetBaseUrl: ASSET_BASE_URL,
    coverage,
    summary,
    failedRecords: failed.slice(0, 50),
    checks,
    blockers,
  };
}

const requiredCoverage = [
  "animals",
  "anime-girls",
  "geometric-mandala",
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
  "animals-alligator",
];

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function renderReport(payload) {
  return [
    "# Final Live Sampled Asset Check",
    "",
    renderTable([
      ["Checked records", String(payload.summary.checkedRecordCount)],
      ["Required category coverage", bool(payload.summary.requiredCoveragePassed)],
      ["WebP returns 200", bool(payload.summary.webpReturns200)],
      ["WebP content type image/webp", bool(payload.summary.webpContentTypeOk)],
      ["SVG returns 200", bool(payload.summary.svgReturns200)],
      ["SVG content type acceptable", bool(payload.summary.svgContentTypeOk)],
      ["SVG CORS passes with Origin", bool(payload.summary.svgCorsPassesWithOrigin)],
      ["No r2.dev URLs", bool(payload.summary.noR2Dev)],
      ["No localhost URLs", bool(payload.summary.noLocalhost)],
      ["No PNG substitute", bool(payload.summary.noPngSubstitute)],
      ["No duplicate prefix", bool(payload.summary.noDuplicatePrefix)],
      ["No deferred records in sample", bool(payload.summary.noDeferredRecordsInSample)],
      ["Result", bool(payload.summary.sampledAssetCheckPassed)],
    ]),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join(" ") : "none"}`,
  ].join("\n");
}
