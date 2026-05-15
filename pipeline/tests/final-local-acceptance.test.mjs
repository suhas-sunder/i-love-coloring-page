import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const EXPECTED_RUNTIME_HUBS = 163;
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_IMAGE_SITEMAP_ENTRIES = 6352;
const EXPECTED_OG_JPG_COUNT = 165;

const requiredManifests = [
  "pipeline/manifests/final-local-acceptance-context-check.json",
  "pipeline/manifests/final-local-acceptance-working-tree-audit.json",
  "pipeline/manifests/final-local-static-export-results.json",
  "pipeline/manifests/final-local-acceptance-browser-qa-results.json",
  "pipeline/manifests/final-local-acceptance-print-qa-results.json",
  "pipeline/manifests/final-local-link-section-acceptance.json",
  "pipeline/manifests/final-local-seo-regression-results.json",
  "pipeline/manifests/final-local-trust-content-review.json",
  "pipeline/manifests/final-local-ad-placeholder-qa.json",
  "pipeline/manifests/final-local-acceptance-gate.json",
];

const requiredReports = [
  "pipeline/reports/final-local-acceptance-context-check.md",
  "pipeline/reports/final-local-acceptance-working-tree-audit.md",
  "pipeline/reports/final-local-static-export-report.md",
  "pipeline/reports/final-local-acceptance-browser-qa-report.md",
  "pipeline/reports/final-local-acceptance-print-qa-report.md",
  "pipeline/reports/final-local-link-section-acceptance.md",
  "pipeline/reports/final-local-seo-regression-report.md",
  "pipeline/reports/final-local-trust-content-review.md",
  "pipeline/reports/final-local-ad-placeholder-qa.md",
  "pipeline/reports/final-local-acceptance-gate.md",
];

test("final local acceptance manifests and reports exist and parse", () => {
  for (const relativePath of requiredManifests) {
    assert.ok(pathExists(relativePath), `${relativePath} should exist`);
    assert.doesNotThrow(() => readJson(relativePath), `${relativePath} should parse`);
  }

  for (const relativePath of requiredReports) {
    assert.ok(pathExists(relativePath), `${relativePath} should exist`);
    assert.ok(readText(relativePath).trim().length > 40, `${relativePath} should not be empty`);
  }
});

test("final acceptance gate passes local product blockers and keeps live ads deferred", () => {
  const gate = readJson("pipeline/manifests/final-local-acceptance-gate.json");

  assert.equal(gate.static_export_passed, true);
  assert.equal(gate.browser_qa_passed, true);
  assert.equal(gate.print_pdf_passed, true);
  assert.equal(gate.print_one_page_passed, true);
  assert.equal(gate.print_branding_safe, true);
  assert.equal(gate.navigation_hover_passed, true);
  assert.equal(gate.popular_collections_passed, true);
  assert.equal(gate.related_collections_passed, true);
  assert.equal(gate.more_menu_passed, true);
  assert.equal(gate.seo_assets_passed, true);
  assert.equal(gate.trust_content_passed, true);
  assert.equal(gate.ad_placeholders_passed, true);
  assert.equal(gate.no_app_api, true);
  assert.equal(gate.no_svg_download, true);
  assert.equal(gate.no_horizontal_overflow, true);
  assert.equal(gate.ready_for_netlify_deployment, true);
  assert.equal(gate.ready_for_gsc_submission_after_live_deploy, true);
  assert.equal(gate.ready_for_live_ads_round, false);
  assert.deepEqual(gate.blockers, []);
});

