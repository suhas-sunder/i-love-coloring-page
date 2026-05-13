import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = process.cwd();
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/long-tail-hubs-context-check.json",
  "pipeline/manifests/long-tail-current-hub-audit.json",
  "pipeline/manifests/long-tail-token-frequency.json",
  "pipeline/manifests/long-tail-subject-frequency.json",
  "pipeline/manifests/long-tail-combination-frequency.json",
  "pipeline/manifests/long-tail-candidate-hubs-raw.json",
  "pipeline/manifests/long-tail-hub-promotion-policy.json",
  "pipeline/manifests/long-tail-candidate-hub-scores.json",
  "pipeline/manifests/long-tail-promoted-hubs-proposal.json",
  "pipeline/manifests/long-tail-hub-manual-review.json",
  "pipeline/manifests/long-tail-hub-implementation-results.json",
  "pipeline/manifests/long-tail-hub-seo-content-results.json",
  "pipeline/manifests/long-tail-internal-linking-results.json",
  "pipeline/manifests/long-tail-hub-browser-qa-results.json",
  "pipeline/manifests/long-tail-static-export-results.json",
];

test("long-tail manifests parse and document runtime inventory boundaries", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    JSON.parse(await readText(relativePath));
  }

  const context = await readJson("pipeline/manifests/long-tail-hubs-context-check.json");
  const candidateScores = await readJson("pipeline/manifests/long-tail-candidate-hub-scores.json");
  const proposal = await readJson("pipeline/manifests/long-tail-promoted-hubs-proposal.json");
  const implementation = await readJson("pipeline/manifests/long-tail-hub-implementation-results.json");

  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.runtimeAvailableRecords, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(context.summary.deferredManualReviewRecords, EXPECTED_DEFERRED_RECORDS);
  assert.equal(context.summary.publicAssetBaseUrl, "https://assets.ilovecoloringpage.com/coloring-pages");
  assert.equal(context.summary.publicSiteUrl, "https://www.ilovecoloringpage.com");
  assert.equal(context.summary.imageSitemapPresent, false);
  assert.equal(context.summary.openGraphImageGenerationPresent, false);
  assert.equal(context.summary.liveAdsenseCodePresent, false);

  assert.equal(candidateScores.summary.availableRuntimeRecords, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(candidateScores.summary.deferredRecordsExcluded, EXPECTED_DEFERRED_RECORDS);
  assert.equal(proposal.summary.promotedHubCount, implementation.summary.promotedNewHubCount);
  assert.equal(implementation.summary.runtimeAvailableRecords, EXPECTED_AVAILABLE_RECORDS);
});

test("implemented long-tail hubs are routed without spam, duplicates, or per-image pages", async () => {
  const policy = await readJson("pipeline/manifests/long-tail-hub-promotion-policy.json");
  const scores = await readJson("pipeline/manifests/long-tail-candidate-hub-scores.json");
  const implementation = await readJson("pipeline/manifests/long-tail-hub-implementation-results.json");
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const runtimeRoutes = await readJson("src/generated/coloring/runtime-routes.json");
  const runtimeSiteMap = await readJson("src/generated/coloring/runtime-site-map.json");

  assert.equal(runtimeRoutes.noPerImageRoutes, true);
  assert.equal(runtimeRoutes.routes.some((route) => /\/image\/|\/pages?\//i.test(route.path)), false);
  assert.equal(new Set(runtimeHubs.hubs.map((hub) => hub.slug)).size, runtimeHubs.hubs.length);
  assert.equal(new Set(runtimeRoutes.routes.map((route) => route.path)).size, runtimeRoutes.routes.length);
  assert.equal(new Set(runtimeSiteMap.entries.map((entry) => entry.path)).size, runtimeSiteMap.entries.length);
  assert.equal(implementation.summary.finalIndexableHubCount, runtimeRoutes.routes.length);
  assert.equal(implementation.summary.finalIndexableHubCount > implementation.summary.startingIndexableHubCount, implementation.summary.promotedNewHubCount > 0);

  const promotedSlugs = new Set(implementation.promotedHubs.map((hub) => hub.slug));
  const rejectedSlugs = new Set(scores.candidates.filter((candidate) => candidate.classification === "reject_spam_or_thin").map((candidate) => candidate.slug));
  const backlogSlugs = new Set(scores.candidates.filter((candidate) => candidate.classification === "backlog_later" || candidate.classification === "manual_review" || candidate.classification === "section_only").map((candidate) => candidate.slug));
  assert.equal([...promotedSlugs].some((slug) => rejectedSlugs.has(slug) || backlogSlugs.has(slug)), false);

  for (const hub of implementation.promotedHubs) {
    const minimum = policy.minimums[hub.kind] || policy.minimums.subject;
    assert.equal(hub.assetCount >= minimum || hub.minimumExceptionDocumented === true, true, `${hub.slug} should meet minimum policy`);
  }
});

test("T-Rex and promoted hub SEO data are generated when inventory supports them", async () => {
  const subjects = await readJson("pipeline/manifests/long-tail-subject-frequency.json");
  const implementation = await readJson("pipeline/manifests/long-tail-hub-implementation-results.json");
  const seo = await readJson("src/generated/coloring/runtime-seo-pages.json");
  const hubSeo = await readJson("src/generated/coloring/runtime-hub-seo-content.json");
  const internalLinking = await readJson("src/generated/coloring/internal-linking.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");

  const tRexSubject = subjects.subjects.find((subject) => subject.term === "t-rex");
  if (tRexSubject && tRexSubject.assetCount >= 8) {
    assert.equal(routes.routes.some((route) => route.slug === "t-rex"), true, "T-Rex hub should exist when it meets the subject threshold");
  }

  for (const hub of implementation.promotedHubs) {
    assert.equal(seo.pages.some((page) => page.path === `/coloring-pages/${hub.slug}` && page.metaTitle && page.metaDescription), true, `${hub.slug} metadata should exist`);
    assert.equal(hubSeo.hubs.some((page) => page.slug === hub.slug && page.shortIntro && page.belowGallerySections?.length >= 2), true, `${hub.slug} supporting content should exist`);
    assert.equal(internalLinking.pages.some((page) => page.path === `/coloring-pages/${hub.slug}` && page.links?.length > 0), true, `${hub.slug} internal links should exist`);
  }
});

test("static export boundaries, navigation, ads, downloads, and deferred SEO work remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const projectText = await readProjectText(["app", "src", "pipeline/manifests/long-tail-hub-implementation-results.json"]);
  const siteNav = await readText("src/lib/navigation/siteNav.ts");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)), false);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /opengraph-image|twitter-image|ImageResponse|imageSitemap|Image Sitemap/i);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|svgDownload|downloadSvg/i);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.match(siteNav, /moreHubGroups/);
  assert.equal(hubs.hubs.length < 260, true, "More menu should remain bounded after expansion");
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
