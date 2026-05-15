import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const EXPECTED_IMAGE_SITEMAP_ENTRIES = 6352;
const EXPECTED_RUNTIME_HUBS = 163;

const requiredManifests = [
  "pipeline/manifests/final-sitemap-related-context-check.json",
  "pipeline/manifests/final-related-collections-fix.json",
  "pipeline/manifests/final-more-ways-audit.json",
  "pipeline/manifests/final-html-sitemap-results.json",
  "pipeline/manifests/final-sitemap-local-check-results.json",
  "pipeline/manifests/final-html-sitemap-metadata-results.json",
  "pipeline/manifests/final-sitemap-related-browser-qa-results.json",
];

const requiredReports = [
  "pipeline/reports/final-sitemap-related-context-check.md",
  "pipeline/reports/final-related-collections-fix-report.md",
  "pipeline/reports/final-more-ways-audit-report.md",
  "pipeline/reports/final-html-sitemap-report.md",
  "pipeline/reports/final-sitemap-local-check-report.md",
  "pipeline/reports/final-html-sitemap-metadata-report.md",
  "pipeline/reports/final-sitemap-related-browser-qa-report.md",
];

test("final sitemap and related collections manifests parse", () => {
  for (const relativePath of requiredManifests) {
    assert.ok(pathExists(relativePath), `${relativePath} should exist`);
    assert.doesNotThrow(() => readJson(relativePath), `${relativePath} should parse`);
  }

  for (const relativePath of requiredReports) {
    assert.ok(pathExists(relativePath), `${relativePath} should exist`);
    assert.ok(readText(relativePath).trim().length > 40, `${relativePath} should not be empty`);
  }
});

test("Related Collections uses an aligned list layout instead of cramped pills", () => {
  const css = readText("src/styles/components.css");
  const seoSection = readText("src/components/coloring/SeoContentSection.tsx");
  const relatedSection = readText("src/components/coloring/RelatedHubs.tsx");
  const relatedFix = readJson("pipeline/manifests/final-related-collections-fix.json");

  assert.match(seoSection, /seo-related-link-label/);
  assert.match(seoSection, /seo-related-link-count/);
  assert.match(relatedSection, /related-link-label/);
  assert.match(relatedSection, /related-link-count/);
  assert.match(cssBlock(css, ".seo-related-link-list"), /display:\s*grid/);
  assert.doesNotMatch(cssBlock(css, ".seo-related-link-list"), /display:\s*flex/);
  assert.match(cssBlock(css, ".seo-related-link"), /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content/);
  assert.doesNotMatch(cssBlock(css, ".seo-related-link"), /radius-pill|inline-flex/);
  assert.match(cssBlock(css, ".seo-related-link-count"), /text-align:\s*right/);
  assert.match(cssBlock(css, ".related-link-count"), /text-align:\s*right/);
  assert.doesNotMatch(cssBlock(css, ".seo-related-link-label"), /text-overflow:\s*ellipsis|white-space:\s*nowrap/);
  assert.doesNotMatch(cssBlock(css, ".related-link-label"), /text-overflow:\s*ellipsis|white-space:\s*nowrap/);
  assert.equal(relatedFix.summary.relatedCollectionsPassed, true);
  assert.equal(relatedFix.summary.noCrampedPillDump, true);
  assert.equal(relatedFix.summary.countsAlignedSeparately, true);
});

