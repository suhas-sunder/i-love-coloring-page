import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildImageSitemapXml } from "../scripts/build-image-sitemap-xml.mjs";

const ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const runtime = await readJson("src/generated/coloring/runtime-printables.json");
const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
const frozenRoutes = await readJson("pipeline/manifests/runtime-printable-route-manifest.json");
const data = await readJson("pipeline/manifests/image-sitemap-data.json");
const build = await readJson("pipeline/manifests/image-sitemap-build-results.json");
const validation = await readJson("pipeline/manifests/image-sitemap-xml-validation.json");
const xml = await readText("public/image-sitemap.xml");

test("image sitemap owns exactly one canonical printable page and WebP pair per runtime printable", () => {
  assert.equal(runtime.records.length, 6352);
  assert.equal(frozenRoutes.routes.length, 6352);
  assert.equal(data.imageEntries.length, 6352);
  assert.equal(data.summary.pageUrlCount, 6352);
  assert.equal(data.summary.imageEntryCount, 6352);
  assert.equal(data.summary.uniquePageUrlCount, 6352);
  assert.equal(data.summary.uniqueImageUrlCount, 6352);
  assert.equal(data.summary.invalidEntryCount, 0);
  assert.equal(deferred.records.some((entry) => runtime.records.some((record) => record.assetId === entry.assetId)), false);

  const frozenPathByAssetId = new Map(frozenRoutes.routes.map((entry) => [entry.assetId, entry.canonicalPath]));
  const runtimeByAssetId = new Map(runtime.records.map((entry) => [entry.assetId, entry]));
  for (const entry of data.imageEntries) {
    const record = runtimeByAssetId.get(entry.assetId);
    assert.ok(record, entry.assetId);
    assert.equal(entry.canonicalPath, frozenPathByAssetId.get(entry.assetId));
    assert.equal(entry.pageUrl, `${SITE_URL}${record.canonicalPath}`);
    assert.equal(entry.imageUrl, `${ASSET_BASE_URL}/${record.webpPath}`);
    assert.equal(entry.imageTitle, record.displayTitle.trim().replace(/\s+/g, " "));
    assert.match(entry.pageUrl, /^https:\/\/www\.ilovecoloringpage\.com\/printables\//);
    assert.match(entry.imageUrl, /^https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages\/webp\/.+\.webp$/);
    assert.doesNotMatch(`${entry.pageUrl}\n${entry.imageUrl}`, /localhost|127\.0\.0\.1|r2\.dev|cloudflarestorage|amazonaws|\/svg\/|\/png\/|\/thumbs\//i);
    assert.doesNotMatch(entry.imageTitle, /\.(?:svg|png|webp|jpe?g)$|coloring page\s+coloring page/i);
  }
});

test("generated XML is namespace-valid, escaped, WebP-only, and contains no unsupported fields", () => {
  const parsed = parseXmlEntries(xml);
  assert.equal(parsed.length, 6352);
  assert.equal((xml.match(/<image:image>/g) || []).length, 6352);
  assert.equal((xml.match(/<image:title>/g) || []).length, 6352);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1">/);
  assert.doesNotMatch(xml, /<image:(?:caption|geo_location|license)>|\/svg\/|\/png\/|\/thumbs\/|localhost|127\.0\.0\.1|r2\.dev|cloudflarestorage|amazonaws/i);
  assert.equal(new Set(parsed.map((entry) => entry.pageUrl)).size, 6352);
  assert.equal(new Set(parsed.map((entry) => entry.imageUrl)).size, 6352);

  const expectedByPage = new Map(data.imageEntries.map((entry) => [entry.pageUrl, entry]));
  for (const entry of parsed) {
    const expected = expectedByPage.get(entry.pageUrl);
    assert.ok(expected, entry.pageUrl);
    assert.equal(entry.imageUrl, expected.imageUrl);
    assert.equal(entry.imageTitle, expected.imageTitle);
  }
  assert.equal(validation.summary.xmlValidationPassed, true);
  assert.equal(build.summary.buildPassed, true);
});

test("the owning generator is deterministic without rewriting repository files during the test", async () => {
  const first = buildImageSitemapXml(data.imageEntries);
  const second = buildImageSitemapXml(data.imageEntries);
  const firstHash = sha256(first);
  const secondHash = sha256(second);
  assert.equal(firstHash, secondHash);
  assert.equal(firstHash, build.summary.xmlSha256);

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ilcp-image-sitemap-"));
  try {
    const firstPath = path.join(temporaryDirectory, "first.xml");
    const secondPath = path.join(temporaryDirectory, "second.xml");
    await Promise.all([writeFile(firstPath, first, "utf8"), writeFile(secondPath, second, "utf8")]);
    assert.equal(sha256(await readFile(firstPath, "utf8")), sha256(await readFile(secondPath, "utf8")));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("generator inputs, outputs, static-export ownership, and protected boundaries are explicit", async () => {
  assert.deepEqual(data.generator.inputs, [
    "src/generated/coloring/runtime-printables.json",
    "pipeline/manifests/runtime-printable-route-manifest.json",
    "src/generated/coloring/runtime-deferred-items.json",
  ]);
  assert.deepEqual(data.generator.outputs, [
    "pipeline/manifests/image-sitemap-data.json",
    "pipeline/reports/image-sitemap-data-report.md",
    "public/image-sitemap.xml",
  ]);
  const packageJson = await readJson("package.json");
  const nextConfig = await readText("next.config.mjs");
  const robots = await readText("app/robots.ts");
  assert.match(packageJson.scripts.build, /build-image-sitemap-data\.mjs.*build-image-sitemap-xml\.mjs/);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(robots, /image-sitemap\.xml/);
  assert.doesNotMatch(xml, /[A-Za-z]:\\|ilovesvg[\\/]|(?:^|[>\s])images[\\/]/i);
});

function parseXmlEntries(value) {
  return [...value.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => ({
    pageUrl: extract(match[1], "loc"),
    imageUrl: extract(match[1], "image:loc"),
    imageTitle: extract(match[1], "image:title"),
  }));
}

function extract(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return unescapeXml(match?.[1]?.trim() || "");
}

function unescapeXml(value) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}
