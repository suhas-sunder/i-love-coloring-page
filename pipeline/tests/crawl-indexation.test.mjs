import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const printables = await readJson("src/generated/coloring/runtime-printables.json");
const frozenRoutes = await readJson("pipeline/manifests/runtime-printable-route-manifest.json");
const routeIndex = await readJson("src/generated/coloring/runtime-printable-route-index.json");
const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
const publicRoutes = await readJson("src/generated/coloring/runtime-routes.json");
const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
const trustSource = await readText("src/lib/trust/trustPages.ts");
const trustCount = (trustSource.match(/indexable:\s*true/g) || []).length;
const paginationCount = hubs.hubs
  .filter((hub) => hub.route !== "/coloring-pages" && hub.indexable && hub.sitemap)
  .reduce((total, hub) => total + Math.max(0, Math.ceil(hub.assetIds.length / hub.galleryPageSize) - 1), 0);
const expectedRegularSitemapCount = 1 + publicRoutes.routes.filter((route) => route.indexable && route.sitemap).length + printables.records.length + trustCount + 1;

test("authoritative crawl inventory counts are complete, collision-free, and below warning thresholds", async () => {
  assert.equal(printables.records.length, 6352);
  assert.equal(printables.summary.deferredRecordCount, 0);
  assert.equal(frozenRoutes.routes.length, 6352);
  assert.equal(routeIndex.summary.entryCount, 6352);
  assert.equal(Object.keys(routeIndex.index).length, 6352);
  assert.equal(hubs.hubs.length, 163);
  assert.equal(publicRoutes.routes.length, 163);
  assert.equal(paginationCount, 389);
  assert.equal(trustCount, 6);
  assert.equal(expectedRegularSitemapCount, 6521);
  assert.equal(expectedRegularSitemapCount < 45_000, true);

  const printablePaths = printables.records.map((record) => record.canonicalPath);
  const frozenPaths = frozenRoutes.routes.map((route) => route.canonicalPath);
  assert.equal(new Set(printablePaths).size, 6352);
  assert.deepEqual(printablePaths, frozenPaths);
  assert.equal(deferred.records.some((entry) => printables.records.some((record) => record.assetId === entry.assetId)), false);

  const inventory = await readText("src/lib/seo/routeInventory.ts");
  assert.match(inventory, /import "server-only"/);
  assert.match(inventory, /getPrintablePath\(printable\)/);
  assert.match(inventory, /getRegularSitemapRoutes/);
  assert.match(inventory, /REGULAR_SITEMAP_SAFE_URL_LIMIT = 45_000/);
  assert.match(inventory, /REGULAR_SITEMAP_SAFE_BYTE_LIMIT = 45 \* 1024 \* 1024/);
  for (const family of ["homepage", "main-gallery", "public-hub", "paginated-hub", "canonical-printable", "trust-page", "html-sitemap", "metadata-route"]) {
    assert.match(inventory, new RegExp(`"${family}"`));
  }

  const validator = await readText("pipeline/scripts/validate-crawl-indexation.mjs");
  assert.match(validator, /generatedAt: frozen\.generatedAt/);
  assert.doesNotMatch(validator, /new Date/);
});

test("regular sitemap consumes only the central inventory and omits invented freshness signals", async () => {
  const sitemap = await readText("app/sitemap.ts");
  assert.match(sitemap, /getRegularSitemapRoutes\(\)/);
  assert.match(sitemap, /getCanonicalUrl\(entry\.path\)/);
  assert.doesNotMatch(sitemap, /runtime-printables|runtime-routes|new Date|lastModified|changeFrequency|priority|sitemaps\.xml/);
  assert.doesNotMatch(sitemap, /localhost|127\.0\.0\.1|r2\.dev|cloudflarestorage|amazonaws/i);
});

