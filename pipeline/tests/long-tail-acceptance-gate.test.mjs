import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = process.cwd();
const EXPECTED_RUNTIME_HUB_COUNT = 131;
const EXPECTED_SITEMAP_LOC_COUNT = 138;
const EXPECTED_T_REX_ASSET_COUNT = 18;
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;

const REQUIRED_ACCEPTANCE_MANIFESTS = [
  "pipeline/manifests/long-tail-acceptance-context-check.json",
  "pipeline/manifests/long-tail-promoted-hub-quality-audit.json",
  "pipeline/manifests/long-tail-promoted-hub-acceptance.json",
  "pipeline/manifests/long-tail-manual-review-hub-package.json",
  "pipeline/manifests/long-tail-backlog-candidate-package.json",
  "pipeline/manifests/long-tail-sitemap-route-audit.json",
  "pipeline/manifests/long-tail-seo-content-audit.json",
  "pipeline/manifests/long-tail-internal-linking-audit.json",
  "pipeline/manifests/long-tail-acceptance-browser-qa-results.json",
  "pipeline/manifests/long-tail-acceptance-sampled-url-check-results.json",
  "pipeline/manifests/long-tail-acceptance-gate.json",
];

const REQUIRED_ACCEPTANCE_REPORTS = [
  "pipeline/reports/long-tail-acceptance-context-check.md",
  "pipeline/reports/long-tail-promoted-hub-quality-audit.md",
  "pipeline/reports/long-tail-promoted-hub-acceptance.md",
  "pipeline/reports/long-tail-manual-review-hub-package.md",
  "pipeline/reports/long-tail-manual-review-hubs.csv",
  "pipeline/reports/long-tail-backlog-candidate-package.md",
  "pipeline/reports/long-tail-backlog-candidates.csv",
  "pipeline/reports/long-tail-sitemap-route-audit.md",
  "pipeline/reports/long-tail-seo-content-audit.md",
  "pipeline/reports/long-tail-internal-linking-audit.md",
  "pipeline/reports/long-tail-acceptance-browser-qa-report.md",
  "pipeline/reports/long-tail-acceptance-sampled-url-check-report.md",
  "pipeline/reports/long-tail-acceptance-gate.md",
];

test("long-tail acceptance artifacts exist and parse", async () => {
  for (const relativePath of [...REQUIRED_ACCEPTANCE_MANIFESTS, ...REQUIRED_ACCEPTANCE_REPORTS]) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
  }

  for (const relativePath of REQUIRED_ACCEPTANCE_MANIFESTS) {
    JSON.parse(await readText(relativePath));
  }
});

test("acceptance context preserves static-export and asset boundaries", async () => {
  const context = await readJson("pipeline/manifests/long-tail-acceptance-context-check.json");
  const nextConfig = await readText("next.config.mjs");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const projectText = await readProjectText(["app", "src"]);
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");

  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.currentBranch, "ver-5-deployed-may-13-2026");
  assert.equal(context.summary.commitIncludes2e2206d, true);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(context.summary.runtimeAvailableRecords, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(context.summary.deferredManualReviewRecords, EXPECTED_DEFERRED_RECORDS);
  assert.equal(context.summary.svgUserFacingDownloadAbsent, true);
  assert.equal(context.summary.publicDownloadsPngJpgWebp, true);
  assert.equal(context.summary.liveAdsenseCodePresent, false);
  assert.equal(context.summary.imageSitemapPresent, false);
  assert.equal(context.summary.openGraphImageGenerationPresent, false);
  assert.equal(context.summary.jsonLdExpansionDeferred, true);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)), false);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /opengraph-image|twitter-image|ImageResponse|imageSitemap|Image Sitemap/i);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|svgDownload|downloadSvg/i);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
});

