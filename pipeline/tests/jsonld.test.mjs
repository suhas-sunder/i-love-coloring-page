import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const runtimeAvailable = await readJson("src/generated/coloring/runtime-available-items.json");
const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
const ogImages = await readJson("src/generated/coloring/og-images.json");
const trustPageSource = await readText("src/lib/trust/trustPages.ts");
const EXPECTED_AVAILABLE_RECORDS = runtimeAvailable.items.length;
const EXPECTED_RUNTIME_HUBS = runtimeHubs.hubs.length;
const EXPECTED_OG_IMAGE_COUNT = ogImages.routes.length;
const EXPECTED_JSONLD_ROUTE_COUNT = EXPECTED_RUNTIME_HUBS + 2 + (trustPageSource.match(/indexable:\s*true/g) || []).length;
const FORBIDDEN_SCHEMA_TYPES = new Set(["Review", "AggregateRating", "Product", "Offer", "FAQPage", "Question", "Answer"]);

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/jsonld-context-check.json",
  "pipeline/manifests/jsonld-requirements.json",
  "pipeline/manifests/jsonld-current-metadata-audit.json",
  "pipeline/manifests/jsonld-builder-results.json",
  "pipeline/manifests/jsonld-route-data.json",
  "pipeline/manifests/jsonld-page-integration-results.json",
  "pipeline/manifests/jsonld-validation-results.json",
  "pipeline/manifests/jsonld-static-export-qa-results.json",
  "pipeline/manifests/jsonld-browser-qa-results.json",
  "pipeline/manifests/jsonld-acceptance-gate.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/jsonld-context-check.md",
  "pipeline/reports/jsonld-requirements.md",
  "pipeline/reports/jsonld-current-metadata-audit.md",
  "pipeline/reports/jsonld-builder-report.md",
  "pipeline/reports/jsonld-route-data-report.md",
  "pipeline/reports/jsonld-page-integration-report.md",
  "pipeline/reports/jsonld-validation-report.md",
  "pipeline/reports/jsonld-static-export-qa-report.md",
  "pipeline/reports/jsonld-browser-qa-report.md",
  "pipeline/reports/jsonld-acceptance-gate.md",
];

test("JSON-LD helpers, component, manifests, and reports exist", async () => {
  assert.equal(existsSync(path.join(REPO_ROOT, "src/lib/seo/jsonLd.ts")), true, "jsonLd helper should exist");
  assert.equal(existsSync(path.join(REPO_ROOT, "src/components/seo/JsonLdScript.tsx")), true, "JsonLdScript component should exist");

  for (const relativePath of [...REQUIRED_MANIFESTS, ...REQUIRED_REPORTS]) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
  }

  for (const relativePath of REQUIRED_MANIFESTS) {
    JSON.parse(await readText(relativePath));
  }
});

test("context preserves project, runtime, sitemap, OG, and deferred ad boundaries", async () => {
  const context = await readJson("pipeline/manifests/jsonld-context-check.json");
  const appText = await readProjectText(["app", "src"], { excludeGenerated: true });

  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.currentBranch, "ver-5-deployed-may-13-2026");
  assert.equal(context.summary.commitAca3dc2Exists, true);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.runtimeAvailableRecords, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(context.summary.runtimeIndexableHubs, EXPECTED_RUNTIME_HUBS);
  assert.equal(context.summary.regularSitemapExists, true);
  assert.equal(context.summary.imageSitemapExists, true);
  assert.equal(context.summary.ogImagesExist, true);
  assert.equal(context.summary.ogImageCount, EXPECTED_OG_IMAGE_COUNT);
  assert.equal(context.summary.siteUrl, SITE_URL);
  assert.equal(context.summary.publicAssetBaseUrl, ASSET_BASE_URL);
  assert.equal(context.summary.contactEmail, "admin@ilovecoloringpage.com");
  assert.equal(context.summary.svgInternalOnly, true);
  assert.deepEqual(context.summary.publicDownloadFormats, ["PNG", "JPG", "WebP"]);
  assert.equal(context.summary.liveAdsenseCodePresent, false);
  assert.doesNotMatch(appText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
});