test("HTML sitemap page exists, has metadata, and footer access", () => {
  const page = readText("app/sitemap/page.tsx");
  const footer = readText("src/components/site/SiteFooter.tsx");
  const appSitemap = readText("app/sitemap.ts");
  const htmlSitemap = readJson("pipeline/manifests/final-html-sitemap-results.json");
  const metadata = readJson("pipeline/manifests/final-html-sitemap-metadata-results.json");

  assert.match(page, /export const metadata/);
  assert.match(page, /getCanonicalUrl\(["']\/sitemap["']\)/);
  assert.match(page, /JsonLdScript/);
  assert.match(page, /Main pages/);
  assert.ok(htmlSitemap.groups.includes("More Collections"), "HTML sitemap should include the More Collections group");
  assert.match(footer, /href=["']\/sitemap["']/);
  assert.match(appSitemap, /path:\s*["']\/sitemap["']/);
  assert.equal(htmlSitemap.summary.routePath, "/sitemap");
  assert.equal(htmlSitemap.summary.publicHubRoutesIncluded, EXPECTED_RUNTIME_HUBS);
  assert.equal(htmlSitemap.summary.noPerImageRoutes, true);
  assert.equal(htmlSitemap.summary.noManualReviewBacklogRejectedRoutes, true);
  assert.equal(metadata.summary.titlePresent, true);
  assert.equal(metadata.summary.descriptionPresent, true);
  assert.equal(metadata.summary.canonicalUsesWww, true);
});

test("XML sitemap, image sitemap, and robots remain synchronized", () => {
  const sitemapCheck = readJson("pipeline/manifests/final-sitemap-local-check-results.json");
  const imageSitemap = readText("public/image-sitemap.xml");

  assert.equal(sitemapCheck.summary.sitemapXmlExistsInOut, true);
  assert.equal(sitemapCheck.summary.imageSitemapXmlExistsInOut, true);
  assert.equal(sitemapCheck.summary.robotsTxtExistsInOut, true);
  assert.equal(sitemapCheck.summary.robotsReferencesRegularSitemap, true);
  assert.equal(sitemapCheck.summary.robotsReferencesImageSitemap, true);
  assert.equal(sitemapCheck.summary.sitemapIncludesHtmlSitemap, true);
  assert.equal(sitemapCheck.summary.sitemapIncludesPublicHubRoutes, true);
  assert.equal(sitemapCheck.summary.noPerImageRoutes, true);
  assert.equal(sitemapCheck.summary.noManualReviewBacklogRoutes, true);
  assert.equal(sitemapCheck.summary.imageSitemapWebpEntries, EXPECTED_IMAGE_SITEMAP_ENTRIES);
  assert.equal(sitemapCheck.summary.imageSitemapExcludesSvgPngThumbs, true);
  assert.equal(sitemapCheck.summary.noLocalhostOrR2Dev, true);
  assert.equal((imageSitemap.match(/<image:loc>/g) || []).length, EXPECTED_IMAGE_SITEMAP_ENTRIES);
  assert.doesNotMatch(imageSitemap, /\/svg\/|\.svg(?:<|$)|\/png\/|\/thumbs\//i);
});

test("browser QA accepts the related link UI and sitemap page", () => {
  const browserQa = readJson("pipeline/manifests/final-sitemap-related-browser-qa-results.json");

  assert.equal(browserQa.summary.browserQaPassed, true);
  assert.equal(browserQa.summary.relatedCollectionsNoPillDump, true);
  assert.equal(browserQa.summary.relatedCountsAligned, true);
  assert.equal(browserQa.summary.moreWaysRemovedOrDistinct, true);
  assert.equal(browserQa.summary.htmlSitemapRendersCleanly, true);
  assert.equal(browserQa.summary.htmlSitemapGroupSpacingPassed, true);
  assert.equal(browserQa.summary.htmlSitemapLinksWork, true);
  assert.equal(browserQa.summary.footerSitemapLinkWorks, true);
  assert.equal(browserQa.summary.noHorizontalOverflow, true);
  assert.equal(browserQa.summary.svgDownloadAbsent, true);
  assert.equal(browserQa.summary.downloadsStillAvailable, true);
});

test("static export, SVG download, public media, and protected source boundaries remain intact", async () => {
  const packageJson = readJson("package.json");
  const nextConfig = readText("next.config.mjs");
  const runtimeHubs = readJson("src/generated/coloring/runtime-hubs.json");
  const downloadMenu = readText("src/components/coloring/DownloadMenu.tsx");
  const imageCard = readText("src/components/coloring/ImageCard.tsx");
  const browserDownloads = readText("src/lib/coloring/browserDownloads.ts");
  const appSource = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const publicFiles = await listFiles("public");

  assert.equal(packageJson.name, "i-love-coloring-page");
  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.equal(pathExists("app/api"), false);
  assert.equal(runtimeHubs.hubs.length, EXPECTED_RUNTIME_HUBS);
  assert.match(downloadMenu, /Download PNG/);
  assert.match(downloadMenu, /Download JPG/);
  assert.match(downloadMenu, /Download WebP/);
  assert.doesNotMatch(`${downloadMenu}\n${imageCard}\n${browserDownloads}`, /Download SVG|downloadSvg\b|svgDownload/i);
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

function cssBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
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
