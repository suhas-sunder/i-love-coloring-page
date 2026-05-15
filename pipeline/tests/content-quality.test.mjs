import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const EXPECTED_RUNTIME_HUBS = 163;
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_IMAGE_SITEMAP_ENTRIES = 6352;

const requiredManifests = [
  "pipeline/manifests/content-quality-context-check.json",
  "pipeline/manifests/content-quality-current-audit.json",
  "pipeline/manifests/content-quality-template-strategy.json",
  "pipeline/manifests/content-quality-generated-data.json",
  "pipeline/manifests/content-quality-layout-results.json",
  "pipeline/manifests/content-quality-score-results.json",
  "pipeline/manifests/content-quality-metadata-results.json",
  "pipeline/manifests/content-quality-jsonld-regression.json",
  "pipeline/manifests/content-quality-browser-qa-results.json",
  "pipeline/manifests/content-quality-static-seo-results.json",
  "pipeline/manifests/content-quality-adsense-readiness.json",
  "pipeline/manifests/content-quality-acceptance-gate.json",
];

const requiredReports = [
  "pipeline/reports/content-quality-context-check.md",
  "pipeline/reports/content-quality-current-audit.md",
  "pipeline/reports/content-quality-template-strategy.md",
  "pipeline/reports/content-quality-generated-data-report.md",
  "pipeline/reports/content-quality-layout-report.md",
  "pipeline/reports/content-quality-score-report.md",
  "pipeline/reports/content-quality-metadata-report.md",
  "pipeline/reports/content-quality-jsonld-regression-report.md",
  "pipeline/reports/content-quality-browser-qa-report.md",
  "pipeline/reports/content-quality-static-seo-report.md",
  "pipeline/reports/content-quality-adsense-readiness-report.md",
  "pipeline/reports/content-quality-acceptance-gate.md",
];

test("content quality manifests and reports exist and parse", () => {
  for (const relativePath of requiredManifests) {
    assert.ok(pathExists(relativePath), `${relativePath} should exist`);
    assert.doesNotThrow(() => readJson(relativePath), `${relativePath} should parse`);
  }
  for (const relativePath of requiredReports) {
    assert.ok(pathExists(relativePath), `${relativePath} should exist`);
    assert.ok(readText(relativePath).trim().length > 40, `${relativePath} should not be empty`);
  }
});