test("selected schema plan is conservative and excludes unsupported schema types", async () => {
  const requirements = await readJson("pipeline/manifests/jsonld-requirements.json");
  const routeData = await readJson("pipeline/manifests/jsonld-route-data.json");
  const allSchemaText = JSON.stringify(routeData);

  assert.deepEqual(requirements.summary.rejectedSchemaTypes.sort(), ["AggregateRating", "FAQPage", "Offer", "Product", "Review", "SearchAction"].sort());
  assert.equal(requirements.summary.searchActionUsed, false);
  assert.equal(requirements.summary.perImageSchemaAvoided, true);
  assert.equal(routeData.summary.routeCount, EXPECTED_JSONLD_ROUTE_COUNT);
  assert.equal(routeData.summary.homepageHasJsonLd, true);
  assert.equal(routeData.summary.coloringPagesHasJsonLd, true);
  assert.equal(routeData.summary.hubPagesWithJsonLd, EXPECTED_RUNTIME_HUBS);
  assert.equal(routeData.summary.trustPagesWithJsonLd, 6);
  assert.equal(routeData.summary.maxItemListItems <= 8, true);
  assert.equal(routeData.summary.noDeferredRecords, true);
  assert.equal(routeData.summary.noSvgUrls, true);
  assert.equal(routeData.summary.noR2DevUrls, true);
  assert.equal(routeData.summary.noLocalhostUrls, true);

  for (const forbiddenType of FORBIDDEN_SCHEMA_TYPES) {
    assert.equal(allSchemaText.includes(`"${forbiddenType}"`), false, `${forbiddenType} should not appear in JSON-LD route data`);
  }
});

test("homepage, collection, hub, breadcrumb, and trust JSON-LD are generated", async () => {
  const routeData = await readJson("pipeline/manifests/jsonld-route-data.json");
  const routes = new Map(routeData.routes.map((entry) => [entry.path, entry]));

  const home = routes.get("/");
  const coloringPages = routes.get("/coloring-pages");
  const trex = routes.get("/coloring-pages/t-rex");
  const contact = routes.get("/contact");
  const privacy = routes.get("/privacy");

  assert.ok(home, "home route should be present");
  assert.deepEqual(home.schemaTypes, ["WebSite", "Organization", "WebPage"]);
  assert.equal(home.jsonLd.some((node) => node["@type"] === "WebSite"), true);
  assert.equal(home.jsonLd.some((node) => node["@type"] === "Organization"), true);
  assert.equal(home.jsonLd.every((node) => !hasForbiddenSchemaType(node)), true);

  assert.ok(coloringPages, "/coloring-pages route should be present");
  assert.equal(coloringPages.schemaTypes.includes("CollectionPage"), true);
  assert.equal(coloringPages.schemaTypes.includes("BreadcrumbList"), true);
  assert.equal(coloringPages.schemaTypes.includes("ItemList"), true);

  assert.ok(trex, "T-Rex hub route should be present");
  assert.equal(trex.schemaTypes.includes("CollectionPage"), true);
  assert.equal(trex.schemaTypes.includes("BreadcrumbList"), true);
  assert.equal(trex.schemaTypes.includes("ItemList"), true);
  assert.equal(trex.breadcrumbs.length >= 2, true);
  assert.equal(trex.itemListItems.length <= 8, true);
  assert.equal(trex.itemListItems.every((item) => item.url.startsWith(`${SITE_URL}/coloring-pages/t-rex#asset-`)), true);

  assert.equal(contact.schemaTypes.includes("ContactPage"), true);
  assert.equal(privacy.schemaTypes.includes("PrivacyPolicy"), true);
});

test("validation output proves static HTML JSON-LD is safe and accurate", async () => {
  const validation = await readJson("pipeline/manifests/jsonld-validation-results.json");
  const sampled = new Map(validation.sampledPages.map((page) => [page.path, page]));

  assert.equal(validation.summary.validationPassed, true);
  assert.equal(validation.summary.sampledPageCount, 13);
  assert.equal(validation.summary.allJsonParses, true);
  assert.equal(validation.summary.allContextsValid, true);
  assert.equal(validation.summary.allTypesAllowed, true);
  assert.equal(validation.summary.allUrlsAbsolute, true);
  assert.equal(validation.summary.noLocalhost, true);
  assert.equal(validation.summary.noR2Dev, true);
  assert.equal(validation.summary.noPrivateR2Endpoint, true);
  assert.equal(validation.summary.noSvgUrls, true);
  assert.equal(validation.summary.noPngThumbUrls, true);
  assert.equal(validation.summary.noDeferredRecords, true);
  assert.equal(validation.summary.noForbiddenSchemaTypes, true);
  assert.equal(validation.summary.noFaqSchema, true);
  assert.equal(validation.summary.noDuplicateCanonicalMismatch, true);
  assert.equal(validation.summary.breadcrumbsCorrect, true);
  assert.equal(sampled.get("/")?.scriptCount >= 1, true);
  assert.equal(sampled.get("/coloring-pages")?.schemaTypes.includes("CollectionPage"), true);
  assert.equal(sampled.get("/coloring-pages/t-rex")?.schemaTypes.includes("BreadcrumbList"), true);
  assert.equal(sampled.get("/contact")?.schemaTypes.includes("ContactPage"), true);
});