test("promoted hubs are accepted without routing manual-review or backlog candidates", async () => {
  const audit = await readJson("pipeline/manifests/long-tail-promoted-hub-quality-audit.json");
  const acceptance = await readJson("pipeline/manifests/long-tail-promoted-hub-acceptance.json");
  const manualPackage = await readJson("pipeline/manifests/long-tail-manual-review-hub-package.json");
  const backlogPackage = await readJson("pipeline/manifests/long-tail-backlog-candidate-package.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const hubItems = await readJson("src/generated/coloring/runtime-hub-items.json");
  const siteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const sitemapAudit = await readJson("pipeline/manifests/long-tail-sitemap-route-audit.json");

  assert.equal(audit.summary.promotedHubCount, 66);
  assert.equal(acceptance.summary.promotedHubCount, 66);
  assert.equal(acceptance.summary.shouldDemoteCount, 0);
  assert.equal(manualPackage.summary.candidateCount, 21);
  assert.equal(backlogPackage.summary.candidateCount, 50);
  assert.equal(routes.routes.length, EXPECTED_RUNTIME_HUB_COUNT);
  assert.equal(sitemapAudit.summary.runtimeIndexableHubCount, EXPECTED_RUNTIME_HUB_COUNT);
  assert.equal(sitemapAudit.summary.exportedSitemapLocCount, EXPECTED_SITEMAP_LOC_COUNT);
  assert.equal(sitemapAudit.summary.noPerImageRoutes, true);
  assert.equal(sitemapAudit.summary.noBacklogManualReviewRoutesInSitemap, true);
  assert.equal(sitemapAudit.summary.noDuplicateRoutes, true);
  assert.equal(siteMap.entries.some((entry) => /\/(?:image|item|asset)\//i.test(entry.path)), false);

  const manualOrBacklogSlugs = new Set([
    ...manualPackage.candidates.map((candidate) => candidate.slug),
    ...backlogPackage.candidates.map((candidate) => candidate.slug),
  ]);
  assert.equal(siteMap.entries.some((entry) => manualOrBacklogSlugs.has(entry.slug)), false);
  assert.equal(routes.routes.some((route) => manualOrBacklogSlugs.has(route.slug)), false);

  const tRex = acceptance.hubs.find((hub) => hub.slug === "t-rex");
  assert.ok(tRex, "T-Rex acceptance entry should exist");
  assert.equal(tRex.status, "accepted");
  assert.equal(tRex.assetCount, EXPECTED_T_REX_ASSET_COUNT);
  assert.equal(hubItems.items.filter((item) => item.hubIds?.includes("hub_t_rex")).length, EXPECTED_T_REX_ASSET_COUNT);
});

test("SEO content, internal links, browser QA, sampled URLs, and gate are accepted", async () => {
  const seoAudit = await readJson("pipeline/manifests/long-tail-seo-content-audit.json");
  const internalAudit = await readJson("pipeline/manifests/long-tail-internal-linking-audit.json");
  const browserQa = await readJson("pipeline/manifests/long-tail-acceptance-browser-qa-results.json");
  const sampledUrls = await readJson("pipeline/manifests/long-tail-acceptance-sampled-url-check-results.json");
  const gate = await readJson("pipeline/manifests/long-tail-acceptance-gate.json");

  assert.equal(seoAudit.summary.passed, true);
  assert.equal(seoAudit.summary.uniqueMetaTitles, true);
  assert.equal(seoAudit.summary.uniqueMetaDescriptions, true);
  assert.equal(seoAudit.summary.svgDownloadCopyAbsent, true);
  assert.equal(seoAudit.summary.onlineColoringPromiseAbsent, true);
  assert.equal(internalAudit.summary.passed, true);
  assert.equal(internalAudit.summary.moreMenuFindsNewHubs, true);
  assert.equal(internalAudit.summary.noBacklogManualReviewLinks, true);
  assert.equal(browserQa.summary.status, "completed");
  assert.equal(browserQa.summary.browserQaPassed, true);
  assert.equal(browserQa.summary.svgDownloadAbsent, true);
  assert.equal(sampledUrls.summary.status, "completed");
  assert.equal(sampledUrls.summary.sampledUrlCheckPassed, true);
  assert.equal(sampledUrls.summary.recordsChecked >= 150, true);
  assert.equal(sampledUrls.summary.noR2Dev, true);
  assert.equal(sampledUrls.summary.noLocalhost, true);
  assert.equal(sampledUrls.summary.noPngSubstitute, true);
  assert.equal(gate.summary.promoted_hub_count, 66);
  assert.equal(gate.summary.ready_for_image_sitemap_round, true);
  assert.equal(gate.summary.ready_for_og_image_round, true);
  assert.equal(gate.summary.ready_for_jsonld_round, true);
  assert.equal(gate.summary.ready_for_live_ads_round, false);
  assert.deepEqual(gate.summary.blockers, []);
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }

  const rootStat = await stat(root);
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root).replace(/\\/g, "/")];

  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results.map((file) => file.replace(/\\/g, "/"));
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/runtime-available-items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