test("browser, print, SEO, trust, ad, and static export reports pass", () => {
  const browserQa = readJson("pipeline/manifests/final-local-acceptance-browser-qa-results.json");
  const printQa = readJson("pipeline/manifests/final-local-acceptance-print-qa-results.json");
  const seoQa = readJson("pipeline/manifests/final-local-seo-regression-results.json");
  const trust = readJson("pipeline/manifests/final-local-trust-content-review.json");
  const ad = readJson("pipeline/manifests/final-local-ad-placeholder-qa.json");
  const staticExport = readJson("pipeline/manifests/final-local-static-export-results.json");
  const links = readJson("pipeline/manifests/final-local-link-section-acceptance.json");

  assert.equal(staticExport.summary.staticExportPassed, true);
  assert.equal(browserQa.summary.browserQaPassed, true);
  assert.equal(browserQa.summary.headerNavHoverFocusPassed, true);
  assert.equal(browserQa.summary.imageClickOpensPreviewModal, true);
  assert.equal(browserQa.summary.modalPreviewNotCropped, true);
  assert.equal(browserQa.summary.downloadsPassed, true);
  assert.equal(browserQa.summary.noHorizontalOverflow, true);
  assert.equal(printQa.summary.printQaPassed, true);
  assert.equal(printQa.summary.allGeneratedPdfsExist, true);
  assert.equal(printQa.summary.allGeneratedPdfsOnePage, true);
  assert.equal(printQa.summary.brandingDoesNotOverlapArtwork, true);
  assert.equal(seoQa.summary.seoRegressionPassed, true);
  assert.equal(seoQa.summary.runtimeSitemapRouteCount, EXPECTED_RUNTIME_HUBS);
  assert.equal(seoQa.summary.imageSitemapWebpEntries, EXPECTED_IMAGE_SITEMAP_ENTRIES);
  assert.equal(trust.summary.trustContentPassed, true);
  assert.equal(ad.summary.adPlaceholderQaPassed, true);
  assert.equal(links.summary.linkSectionAcceptancePassed, true);
});

test("static export, sitemap, image sitemap, OG images, and JSON-LD remain synchronized", () => {
  const packageJson = readJson("package.json");
  const nextConfig = readText("next.config.mjs");
  const runtimeItems = readJson("src/generated/coloring/runtime-available-items.json");
  const runtimeHubs = readJson("src/generated/coloring/runtime-hubs.json");
  const runtimeSiteMap = readJson("src/generated/coloring/runtime-site-map.json");
  const imageSitemap = readText("public/image-sitemap.xml");
  const jsonLdData = readJson("pipeline/manifests/jsonld-route-data.json");

  assert.equal(packageJson.name, "i-love-coloring-page");
  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.equal(pathExists("app/api"), false);
  assert.equal(runtimeItems.items.length, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(runtimeHubs.hubs.length, EXPECTED_RUNTIME_HUBS);
  assert.equal(runtimeSiteMap.entries.length, EXPECTED_RUNTIME_HUBS);
  assert.equal((imageSitemap.match(/<image:loc>/g) || []).length, EXPECTED_IMAGE_SITEMAP_ENTRIES);
  assert.doesNotMatch(imageSitemap, /\/svg\/|\.svg(?:<|$)|\/png\/|\/thumbs\/|localhost|127\.0\.0\.1|r2\.dev/i);
  assert.equal(countFiles("public/og", /\.jpg$/i), EXPECTED_OG_JPG_COUNT);
  assert.equal(jsonLdData.summary.hubPagesWithJsonLd, EXPECTED_RUNTIME_HUBS);
  assert.ok(jsonLdData.routes.some((route) => route.path === "/privacy"));
});

test("SVG download remains absent while PNG/JPG/WebP controls remain available", () => {
  const browserDownloads = readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = readText("src/components/coloring/DownloadMenu.tsx");
  const imageCard = readText("src/components/coloring/ImageCard.tsx");

  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}\n${imageCard}`, /Download SVG|downloadSvg\b|svgDownload/i);
  assert.match(downloadMenu, /Download PNG/);
  assert.match(downloadMenu, /Download JPG/);
  assert.match(downloadMenu, /Download WebP/);
});

test("live AdSense, app/api, public media drift, and protected source drift remain absent", async () => {
  const appSource = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const publicFiles = await listFiles("public");

  assert.equal(pathExists("app/api"), false);
  assert.doesNotMatch(appSource, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|data-ad-client|google_ad_client/i);
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

function countFiles(relativeRoot, regex) {
  return execFileSync("git", ["ls-files", relativeRoot], { cwd: repoRoot, encoding: "utf8" })
    .split(/\r?\n/)
    .filter((file) => regex.test(file)).length;
}

function gitStatus(relativePath) {
  return execFileSync("git", ["status", "--short", "--", relativePath], { cwd: repoRoot, encoding: "utf8" }).trim();
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