test("static export QA, browser QA, and JSON-LD acceptance gate pass", async () => {
  const staticQa = await readJson("pipeline/manifests/jsonld-static-export-qa-results.json");
  const browserQa = await readJson("pipeline/manifests/jsonld-browser-qa-results.json");
  const gate = await readJson("pipeline/manifests/jsonld-acceptance-gate.json");

  assert.equal(staticQa.summary.staticExportPassed, true);
  assert.equal(staticQa.summary.sampledStaticHtmlContainsJsonLd, true);
  assert.equal(staticQa.summary.jsonLdScriptCountExpected, true);
  assert.equal(staticQa.summary.regularSitemapStillWorks, true);
  assert.equal(staticQa.summary.imageSitemapStillWorks, true);
  assert.equal(staticQa.summary.ogMetadataStillWorks, true);
  assert.equal(staticQa.summary.appApiRoutePresent, false);

  assert.equal(browserQa.summary.browserQaPassed, true);
  assert.equal(browserQa.summary.pagesRenderedNormally, true);
  assert.equal(browserQa.summary.galleryWebpRendered, true);
  assert.equal(browserQa.summary.printDownloadControlsStillWork, true);
  assert.equal(browserQa.summary.jsonLdPresent, true);
  assert.equal(browserQa.summary.ogMetadataStillWorks, true);
  assert.equal(browserQa.summary.liveAdsenseCodePresent, false);

  assert.equal(gate.summary.jsonld_added, true);
  assert.equal(gate.summary.homepage_passed, true);
  assert.equal(gate.summary.coloring_pages_passed, true);
  assert.equal(gate.summary.hub_pages_passed, true);
  assert.equal(gate.summary.trust_pages_passed, true);
  assert.equal(gate.summary.validation_passed, true);
  assert.equal(gate.summary.static_export_passed, true);
  assert.equal(gate.summary.browser_qa_passed, true);
  assert.equal(gate.summary.regular_sitemap_still_valid, true);
  assert.equal(gate.summary.image_sitemap_still_valid, true);
  assert.equal(gate.summary.og_metadata_still_valid, true);
  assert.equal(gate.summary.ready_for_live_ads_round, false);
  assert.deepEqual(gate.summary.blockers, []);
});

test("static export, source media, public media, and public download boundaries remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appText = await readProjectText(["app", "src"], { excludeGenerated: true });
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "sitemap.ts")), true);
  assert.equal(existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")), true);
  assert.equal(existsSync(path.join(REPO_ROOT, "public", "og", "home.jpg")), true);
  assert.doesNotMatch(appText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.equal(publicFiles.every((file) => /^public\/(?:image-sitemap\.xml|og\/.+\.jpg|search-data\/.+\.json)$/.test(normalizePath(file)) || normalizePath(file) === "public/icon.svg"), true);
  assert.equal((await gitStatusFor("images")).trim(), "");
  assert.equal((await gitStatusFor("ilovesvg")).trim(), "");
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root).replace(/\\/g, "/")];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|mjs)$/.test(file)) continue;
      if (options.excludeGenerated && normalizePath(file).startsWith("src/generated/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function hasForbiddenSchemaType(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasForbiddenSchemaType);
  const type = value["@type"];
  if (typeof type === "string" && FORBIDDEN_SCHEMA_TYPES.has(type)) return true;
  if (Array.isArray(type) && type.some((entry) => FORBIDDEN_SCHEMA_TYPES.has(entry))) return true;
  return Object.values(value).some(hasForbiddenSchemaType);
}
