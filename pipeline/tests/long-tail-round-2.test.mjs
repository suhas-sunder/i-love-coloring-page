import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = process.cwd();
const EXPECTED_AVAILABLE_RECORDS = 6352;
const IP_RISK_RE = /\b(?:naruto|mario|pokemon|disney|marvel|dc|sonic|minecraft|roblox|paw patrol|bluey)\b/i;

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/long-tail-round-2-context-check.json",
  "pipeline/manifests/long-tail-round-2-raw-candidates.json",
  "pipeline/manifests/long-tail-round-2-promoted-candidates.json",
  "pipeline/manifests/long-tail-round-2-manual-review-candidates.json",
  "pipeline/manifests/long-tail-round-2-backlog-candidates.json",
  "pipeline/manifests/long-tail-round-2-rejected-candidates.json",
  "pipeline/manifests/long-tail-round-2-candidate-evidence.json",
  "pipeline/manifests/long-tail-round-2-unsupported-concepts.json",
  "pipeline/manifests/long-tail-round-2-ip-risk-audit.json",
  "pipeline/manifests/long-tail-round-2-promoted-hubs.json",
  "pipeline/manifests/long-tail-round-2-browser-qa-results.json",
  "pipeline/manifests/long-tail-round-2-sampled-url-check-results.json",
  "pipeline/manifests/long-tail-round-2-acceptance-gate.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/long-tail-round-2-context-check.md",
  "pipeline/reports/long-tail-round-2-candidate-report.md",
  "pipeline/reports/long-tail-round-2-candidate-evidence.md",
  "pipeline/reports/long-tail-round-2-unsupported-concepts.md",
  "pipeline/reports/long-tail-round-2-ip-risk-audit.md",
  "pipeline/reports/long-tail-round-2-promoted-hubs.md",
  "pipeline/reports/long-tail-round-2-manual-review.csv",
  "pipeline/reports/long-tail-round-2-backlog.csv",
  "pipeline/reports/long-tail-round-2-manual-review.md",
  "pipeline/reports/long-tail-round-2-backlog.md",
  "pipeline/reports/long-tail-round-2-browser-qa-report.md",
  "pipeline/reports/long-tail-round-2-sampled-url-check-report.md",
  "pipeline/reports/long-tail-round-2-acceptance-gate.md",
];

test("long-tail Round 2 manifests and reports exist and parse", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    JSON.parse(await readText(relativePath));
  }

  for (const relativePath of REQUIRED_REPORTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
  }

  assert.equal(existsSync(path.join(REPO_ROOT, "pipeline/scripts/build-long-tail-round-2-candidates.mjs")), true);
  assert.equal(existsSync(path.join(REPO_ROOT, "pipeline/scripts/long-tail-round-2-browser-qa-runner.cjs")), true);
  assert.equal(existsSync(path.join(REPO_ROOT, "pipeline/scripts/long-tail-round-2-sampled-url-check.mjs")), true);
});

test("context gate preserves the frontend-only runtime boundaries", async () => {
  const context = await readJson("pipeline/manifests/long-tail-round-2-context-check.json");

  assert.equal(context.summary.repoProjectCorrect, true);
  assert.equal(context.summary.branchCorrect, true);
  assert.equal(context.summary.latestFinalLinkNavCommitExists, true);
  assert.equal(context.summary.appApiAbsent, true);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.runtimeAvailableRecords, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(context.summary.deferredRecordsExcluded, true);
  assert.equal(context.summary.svgInternalOnly, true);
  assert.deepEqual(context.summary.publicDownloads, ["png", "jpg", "webp"]);
  assert.equal(context.summary.imageSitemapExists, true);
  assert.equal(context.summary.ogImagesExist, true);
  assert.equal(context.summary.jsonLdExists, true);
  assert.equal(context.summary.liveAdSenseAbsent, true);
});