test("valid pagination stays static, self-canonical, linked, indexable, and outside the XML sitemap", async () => {
  assert.equal(paginationCount, 389);
  const page = await readText("app/coloring-pages/[hubSlug]/page/[page]/page.tsx");
  const pagination = await readText("src/components/coloring/Pagination.tsx");
  const inventory = await readText("src/lib/seo/routeInventory.ts");
  assert.match(page, /dynamicParams = false/);
  assert.match(page, /canonicalPath: path/);
  assert.match(page, /getStaticHubPageParams\(\)/);
  assert.match(pagination, />\s*Previous\s*</);
  assert.match(pagination, />\s*Next\s*</);
  assert.match(inventory, /"paginated-hub", true, false/);
  assert.doesNotMatch(page, /noindex|robots:\s*\{\s*index:\s*false|rel=["'](?:next|prev)/i);
});

test("utility states and rejected route families remain non-indexable or nonexistent", async () => {
  const inventory = await readText("src/lib/seo/routeInventory.ts");
  for (const state of ["search", "filter", "sort", "modal", "preview", "print", "download", "raw-webp", "raw-svg", "deferred-printable", "backlog-hub", "section-only-topic", "rejected-hub", "alternate-printable-category", "alternate-printable-slug", "malformed-printable-route", "internal-next-artifact"]) {
    assert.match(inventory, new RegExp(`"${state}"`));
  }
  assert.equal(existsSync(path.join(ROOT, "app", "api")), false);
  assert.equal(existsSync(path.join(ROOT, "app", "search")), false);
  assert.equal(existsSync(path.join(ROOT, "app", "download")), false);
  assert.equal(existsSync(path.join(ROOT, "app", "print")), false);
});

test("robots allows public HTML and assets and references both canonical production sitemaps", async () => {
  const robots = await readText("app/robots.ts");
  assert.match(robots, /allow:\s*"\/"/);
  assert.match(robots, /getCanonicalUrl\("\/sitemap\.xml"\)/);
  assert.match(robots, /getCanonicalUrl\("\/image-sitemap\.xml"\)/);
  assert.doesNotMatch(robots, /disallow|crawlDelay|crawl-delay|localhost|127\.0\.0\.1|r2\.dev|cloudflarestorage|amazonaws/i);
});

test("metadata, JSON-LD, and internal links consume frozen printable paths", async () => {
  const metadata = await readText("src/lib/coloring/printableMetadata.ts");
  const printableJsonLd = await readText("src/lib/seo/printableJsonLd.ts");
  const jsonLd = await readText("src/lib/seo/jsonLd.ts");
  const pageJsonLd = await readText("src/lib/seo/pageJsonLd.ts");
  const data = await readText("src/lib/coloring/data.ts");
  const card = await readText("src/components/coloring/ImageCard.tsx");
  assert.match(metadata, /getPrintablePath\(printable\)/);
  assert.match(printableJsonLd, /getPrintablePath\(printable\)/);
  assert.match(jsonLd, /contentUrl: options\.url/);
  assert.match(pageJsonLd, /getPrintablePath\(item\)/);
  assert.match(data, /canonicalPath: printable\.canonicalPath/);
  assert.match(data, /getPrintablePath\(item\)/);
  assert.match(card, /href=\{itemHref\}/);
  for (const source of [metadata, printableJsonLd, pageJsonLd, data, card]) {
    assert.doesNotMatch(source, /#image-|#asset-/);
  }
});

test("the human sitemap stays grouped and does not become a printable route dump", async () => {
  const htmlSitemap = await readText("app/sitemap/page.tsx");
  assert.match(htmlSitemap, /sitemapHubGroups/);
  assert.match(htmlSitemap, /trustPages/);
  assert.match(htmlSitemap, /href:\s*"\/coloring-pages"/);
  assert.doesNotMatch(htmlSitemap, /runtime-printables|canonical-printable|\/printables\//);
});

test("production origins and canonical path shapes are safe across the complete frozen inventory", () => {
  for (const record of printables.records) {
    const canonical = `${SITE_URL}${record.canonicalPath}`;
    assert.match(record.canonicalPath, /^\/printables\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{10}$/);
    assert.doesNotMatch(canonical, /[?#]|localhost|127\.0\.0\.1|r2\.dev|cloudflarestorage|amazonaws|coloring-pages\/coloring-pages/i);
  }
});

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}
