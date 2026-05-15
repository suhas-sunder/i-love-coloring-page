import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const EXPECTED_RUNTIME_HUBS = 163;
const EXPECTED_IMAGE_SITEMAP_ENTRIES = 6352;

const manifests = [
  "pipeline/manifests/final-seo-local-acceptance-context-check.json",
  "pipeline/manifests/final-seo-local-acceptance-working-tree-audit.json",
  "pipeline/manifests/final-seo-local-static-export-results.json",
  "pipeline/manifests/final-seo-content-acceptance-results.json",
  "pipeline/manifests/final-seo-local-browser-qa-results.json",
  "pipeline/manifests/final-seo-local-print-qa-results.json",
  "pipeline/manifests/final-seo-regression-results.json",
  "pipeline/manifests/final-seo-local-trust-content-review.json",
  "pipeline/manifests/final-seo-local-ad-placeholder-qa.json",
  "pipeline/manifests/final-seo-local-acceptance-gate.json",
];

const reports = [
  "pipeline/reports/final-seo-local-acceptance-context-check.md",
  "pipeline/reports/final-seo-local-acceptance-working-tree-audit.md",
  "pipeline/reports/final-seo-local-static-export-report.md",
  "pipeline/reports/final-seo-content-acceptance-report.md",
  "pipeline/reports/final-seo-local-browser-qa-report.md",
  "pipeline/reports/final-seo-local-print-qa-report.md",
  "pipeline/reports/final-seo-regression-report.md",
  "pipeline/reports/final-seo-local-trust-content-review.md",
  "pipeline/reports/final-seo-local-ad-placeholder-qa.md",
  "pipeline/reports/final-seo-local-acceptance-gate.md",
];

test("final SEO local manifests and reports exist and parse", () => {
  for (const relativePath of manifests) {
    assert.ok(exists(relativePath), `${relativePath} missing`);
    assert.doesNotThrow(() => readJson(relativePath), `${relativePath} should parse`);
  }
  for (const relativePath of reports) {
    assert.ok(exists(relativePath), `${relativePath} missing`);
    assert.ok(readText(relativePath).trim().length > 20, `${relativePath} should not be empty`);
  }
});

test("final acceptance gate passes and keeps live ads deferred", () => {
  const gate = readJson("pipeline/manifests/final-seo-local-acceptance-gate.json");
  assert.equal(gate.summary.static_export_passed, true);
  assert.equal(gate.summary.content_quality_passed, true);
  assert.equal(gate.summary.browser_qa_passed, true);
  assert.equal(gate.summary.print_pdf_passed, true);
  assert.equal(gate.summary.seo_assets_passed, true);
  assert.equal(gate.summary.trust_content_passed, true);
  assert.equal(gate.summary.ad_placeholders_passed, true);
  assert.equal(gate.summary.compact_side_rails_passed, true);
  assert.equal(gate.summary.no_app_api, true);
  assert.equal(gate.summary.no_svg_download, true);
  assert.equal(gate.summary.no_horizontal_overflow, true);
  assert.equal(gate.summary.ready_for_netlify_deployment, true);
  assert.equal(gate.summary.ready_for_gsc_submission_after_live_deploy, true);
  assert.equal(gate.summary.ready_for_live_ads_round, false);
  assert.deepEqual(gate.summary.blockers, []);
});