test("all runtime hubs have useful unique content without unsupported claims", () => {
  const runtimeHubs = readJson("src/generated/coloring/runtime-hubs.json");
  const runtimeItems = readJson("src/generated/coloring/runtime-available-items.json");
  const quality = readJson("src/generated/coloring/hub-content-quality.json");
  const generated = readJson("pipeline/manifests/content-quality-generated-data.json");
  const score = readJson("pipeline/manifests/content-quality-score-results.json");

  assert.equal(runtimeItems.items.length, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(runtimeHubs.hubs.length, EXPECTED_RUNTIME_HUBS);
  assert.equal(quality.hubs.length, EXPECTED_RUNTIME_HUBS);
  assert.equal(generated.summary.allPublicHubsHaveQualityRecords, true);
  assert.equal(generated.summary.duplicateIntroCount, 0);
  assert.equal(generated.summary.unsupportedClaimCount, 0);
  assert.equal(generated.summary.svgDownloadClaims, 0);
  assert.equal(generated.summary.onlineColoringClaims, 0);
  assert.equal(score.summary.contentQualityPassed, true);
  assert.equal(score.summary.duplicateIntroCount, 0);
  assert.equal(score.summary.nearDuplicateFrameCount, 0);
  assert.equal(score.summary.highRiskHubCount, 0);
  assert.equal(score.summary.unsupportedClaimCount, 0);
  assert.equal(score.summary.fillerPhraseCount, 0);
  assert.equal(score.summary.keywordStuffingRiskCount, 0);

  const visibleContent = quality.hubs.map((hub) => JSON.stringify(hub.content)).join("\n");
  assert.doesNotMatch(visibleContent, /Download SVG|SVG download|online coloring|commercial use|royalty-free|license included|runtime examples|actual runtime pages/i);
});

test("layout, metadata, JSON-LD, browser QA, static SEO, and AdSense readiness pass", () => {
  const layout = readJson("pipeline/manifests/content-quality-layout-results.json");
  const metadata = readJson("pipeline/manifests/content-quality-metadata-results.json");
  const jsonld = readJson("pipeline/manifests/content-quality-jsonld-regression.json");
  const browser = readJson("pipeline/manifests/content-quality-browser-qa-results.json");
  const staticSeo = readJson("pipeline/manifests/content-quality-static-seo-results.json");
  const adsense = readJson("pipeline/manifests/content-quality-adsense-readiness.json");
  const gate = readJson("pipeline/manifests/content-quality-acceptance-gate.json");

  assert.equal(layout.summary.galleryFirstPlacement, true);
  assert.equal(layout.summary.adPlacementUnchanged, true);
  assert.equal(metadata.summary.descriptionsUnique, true);
  assert.equal(metadata.summary.noSvgClaims, true);
  assert.equal(metadata.summary.noOnlineColoringClaims, true);
  assert.equal(metadata.summary.noCommercialUseClaims, true);
  assert.equal(jsonld.summary.collectionPagePresent, true);
  assert.equal(jsonld.summary.breadcrumbListPresent, true);
  assert.equal(jsonld.summary.noFaqSchema, true);
  assert.equal(jsonld.summary.noSvgUrls, true);
  assert.equal(browser.summary.browserQaPassed, true);
  assert.equal(browser.summary.galleryStillAppearsEarly, true);
  assert.equal(browser.summary.compactSideRailsVisible, true);
  assert.equal(browser.summary.adPlacementUnchanged, true);
  assert.equal(staticSeo.summary.staticSeoPassed, true);
  assert.equal(staticSeo.summary.imageSitemapWebpEntries, EXPECTED_IMAGE_SITEMAP_ENTRIES);
  assert.equal(adsense.summary.uniqueRelevantContentImproved, true);
  assert.equal(adsense.summary.liveAdsStillDeferred, true);
  assert.equal(adsense.summary.approvalGuaranteed, false);
  assert.equal(gate.summary.ready_for_final_local_acceptance_rerun, true);
  assert.equal(gate.summary.ready_for_netlify_deployment, true);
  assert.equal(gate.summary.ready_for_live_ads_round, false);
  assert.deepEqual(gate.summary.blockers, []);
});

test("static export, sitemap, image sitemap, OG, JSON-LD, and download surface remain intact", async () => {
  const nextConfig = readText("next.config.mjs");
  const imageSitemap = readText("public/image-sitemap.xml");
  const source = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const downloadSurface = [
    readText("src/components/coloring/DownloadMenu.tsx"),
    readText("src/components/coloring/ImageCard.tsx"),
    readText("src/lib/coloring/browserDownloads.ts"),
  ].join("\n");

  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.equal(pathExists("app/api"), false);
  assert.equal(pathExists("app/sitemap/page.tsx"), true);
  assert.equal(pathExists("app/sitemap.ts"), true);
  assert.equal(pathExists("public/image-sitemap.xml"), true);
  assert.equal((imageSitemap.match(/<image:loc>[^<]+\.webp<\/image:loc>/g) || []).length, EXPECTED_IMAGE_SITEMAP_ENTRIES);
  assert.doesNotMatch(imageSitemap, /\/svg\/|\.svg(?:<|$)|\/png\/|\/thumbs\/|localhost|127\.0\.0\.1|r2\.dev/i);
  assert.ok(countTrackedFiles("public/og", /\.jpg$/i) > 0);
  assert.equal(pathExists("pipeline/manifests/jsonld-route-data.json"), true);
  assert.doesNotMatch(downloadSurface, /Download SVG|downloadSvg\b|svgDownload/i);
  assert.match(downloadSurface, /Download PNG/);
  assert.match(downloadSurface, /Download JPG/);
  assert.match(downloadSurface, /Download WebP/);
  assert.doesNotMatch(source, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client|data-ad-client/i);
});

test("protected source media and nested reference repo remain untouched", async () => {
  const publicFiles = await listFiles("public");
  assert.deepEqual(publicFiles.filter(isDisallowedPublicMedia), []);
  assert.equal(gitStatus("images"), "");
  assert.equal(gitStatus("ilovesvg"), "");
});

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function pathExists(relativePath) {
  return existsSync(path.join(repoRoot, relativePath));
}

function gitStatus(relativePath) {
  return execFileSync("git", ["status", "--short", "--", relativePath], { cwd: repoRoot, encoding: "utf8" }).trim();
}

function countTrackedFiles(relativeRoot, regex) {
  return execFileSync("git", ["ls-files", relativeRoot], { cwd: repoRoot, encoding: "utf8" })
    .split(/\r?\n/)
    .filter((file) => regex.test(file)).length;
}

async function listFiles(relativeRoot) {
  const root = path.join(repoRoot, relativeRoot);
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(repoRoot, absolute).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const root of relativeRoots) {
    for (const file of await listFiles(root)) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (options.skipGeneratedColoring && file.startsWith("src/generated/coloring/")) continue;
      chunks.push(readText(file));
    }
  }
  return chunks.join("\n");
}

function isDisallowedPublicMedia(file) {
  if (!/\.(?:svg|png|jpe?g|webp|gif|xml|ico)$/i.test(file)) return false;
  if (file === "public/image-sitemap.xml") return false;
  if (file === "public/favicon.ico") return false;
  if (file === "public/icon.svg") return false;
  if (/^public\/og\/.+\.jpg$/i.test(file)) return false;
  return true;
}