test("every promoted hub is evidence-backed, threshold-compliant, and non-duplicate", async () => {
  const promoted = await readJson("pipeline/manifests/long-tail-round-2-promoted-candidates.json");
  const evidence = await readJson("pipeline/manifests/long-tail-round-2-candidate-evidence.json");
  const promotedHubs = await readJson("pipeline/manifests/long-tail-round-2-promoted-hubs.json");
  const existingHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const deferredIds = new Set((deferred.records || deferred.items || []).map((item) => item.assetId));
  const evidenceBySlug = new Map(evidence.candidates.map((candidate) => [candidate.slug, candidate]));

  assert.equal(promoted.summary.promotedCount, promoted.candidates.length);
  assert.equal(promotedHubs.summary.promotedCount, promotedHubs.hubs.length);
  assert.equal(new Set(routes.routes.map((route) => route.slug)).size, routes.routes.length);
  assert.equal(new Set(existingHubs.hubs.map((hub) => hub.slug)).size, existingHubs.hubs.length);

  for (const candidate of promoted.candidates) {
    const record = evidenceBySlug.get(candidate.slug);
    assert.ok(record, `${candidate.slug} should have evidence`);
    assert.equal(record.decision, "promoted");
    assert.ok(record.assetCount >= record.threshold.minimum || record.threshold.documentedException, `${candidate.slug} should meet its threshold`);
    assert.ok(record.representativeAssetIds.length >= Math.min(8, record.assetCount), `${candidate.slug} should include representative asset IDs`);
    assert.ok(record.representativeTitles.length >= Math.min(8, record.assetCount), `${candidate.slug} should include representative titles`);
    assert.ok(record.exactMatchingTerms.length > 0, `${candidate.slug} should list exact matching terms`);
    assert.ok(record.reasonNotDuplicate.length > 0, `${candidate.slug} should document non-duplication`);
    assert.ok(record.searchIntentReason.length > 0, `${candidate.slug} should document search intent`);
    assert.equal(record.representativeAssetIds.some((assetId) => deferredIds.has(assetId)), false, `${candidate.slug} should not use deferred records`);
    assert.doesNotMatch(`${candidate.slug} ${candidate.title}`, IP_RISK_RE);
  }
});

test("unsupported concepts are explicitly reported and not silently promoted", async () => {
  const unsupported = await readJson("pipeline/manifests/long-tail-round-2-unsupported-concepts.json");
  const promoted = await readJson("pipeline/manifests/long-tail-round-2-promoted-candidates.json");
  const concepts = new Map(unsupported.concepts.map((concept) => [concept.concept, concept]));
  const promotedSlugs = new Set(promoted.candidates.map((candidate) => candidate.slug));

  for (const concept of [
    "anime boys",
    "anime magic",
    "anime summoning",
    "summoning magic",
    "dog breeds",
    "flower names",
    "dinosaur species",
    "specific animal types",
    "food/dessert subjects",
    "holiday subthemes",
  ]) {
    assert.ok(concepts.has(concept), `${concept} should be explicitly reported`);
  }

  const animeBoys = concepts.get("anime boys");
  if (promotedSlugs.has("anime-boys")) {
    assert.equal(animeBoys.supported, true);
    assert.ok(animeBoys.evidenceCount >= 20);
  } else {
    assert.equal(animeBoys.promotedRoute, null);
    assert.match(animeBoys.reason, /not promoted/i);
  }

  assert.equal([...promotedSlugs].some((slug) => /anime-boys/i.test(slug) && !animeBoys.supported), false);
});

test("IP risk, sitemap, browser QA, sampled URL QA, and acceptance gate pass", async () => {
  const ipRisk = await readJson("pipeline/manifests/long-tail-round-2-ip-risk-audit.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const sitemap = await readJson("src/generated/coloring/runtime-site-map.json");
  const browserQa = await readJson("pipeline/manifests/long-tail-round-2-browser-qa-results.json");
  const sampledUrl = await readJson("pipeline/manifests/long-tail-round-2-sampled-url-check-results.json");
  const acceptance = await readJson("pipeline/manifests/long-tail-round-2-acceptance-gate.json");

  assert.equal(ipRisk.summary.noPromotedRouteUsesFranchiseNames, true);
  assert.equal(ipRisk.summary.riskyCandidatesRejectedOrManualOnly, true);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(routes.routes.some((route) => /\/(?:image|asset|item)\//i.test(route.path)), false);
  assert.equal(new Set(sitemap.entries.map((entry) => entry.path)).size, sitemap.entries.length);
  assert.equal(browserQa.summary.browserQaPassed, true);
  assert.equal(sampledUrl.summary.sampledUrlCheckPassed, true);
  assert.equal(acceptance.browser_qa_passed, true);
  assert.equal(acceptance.sampled_url_check_passed, true);
  assert.equal(acceptance.no_unsupported_categories_promoted, true);
  assert.equal(acceptance.ready_for_next_local_qa, acceptance.blockers.length === 0);
});

test("static export, public downloads, SEO assets, and repository safety remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const projectText = await readProjectText(["app", "src", "pipeline/manifests/long-tail-round-2-promoted-hubs.json"]);

  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)), false);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /Download PNG/);
  assert.match(downloadMenu, /Download JPG/);
  assert.match(downloadMenu, /Download WebP/);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|svgDownload|downloadSvg/i);
  assert.equal(existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")), true);
  assert.ok((await listFilesIfExists(path.join(REPO_ROOT, "public", "og"))).length > 0);
  assert.match(projectText, /JsonLdScript|buildHubPageJsonLd|buildGalleryLandingJsonLd/);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);

  assert.equal(gitStatusFor(["images", "ilovesvg"]).trim(), "");
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

function gitStatusFor(paths) {
  return execFileSync("git", ["status", "--short", "--", ...paths], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