test("hub content quality remains complete and claim-safe", () => {
  const quality = readJson("src/generated/coloring/hub-content-quality.json");
  const content = readJson("pipeline/manifests/final-seo-content-acceptance-results.json");
  const runtimeHubs = readJson("src/generated/coloring/runtime-hubs.json");
  const visibleContent = JSON.stringify(quality);

  assert.equal(runtimeHubs.hubs.length, EXPECTED_RUNTIME_HUBS);
  assert.equal(quality.hubs.length, EXPECTED_RUNTIME_HUBS);
  assert.equal(content.summary.all_163_hubs_have_generated_content, true);
  assert.equal(content.summary.duplicate_intros, 0);
  assert.equal(content.summary.svg_download_claims, 0);
  assert.equal(content.summary.online_coloring_claims, 0);
  assert.equal(content.summary.unsupported_claims, 0);
  assert.equal(content.summary.keyword_stuffing_risk, 0);
  assert.equal(content.summary.fake_commercial_use_claims, 0);
  assert.equal(content.summary.fake_ratings_reviews_claims, 0);
  assert.equal(content.summary.fake_author_expert_claims, 0);
  assert.doesNotMatch(visibleContent, /Download SVG|SVG download|online coloring|color online|commercial use|royalty-free|five stars|expert author/i);
});

test("browser, print, sitemap, image sitemap, OG, and JSON-LD checks remain intact", () => {
  const browser = readJson("pipeline/manifests/final-seo-local-browser-qa-results.json");
  const print = readJson("pipeline/manifests/final-seo-local-print-qa-results.json");
  const seo = readJson("pipeline/manifests/final-seo-regression-results.json");
  const imageSitemap = readText("public/image-sitemap.xml");

  assert.equal(browser.summary.browserQaPassed, true);
  assert.equal(browser.summary.compactSideRailsVisible, true);
  assert.equal(browser.summary.noHorizontalOverflow, true);
  assert.equal(print.summary.printQaPassed, true);
  assert.equal(print.summary.allGeneratedPdfsOnePage, true);
  assert.equal(print.summary.brandingIntegratedIntoFrame, true);
  assert.equal(print.summary.brandingDoesNotOverlapArtwork, true);
  assert.equal(seo.summary.seo_assets_passed, true);
  assert.ok(seo.sitemapLocCount >= EXPECTED_RUNTIME_HUBS);
  assert.equal(seo.imageSitemapWebpEntries, EXPECTED_IMAGE_SITEMAP_ENTRIES);
  assert.equal((imageSitemap.match(/<image:loc>[^<]+\.webp<\/image:loc>/g) || []).length, EXPECTED_IMAGE_SITEMAP_ENTRIES);
  assert.doesNotMatch(imageSitemap, /\.svg<\/image:loc>|\.png<\/image:loc>|\/thumbs\//i);
  assert.ok(countTrackedFiles("public/og", /\.jpg$/i) >= EXPECTED_RUNTIME_HUBS);
  assert.equal(exists("pipeline/manifests/jsonld-route-data.json"), true);
});

test("static export, downloads, app boundaries, and protected paths remain clean", async () => {
  const nextConfig = readText("next.config.mjs");
  const source = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const downloadSurface = [
    readText("src/components/coloring/DownloadMenu.tsx"),
    readText("src/components/coloring/ImageCard.tsx"),
    readText("src/lib/coloring/browserDownloads.ts"),
  ].join("\n");
  const publicFiles = await listFiles("public");

  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.equal(exists("app/api"), false);
  assert.equal(exists("app/sitemap/page.tsx"), true);
  assert.match(readText("app/sitemap.ts"), /path:\s*["']\/sitemap["']/);
  assert.doesNotMatch(downloadSurface, /Download SVG|downloadSvg\b|svgDownload/i);
  assert.match(downloadSurface, /Download PNG/);
  assert.match(downloadSurface, /Download JPG/);
  assert.match(downloadSurface, /Download WebP/);
  assert.doesNotMatch(source, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client|data-ad-client/i);
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

function exists(relativePath) {
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

function isDisallowedPublicMedia(file) {
  if (!/\.(?:svg|png|jpe?g|webp|gif|xml|ico)$/i.test(file)) return false;
  if (file === "public/image-sitemap.xml") return false;
  if (file === "public/favicon.ico") return false;
  if (file === "public/icon.svg") return false;
  if (/^public\/og\/.+\.jpg$/i.test(file)) return false;
  return true;
}
