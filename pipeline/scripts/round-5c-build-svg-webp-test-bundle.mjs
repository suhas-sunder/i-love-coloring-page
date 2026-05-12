#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { copyFile, link, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RUN_ID = "round-5c-svg-webp-r2-test";
const LOCAL_ASSET_ROOT = "pipeline/r2-upload/coloring-pages";
const TEST_UPLOAD_ROOT = "pipeline/r2-upload-test-svg-webp";
const DEFAULT_PREFIX = "coloring-pages";
const DEFAULT_LIMIT = 30;
const EXAMPLE_PUBLIC_BASE_URL = "https://YOUR-ASSET-DOMAIN.com/coloring-pages";
const IMMUTABLE_CACHE_POLICY = "public, max-age=31536000, immutable";
const CLOUDFLARE_R2_CORS_DOC = "https://developers.cloudflare.com/r2/buckets/cors/";

const REQUIRED_HUB_SLUGS = [
  "animals",
  "anime-girls",
  "chibi",
  "fantasy",
  "christmas",
  "halloween",
  "mandalas",
  "geometric",
  "plushies",
  "cars",
  "vehicles",
  "plants",
  "indoor-plants",
  "dinosaurs",
  "prehistoric-animals",
];

const PRIORITY_SEEDS = [
  { slug: "animals", reason: "known first-page animal coverage", match: /alligator/i },
  { slug: "anime-girls", reason: "human-adjacent anime coverage" },
  { slug: "chibi", reason: "human-adjacent chibi coverage" },
  { slug: "fantasy", reason: "high-detail fantasy coverage" },
  { slug: "christmas", reason: "seasonal Christmas coverage" },
  { slug: "halloween", reason: "seasonal Halloween coverage" },
  { slug: "mandalas", reason: "mandala detail coverage" },
  { slug: "geometric", reason: "geometric detail coverage" },
  { slug: "plushies", reason: "plushies hub coverage" },
  { slug: "cars", reason: "cars hub coverage" },
  { slug: "vehicles", reason: "vehicles hub coverage" },
  { slug: "plants", reason: "plants hub coverage" },
  { slug: "indoor-plants", reason: "indoor plants hub coverage" },
  { slug: "dinosaurs", reason: "dinosaurs hub coverage" },
  { slug: "prehistoric-animals", reason: "prehistoric animals hub coverage" },
];

const MANIFESTS = {
  context: "pipeline/manifests/round-5c-project-context-check.json",
  readiness: "pipeline/manifests/round-5c-svg-webp-readiness-audit.json",
  selection: "pipeline/manifests/round-5c-svg-webp-test-selection.json",
  bundlePlan: "pipeline/manifests/round-5c-svg-webp-test-bundle-plan.json",
  bundleResults: "pipeline/manifests/round-5c-svg-webp-test-bundle-results.json",
  uploadChecklist: "pipeline/manifests/round-5c-svg-webp-manual-upload-checklist.json",
  urlPlan: "pipeline/manifests/round-5c-svg-webp-url-verification-plan.json",
  publicUrlResults: "pipeline/manifests/round-5c-svg-webp-public-url-results.json",
  browserSvgWebpQa: "pipeline/manifests/round-5c-browser-svg-webp-qa-results.json",
  futureFullUpload: "pipeline/manifests/round-5c-future-full-upload-plan.json",
  corsGuide: "pipeline/manifests/round-5c-r2-cors-content-type-guide.json",
  assetStrategy: "pipeline/manifests/round-5c-asset-strategy-results.json",
  browserQa: "pipeline/manifests/round-5c-browser-qa-results.json",
};

const REPORTS = {
  context: "pipeline/reports/round-5c-project-context-check.md",
  readiness: "pipeline/reports/round-5c-svg-webp-readiness-audit.md",
  bundle: "pipeline/reports/round-5c-svg-webp-test-bundle-report.md",
  uploadGuide: "pipeline/reports/round-5c-svg-webp-manual-upload-guide.md",
  urlPlan: "pipeline/reports/round-5c-svg-webp-url-verification-plan.md",
  futureFullUpload: "pipeline/reports/round-5c-future-full-upload-plan.md",
  corsGuide: "pipeline/reports/round-5c-r2-cors-content-type-guide.md",
  assetStrategy: "pipeline/reports/round-5c-asset-strategy-report.md",
  browserQa: "pipeline/reports/round-5c-browser-qa-report.md",
  nextPhase: "pipeline/reports/round-5c-next-phase-plan.md",
};

export async function runRound5CSvgWebpTestBundle(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const limit = Number(options.limit ?? DEFAULT_LIMIT);
  const prefix = normalizePrefix(options.prefix || DEFAULT_PREFIX);
  const mode = options.copy ? "copy" : "hardlink";

  if (!Number.isInteger(limit) || limit !== DEFAULT_LIMIT) {
    throw new Error(`Round 5C expects exactly ${DEFAULT_LIMIT} records. Received ${options.limit}`);
  }

  const uploadRoot = path.posix.join(TEST_UPLOAD_ROOT, prefix);
  const absoluteUploadRoot = resolveSafeUnder(repoRoot, uploadRoot, path.join(repoRoot, TEST_UPLOAD_ROOT));

  const state = await loadState(repoRoot, prefix);
  const context = await buildProjectContext(state, repoRoot);
  const readiness = await buildReadinessAudit(state);
  const selectedRecords = selectRecords(state, limit);
  const selection = buildSelectionManifest(state, selectedRecords, prefix);
  const bundleEntries = buildBundleEntries(selectedRecords, prefix, uploadRoot);
  const bundlePlan = buildBundlePlan(state, selection, bundleEntries, uploadRoot, prefix, mode);

  validateSelection(selection, bundleEntries, prefix);

  if (options.clean) {
    assertPathInside(absoluteUploadRoot, path.join(repoRoot, TEST_UPLOAD_ROOT), "Round 5C clean target");
    await rm(absoluteUploadRoot, { recursive: true, force: true });
  }

  const materialized = await materializeBundleFiles({ repoRoot, mode, entries: bundleEntries, uploadRoot });
  const bundleResults = await buildBundleResults(selection, bundleEntries, materialized, uploadRoot, prefix, repoRoot);
  const uploadChecklist = buildUploadChecklist(selection, bundleEntries, uploadRoot, prefix);
  const urlPlan = buildUrlVerificationPlan(selection, bundleEntries, prefix);
  const publicUrlResults = (await readJsonIfExists(repoRoot, MANIFESTS.publicUrlResults)) || buildPendingPublicUrlResults(urlPlan);
  const browserSvgWebpQa = (await readJsonIfExists(repoRoot, MANIFESTS.browserSvgWebpQa)) || buildPendingBrowserSvgWebpQa();
  const futureFullUpload = buildFutureFullUploadPlan(readiness);
  const corsGuide = buildCorsGuide();
  const assetStrategy = buildAssetStrategyResults(readiness, selection, bundleResults);
  const browserQa = (await readJsonIfExists(repoRoot, MANIFESTS.browserQa)) || buildPendingBrowserQa();

  await writeJson(repoRoot, MANIFESTS.context, context);
  await writeJson(repoRoot, MANIFESTS.readiness, readiness);
  await writeJson(repoRoot, MANIFESTS.selection, selection);
  await writeJson(repoRoot, MANIFESTS.bundlePlan, bundlePlan);
  await writeJson(repoRoot, MANIFESTS.bundleResults, bundleResults);
  await writeJson(repoRoot, MANIFESTS.uploadChecklist, uploadChecklist);
  await writeJson(repoRoot, MANIFESTS.urlPlan, urlPlan);
  await writeJson(repoRoot, MANIFESTS.publicUrlResults, publicUrlResults);
  await writeJson(repoRoot, MANIFESTS.browserSvgWebpQa, browserSvgWebpQa);
  await writeJson(repoRoot, MANIFESTS.futureFullUpload, futureFullUpload);
  await writeJson(repoRoot, MANIFESTS.corsGuide, corsGuide);
  await writeJson(repoRoot, MANIFESTS.assetStrategy, assetStrategy);
  await writeJson(repoRoot, MANIFESTS.browserQa, browserQa);

  await writeText(repoRoot, REPORTS.context, renderProjectContextReport(context));
  await writeText(repoRoot, REPORTS.readiness, renderReadinessReport(readiness));
  await writeText(repoRoot, REPORTS.bundle, renderBundleReport(selection, bundleResults));
  await writeText(repoRoot, REPORTS.uploadGuide, renderUploadGuide(uploadChecklist));
  await writeText(repoRoot, REPORTS.urlPlan, renderUrlPlanReport(urlPlan));
  await writeText(repoRoot, REPORTS.futureFullUpload, renderFutureFullUploadReport(futureFullUpload));
  await writeText(repoRoot, REPORTS.corsGuide, renderCorsGuideReport(corsGuide));
  await writeText(repoRoot, REPORTS.assetStrategy, renderAssetStrategyReport(assetStrategy));
  await writeText(repoRoot, REPORTS.browserQa, renderBrowserQaReport(browserQa));
  await writeText(repoRoot, REPORTS.nextPhase, renderNextPhasePlan());

  return {
    context,
    readiness,
    selection,
    bundlePlan,
    bundleResults,
    uploadChecklist,
    urlPlan,
    futureFullUpload,
    corsGuide,
    assetStrategy,
    browserQa,
  };
}

async function loadState(repoRoot, prefix) {
  const packageJson = await readJson(repoRoot, "package.json");
  const nextConfig = await readText(repoRoot, "next.config.mjs");
  const itemsData = await readJson(repoRoot, "src/generated/coloring/items.json");
  const hubsData = await readJson(repoRoot, "src/generated/coloring/hubs.json");
  const hubItemsData = await readJson(repoRoot, "src/generated/coloring/hub-items.json");
  const routesData = await readJson(repoRoot, "src/generated/coloring/routes.json");
  const productionAssetsData = await readJson(repoRoot, "pipeline/manifests/round-3c-production-assets.json");
  const quarantineData = await readJson(repoRoot, "pipeline/manifests/round-3c-production-quarantine.json");

  const assetById = new Map(productionAssetsData.assets.map((asset) => [asset.assetId, asset]));
  const quarantinedAssetIds = new Set((quarantineData.entries || []).map((entry) => entry.assetId));
  const hubById = new Map(hubsData.hubs.map((hub) => [hub.hubId, hub]));
  const hubBySlug = new Map(hubsData.hubs.map((hub) => [hub.slug, hub]));
  const hubItemsByAssetId = new Map(hubItemsData.items.map((entry) => [entry.assetId, entry]));
  const routeByHubId = new Map(routesData.routes.map((route) => [route.hubId, route]));
  const itemById = new Map(itemsData.items.map((item) => [item.assetId, item]));

  const candidates = [];
  for (const item of itemsData.items) {
    const asset = assetById.get(item.assetId);
    if (!asset || asset.status !== "passed_production_export") continue;
    if (quarantinedAssetIds.has(item.assetId)) continue;
    const svgSubpath = normalizeAssetSubpath(item.assetSubpaths?.svg);
    const webpSubpath = deriveWebpSubpath(item.assetSubpaths?.pngPreview);
    if (!svgSubpath || !webpSubpath) continue;
    const svgAbsolutePath = path.join(repoRoot, LOCAL_ASSET_ROOT, svgSubpath);
    const webpAbsolutePath = path.join(repoRoot, LOCAL_ASSET_ROOT, webpSubpath);
    if (!existsSync(svgAbsolutePath) || !existsSync(webpAbsolutePath)) continue;
    candidates.push(buildCandidate({ item, asset, hubItemsByAssetId, hubById, routeByHubId, prefix, repoRoot, svgSubpath, webpSubpath }));
  }

  candidates.sort((a, b) => a.assetId.localeCompare(b.assetId));

  return {
    repoRoot,
    prefix,
    packageJson,
    nextConfig,
    items: itemsData.items,
    hubs: hubsData.hubs,
    routes: routesData.routes,
    productionAssets: productionAssetsData.assets,
    quarantinedAssetIds,
    hubById,
    hubBySlug,
    hubItemsByAssetId,
    routeByHubId,
    itemById,
    assetById,
    candidates,
  };
}

function buildCandidate({ item, asset, hubItemsByAssetId, hubById, routeByHubId, prefix, repoRoot, svgSubpath, webpSubpath }) {
  const hubItem = hubItemsByAssetId.get(item.assetId) || { hubIds: [] };
  const hubs = (hubItem.hubIds || [])
    .map((hubId) => hubById.get(hubId))
    .filter(Boolean)
    .map((hub) => {
      const route = routeByHubId.get(hub.hubId);
      const previewIndex = Array.isArray(hub.previewAssetIds) ? hub.previewAssetIds.indexOf(item.assetId) : -1;
      const featuredIndex = Array.isArray(hub.featuredAssetIds) ? hub.featuredAssetIds.indexOf(item.assetId) : -1;
      return {
        hubId: hub.hubId,
        slug: hub.slug,
        title: hub.title,
        route: route?.path || hub.route || `/coloring-pages/${hub.slug}`,
        assetCount: hub.assetCount,
        previewIndex,
        featuredIndex,
        visibleOnFirstPage: previewIndex >= 0 && previewIndex < (hub.galleryPageSize || 48),
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));

  const visibleHubs = hubs.filter((hub) => hub.visibleOnFirstPage);
  const likelyPages = (visibleHubs.length ? visibleHubs : hubs)
    .slice(0, 8)
    .map((hub) => ({
      path: hub.route,
      title: hub.title,
      reason: hub.visibleOnFirstPage ? "included in the first-page preview set" : "assigned to this hub",
    }));

  if (!likelyPages.some((page) => page.path === "/coloring-pages")) {
    likelyPages.unshift({
      path: "/coloring-pages",
      title: "Coloring Pages",
      reason: "root gallery includes approved production items",
    });
  }

  const warningFlags = [...new Set([...(item.warningFlags || []), ...(asset.round3a1WarningFlags || [])])].sort();
  const svgStats = statSyncSafe(path.join(repoRoot, LOCAL_ASSET_ROOT, svgSubpath));
  const webpStats = statSyncSafe(path.join(repoRoot, LOCAL_ASSET_ROOT, webpSubpath));
  const svgObjectKey = path.posix.join(prefix, svgSubpath);
  const webpObjectKey = path.posix.join(prefix, webpSubpath);

  return {
    assetId: item.assetId,
    displayTitle: item.title,
    category: item.categorySlug,
    filenameSlug: item.filenameSlug,
    hubs,
    hubSlugs: hubs.map((hub) => hub.slug),
    likelyPages,
    warningFlags,
    isWarning: warningFlags.length > 0,
    isHighDetail: /detailed|intricate|mandala|geometric|dragon|castle|pattern|ornate/i.test(`${item.title} ${item.filenameSlug} ${item.categorySlug}`),
    localSvgPath: path.posix.join(LOCAL_ASSET_ROOT, svgSubpath),
    localWebpPath: path.posix.join(LOCAL_ASSET_ROOT, webpSubpath),
    svgSubpath,
    webpSubpath,
    targetR2ObjectKeySvg: svgObjectKey,
    targetR2ObjectKeyWebp: webpObjectKey,
    expectedPublicSvgUrl: `${EXAMPLE_PUBLIC_BASE_URL}/${encodeAssetSubpath(svgSubpath)}`,
    expectedPublicWebpUrl: `${EXAMPLE_PUBLIC_BASE_URL}/${encodeAssetSubpath(webpSubpath)}`,
    svgBytes: svgStats?.size || 0,
    webpBytes: webpStats?.size || 0,
  };
}

async function buildProjectContext(state, repoRoot) {
  const projectText = await readProjectText(repoRoot, ["app", "src", "pipeline/manifests/round-5b-asset-publishing-strategy-update.json"]);
  const publicFiles = await listFiles(path.join(repoRoot, "public"));
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      correctRepository: state.packageJson.name === "i-love-coloring-page",
      packageName: state.packageJson.name,
      branch: safeGit(repoRoot, ["branch", "--show-current"]),
      head: safeGit(repoRoot, ["rev-parse", "HEAD"]),
      round5bCommitExists: gitCommitExists(repoRoot, "da5fc45"),
      appApiRoutePresent: existsSync(path.join(repoRoot, "app", "api")) || existsSync(path.join(repoRoot, "src", "app", "api")),
      staticExportConfigured: /output:\s*"export"/.test(state.nextConfig),
      coloringPagesRouteExists: existsSync(path.join(repoRoot, "app", "coloring-pages", "page.tsx")),
      hubSlugRouteExists: existsSync(path.join(repoRoot, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2UploadExists: existsSync(path.join(repoRoot, LOCAL_ASSET_ROOT)),
      localSvgFolderExists: existsSync(path.join(repoRoot, LOCAL_ASSET_ROOT, "svg")),
      localWebpFolderExists: existsSync(path.join(repoRoot, LOCAL_ASSET_ROOT, "webp")),
      publicGeneratedMediaPresent: publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)),
      sourceImagesUntouched: safeGit(repoRoot, ["status", "--short", "--", "images"]) === "",
      ilovesvgUntouched: safeGit(repoRoot, ["status", "--short", "--", "ilovesvg"]) === "",
      svgUserDownloadExposed: /Download SVG|SVG download|downloadSvg|svgDownload/i.test(projectText),
      currentPublicDownloadFormats: ["PNG"],
      jpgJpegWebpControlsVisible: /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/i.test(projectText),
      adWellsVisibleByDefault: /Advertisement|Round 4U|ad density/i.test(projectText),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(projectText),
      wrongTaskContextDetected: /image-to-favicon-generator|Vite-specific output|SVG wrapper route/i.test(projectText),
    },
  };
}

async function buildReadinessAudit(state) {
  const svgStats = await folderStats(path.join(state.repoRoot, LOCAL_ASSET_ROOT, "svg"), ".svg");
  const webpStats = await folderStats(path.join(state.repoRoot, LOCAL_ASSET_ROOT, "webp"), ".webp");
  const pngStats = await folderStats(path.join(state.repoRoot, LOCAL_ASSET_ROOT, "png"), ".png");
  const thumbsStats = await folderStats(path.join(state.repoRoot, LOCAL_ASSET_ROOT, "thumbs"), ".png");
  const missingSvg = [];
  const missingWebp = [];
  const inconsistent = [];

  for (const item of state.items) {
    const svgSubpath = normalizeAssetSubpath(item.assetSubpaths?.svg);
    const webpSubpath = deriveWebpSubpath(item.assetSubpaths?.pngPreview);
    if (!svgSubpath || !existsSync(path.join(state.repoRoot, LOCAL_ASSET_ROOT, svgSubpath))) missingSvg.push(item.assetId);
    if (!webpSubpath || !existsSync(path.join(state.repoRoot, LOCAL_ASSET_ROOT, webpSubpath))) missingWebp.push(item.assetId);
    if (svgSubpath && webpSubpath) {
      const svgParts = svgSubpath.split("/");
      const webpParts = webpSubpath.split("/");
      if (svgParts[1] !== webpParts[1] || path.basename(svgSubpath, ".svg") !== path.basename(webpSubpath, ".webp")) {
        inconsistent.push({ assetId: item.assetId, svgSubpath, webpSubpath });
      }
    }
  }

  const projectText = await readProjectText(state.repoRoot, ["src", "app", "pipeline/manifests/round-5b-future-r2-upload-plan.json"]);
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      successfulRecordCount: state.items.length,
      svgCount: svgStats.fileCount,
      webpCount: webpStats.fileCount,
      svgTotalBytes: svgStats.totalBytes,
      webpTotalBytes: webpStats.totalBytes,
      pngCount: pngStats.fileCount,
      pngTotalBytes: pngStats.totalBytes,
      thumbsCount: thumbsStats.fileCount,
      thumbsTotalBytes: thumbsStats.totalBytes,
      missingSvgRecords: missingSvg.length,
      missingWebpRecords: missingWebp.length,
      filenameConsistencyIssues: inconsistent.length,
      svgWebpCompleteForAllRecords: missingSvg.length === 0 && missingWebp.length === 0 && svgStats.fileCount === state.items.length && webpStats.fileCount === state.items.length,
      pngStillReferencedForFallback: /pngPreview|Download PNG|downloadPng/i.test(projectText),
      thumbsStillReferencedForLastResortFallback: /thumbnail|thumbs/i.test(projectText),
      futureUploadManifestStillIncludesPngThumbs: /round-4e-asset-publish-manifest|pngPreview|thumbnail/.test(projectText) && /round-5b-future-r2-upload-plan/.test(projectText),
      galleryPreviewPrefersWebp: /preview:\s*webp\s*\|\|\s*png\s*\|\|\s*thumbnail/.test(readFileSync(path.join(state.repoRoot, "src/lib/coloring/assets.ts"), "utf8")),
      printPrefersInternalSvg: /convertInternalSvgToBlob|printFromHighQualitySource/.test(readFileSync(path.join(state.repoRoot, "src/lib/coloring/browserDownloads.ts"), "utf8")),
    },
    folders: {
      svg: svgStats,
      webp: webpStats,
      png: pngStats,
      thumbs: thumbsStats,
    },
    missing: {
      svgAssetIds: missingSvg.slice(0, 100),
      webpAssetIds: missingWebp.slice(0, 100),
      filenameConsistencyIssues: inconsistent.slice(0, 100),
    },
    answers: {
      isSvgWebpCompleteForAllRecords: missingSvg.length === 0 && missingWebp.length === 0,
      whatStillReferencesPng: [
        "PNG remains the visible public download format.",
        "PNG preview remains fallback when SVG conversion or WebP preview is unavailable.",
      ],
      whatStillReferencesThumbs: [
        "Thumbnail remains a last-resort display fallback in the resolver.",
        "Thumbs are not part of the Round 5C test bundle or future full upload plan.",
      ],
      whatMustChangeBeforeFinalFullUpload: [
        "Use the SVG plus WebP upload plan instead of older PNG/thumb manifests.",
        "Verify public custom-domain CORS for SVG before exposing JPG/JPEG/WebP downloads.",
        "Verify image/webp and image/svg+xml content types after upload.",
      ],
    },
  };
}

function selectRecords(state, limit) {
  const selected = [];
  const selectedIds = new Set();
  const covered = new Set();

  function add(candidate, reason) {
    if (!candidate || selectedIds.has(candidate.assetId)) return false;
    selected.push({ ...candidate, selectionReason: reason });
    selectedIds.add(candidate.assetId);
    for (const slug of candidate.hubSlugs) covered.add(slug);
    return true;
  }

  for (const seed of PRIORITY_SEEDS) {
    if (covered.has(seed.slug) && selected.length >= REQUIRED_HUB_SLUGS.length) continue;
    add(pickForHub(state, seed.slug, selectedIds, seed.match), seed.reason);
  }

  while (selected.filter((record) => record.warningFlags.length > 0).length < 5) {
    if (!add(pickAny(state, selectedIds, (candidate) => candidate.isWarning), "warning-flagged production-pass spot check")) break;
  }

  while (selected.filter((record) => record.isHighDetail).length < 5) {
    if (!add(pickAny(state, selectedIds, (candidate) => candidate.isHighDetail), "high-detail SVG plus WebP coverage")) break;
  }

  let cursor = 0;
  while (selected.length < limit) {
    const slug = REQUIRED_HUB_SLUGS[cursor % REQUIRED_HUB_SLUGS.length];
    cursor += 1;
    if (add(pickForHub(state, slug, selectedIds), `additional representative coverage for ${slug}`)) continue;
    if (cursor > REQUIRED_HUB_SLUGS.length * 2) {
      if (!add(pickAny(state, selectedIds), "deterministic fallback coverage")) break;
    }
  }

  if (selected.length !== limit) {
    throw new Error(`Expected ${limit} selected records, got ${selected.length}`);
  }

  return selected.sort((a, b) => a.assetId.localeCompare(b.assetId));
}

function pickForHub(state, slug, selectedIds, match) {
  const hub = state.hubBySlug.get(slug);
  if (!hub) return null;
  const orderedIds = [...(hub.previewAssetIds || []), ...(hub.featuredAssetIds || []), ...(hub.assetIds || [])];
  const seen = new Set();
  const candidates = orderedIds
    .filter((assetId) => {
      if (seen.has(assetId) || selectedIds.has(assetId)) return false;
      seen.add(assetId);
      return true;
    })
    .map((assetId) => state.candidates.find((candidate) => candidate.assetId === assetId))
    .filter(Boolean);

  const matched = match ? candidates.find((candidate) => match.test(`${candidate.assetId} ${candidate.displayTitle} ${candidate.filenameSlug}`)) : null;
  return matched || sortCandidatesForHub(candidates, slug)[0] || null;
}

function pickAny(state, selectedIds, predicate = () => true) {
  return state.candidates.filter((candidate) => !selectedIds.has(candidate.assetId) && predicate(candidate)).sort(sortCandidateGeneral)[0] || null;
}

function sortCandidatesForHub(candidates, slug) {
  return [...candidates].sort((a, b) => {
    const aVisible = a.hubs.find((hub) => hub.slug === slug)?.previewIndex ?? 9999;
    const bVisible = b.hubs.find((hub) => hub.slug === slug)?.previewIndex ?? 9999;
    if (aVisible !== bVisible) return aVisible - bVisible;
    if (a.warningFlags.length !== b.warningFlags.length) return b.warningFlags.length - a.warningFlags.length;
    if (a.isHighDetail !== b.isHighDetail) return a.isHighDetail ? -1 : 1;
    return a.assetId.localeCompare(b.assetId);
  });
}

function sortCandidateGeneral(a, b) {
  if (a.warningFlags.length !== b.warningFlags.length) return b.warningFlags.length - a.warningFlags.length;
  if (a.isHighDetail !== b.isHighDetail) return a.isHighDetail ? -1 : 1;
  if (a.hubs.length !== b.hubs.length) return b.hubs.length - a.hubs.length;
  return a.assetId.localeCompare(b.assetId);
}

function buildSelectionManifest(state, selectedRecords, prefix) {
  const records = selectedRecords.map((record) => ({
    assetId: record.assetId,
    displayTitle: record.displayTitle,
    category: record.category,
    hubs: record.hubs.map((hub) => ({
      hubId: hub.hubId,
      slug: hub.slug,
      title: hub.title,
      route: hub.route,
      visibleOnFirstPage: hub.visibleOnFirstPage,
    })),
    likelyPages: record.likelyPages,
    localSvgPath: record.localSvgPath,
    localWebpPath: record.localWebpPath,
    targetR2ObjectKeySvg: record.targetR2ObjectKeySvg,
    targetR2ObjectKeyWebp: record.targetR2ObjectKeyWebp,
    expectedPublicSvgUrl: record.expectedPublicSvgUrl,
    expectedPublicWebpUrl: record.expectedPublicWebpUrl,
    svgBytes: record.svgBytes,
    webpBytes: record.webpBytes,
    warningFlags: record.warningFlags,
    selectionReasons: [
      record.selectionReason,
      record.warningFlags.length ? "passed production export with warning metadata preserved" : "passed production export without warning metadata",
      record.isHighDetail ? "high-detail sample" : "representative sample",
    ],
  }));
  const coveredHubSlugs = [...new Set(records.flatMap((record) => record.hubs.map((hub) => hub.slug)))].sort();
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    purpose: "Deterministic 30-record SVG plus WebP R2 test upload selection.",
    uploadPrefix: prefix,
    expectedPublicBaseUrl: EXAMPLE_PUBLIC_BASE_URL,
    summary: {
      selectedRecordCount: records.length,
      expectedMediaFileCount: records.length * 2,
      svgFileCount: records.length,
      webpFileCount: records.length,
      pngFileCount: 0,
      thumbFileCount: 0,
      warningRecordCount: records.filter((record) => record.warningFlags.length > 0).length,
      highDetailRecordCount: records.filter((record) => record.selectionReasons.includes("high-detail sample")).length,
      coveredHubSlugs,
      quarantinedAssetsIncluded: records.filter((record) => state.quarantinedAssetIds.has(record.assetId)).length,
      sourceImagesIncluded: 0,
    },
    records,
  };
}

function buildBundleEntries(selectedRecords, prefix, uploadRoot) {
  const entries = [];
  for (const record of selectedRecords) {
    entries.push({
      assetId: record.assetId,
      displayTitle: record.displayTitle,
      mediaType: "svg",
      sourceLocalRelativePath: record.localSvgPath,
      uploadBundleRelativePath: path.posix.join(uploadRoot, record.svgSubpath),
      r2ObjectKey: path.posix.join(prefix, record.svgSubpath),
      expectedPublicUrl: record.expectedPublicSvgUrl,
      contentType: "image/svg+xml",
      fileSize: record.svgBytes,
      recommendedCacheControl: IMMUTABLE_CACHE_POLICY,
      internalOnly: true,
      galleryFacing: false,
    });
    entries.push({
      assetId: record.assetId,
      displayTitle: record.displayTitle,
      mediaType: "webp",
      sourceLocalRelativePath: record.localWebpPath,
      uploadBundleRelativePath: path.posix.join(uploadRoot, record.webpSubpath),
      r2ObjectKey: path.posix.join(prefix, record.webpSubpath),
      expectedPublicUrl: record.expectedPublicWebpUrl,
      contentType: "image/webp",
      fileSize: record.webpBytes,
      recommendedCacheControl: IMMUTABLE_CACHE_POLICY,
      internalOnly: false,
      galleryFacing: true,
    });
  }
  return entries.sort((a, b) => a.r2ObjectKey.localeCompare(b.r2ObjectKey));
}

function buildBundlePlan(state, selection, entries, uploadRoot, prefix, mode) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    uploadBundleRoot: uploadRoot,
    uploadPrefix: prefix,
    materializationMode: mode,
    includedFolders: ["svg", "webp"],
    excludedFolders: ["png", "thumbs"],
    summary: {
      selectedRecordCount: selection.summary.selectedRecordCount,
      expectedMediaFileCount: entries.length,
      expectedSvgFiles: entries.filter((entry) => entry.mediaType === "svg").length,
      expectedWebpFiles: entries.filter((entry) => entry.mediaType === "webp").length,
      expectedPngFiles: 0,
      expectedThumbFiles: 0,
      expectedTotalBytes: sumBytes(entries),
      fullLibraryRecordCount: state.items.length,
      fullUploadBundled: false,
      uploadsPerformed: false,
      modifiesSourceBundle: false,
      copiesIntoPublic: false,
    },
    entries,
  };
}

async function materializeBundleFiles({ repoRoot, mode, entries }) {
  let linkedFileCount = 0;
  let copiedFileCount = 0;
  const failedFiles = [];
  for (const entry of entries) {
    const sourcePath = path.resolve(repoRoot, ...entry.sourceLocalRelativePath.split("/"));
    const targetPath = path.resolve(repoRoot, ...entry.uploadBundleRelativePath.split("/"));
    assertPathInside(sourcePath, path.join(repoRoot, LOCAL_ASSET_ROOT), "Round 5C source file");
    assertPathInside(targetPath, path.join(repoRoot, TEST_UPLOAD_ROOT), "Round 5C bundle target");
    await mkdir(path.dirname(targetPath), { recursive: true });
    await rm(targetPath, { force: true });
    try {
      if (mode === "copy") {
        await copyFile(sourcePath, targetPath);
        copiedFileCount += 1;
      } else {
        await link(sourcePath, targetPath);
        linkedFileCount += 1;
      }
    } catch (error) {
      try {
        await copyFile(sourcePath, targetPath);
        copiedFileCount += 1;
      } catch (copyError) {
        failedFiles.push({
          assetId: entry.assetId,
          mediaType: entry.mediaType,
          sourceLocalRelativePath: entry.sourceLocalRelativePath,
          uploadBundleRelativePath: entry.uploadBundleRelativePath,
          linkError: String(error?.message || error),
          copyError: String(copyError?.message || copyError),
        });
      }
    }
  }
  return { modeRequested: mode, linkedFileCount, copiedFileCount, failedFiles };
}

async function buildBundleResults(selection, entries, materialized, uploadRoot, prefix, repoRoot) {
  const files = await listFiles(path.join(repoRoot, uploadRoot));
  const relativeFiles = files.map((file) => slash(path.relative(repoRoot, file)));
  const svgCount = relativeFiles.filter((file) => file.endsWith(".svg")).length;
  const webpCount = relativeFiles.filter((file) => file.endsWith(".webp")).length;
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    uploadBundleRoot: uploadRoot,
    uploadPrefix: prefix,
    summary: {
      selectedRecordCount: selection.summary.selectedRecordCount,
      createdMediaFileCount: relativeFiles.length,
      totalSvgFiles: svgCount,
      totalWebpFiles: webpCount,
      totalPngFiles: relativeFiles.filter((file) => file.includes("/png/") || file.endsWith(".png")).length,
      totalThumbFiles: relativeFiles.filter((file) => file.includes("/thumbs/")).length,
      totalBundleBytesRepresented: sumBytes(entries),
      linkedFileCount: materialized.linkedFileCount,
      copiedFileCount: materialized.copiedFileCount,
      failedFileCount: materialized.failedFiles.length,
      includesOnlySvgAndWebp: relativeFiles.every((file) => /\.(svg|webp)$/i.test(file)),
      uploadCommandRun: false,
      fullLibraryBundled: false,
      publicMediaCopied: false,
    },
    files: relativeFiles.sort(),
    failures: materialized.failedFiles,
  };
}

function buildUploadChecklist(selection, entries, uploadRoot, prefix) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    exactLocalFolderToUpload: uploadRoot,
    uploadToBucketRootInstruction: "Upload pipeline/r2-upload-test-svg-webp/coloring-pages to the bucket root so object keys start with coloring-pages/svg and coloring-pages/webp.",
    targetR2ObjectPrefix: prefix,
    expectedNextPublicAssetBaseUrl: EXAMPLE_PUBLIC_BASE_URL,
    temporaryR2DevAllowedForTestingOnly: true,
    doNotUpload: ["png/", "thumbs/", "pipeline/r2-upload/coloring-pages full library", "public/", "credentials"],
    avoidDoublePrefix: "Do not upload the coloring-pages folder into an existing coloring-pages prefix, because that creates coloring-pages/coloring-pages.",
    requiredContentTypes: {
      svg: "image/svg+xml",
      webp: "image/webp",
    },
    requiredCors: {
      reason: "Browser-side SVG-to-canvas conversion needs an origin-clean canvas.",
      methods: ["GET", "HEAD"],
      origins: ["http://localhost:3005", "http://127.0.0.1:3005", "final production site origin"],
    },
    expectedFileCounts: {
      records: selection.summary.selectedRecordCount,
      svg: 30,
      webp: 30,
      total: entries.length,
    },
    sampleObjectKeys: entries.slice(0, 12).map((entry) => ({
      mediaType: entry.mediaType,
      r2ObjectKey: entry.r2ObjectKey,
      contentType: entry.contentType,
    })),
  };
}

function buildUrlVerificationPlan(selection, entries, prefix) {
  const records = selection.records.map((record) => ({
    assetId: record.assetId,
    displayTitle: record.displayTitle,
    category: record.category,
    hubs: record.hubs.map((hub) => ({ slug: hub.slug, route: hub.route, title: hub.title })),
    likelyPages: record.likelyPages,
    urls: entries
      .filter((entry) => entry.assetId === record.assetId)
      .map((entry) => verificationEntry(entry)),
  }));
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    purpose: "Public URL checks to run after manually uploading the 30-record SVG plus WebP R2 test bundle.",
    uploadPrefix: prefix,
    publicBaseUrlTemplate: EXAMPLE_PUBLIC_BASE_URL,
    expectedStatus: 200,
    expectedNoPrivateEndpointRedirects: true,
    summary: {
      selectedRecordCount: selection.summary.selectedRecordCount,
      plannedUrlCount: entries.length,
      svgUrlCount: entries.filter((entry) => entry.mediaType === "svg").length,
      webpUrlCount: entries.filter((entry) => entry.mediaType === "webp").length,
      pngUrlCount: 0,
      thumbUrlCount: 0,
      representativeHubSlugs: selection.summary.coveredHubSlugs,
    },
    records,
    allUrls: entries.map((entry) => verificationEntry(entry)),
  };
}

function verificationEntry(entry) {
  const tolerance = Math.max(512, Math.ceil(entry.fileSize * 0.05));
  return {
    assetId: entry.assetId,
    displayTitle: entry.displayTitle,
    mediaType: entry.mediaType,
    url: entry.expectedPublicUrl,
    r2ObjectKey: entry.r2ObjectKey,
    expectedHttpStatus: 200,
    expectedContentType: entry.contentType,
    expectedCacheControl: entry.recommendedCacheControl,
    expectedCorsRequired: entry.mediaType === "svg",
    galleryFacing: entry.galleryFacing,
    internalOnly: entry.internalOnly,
    expectedByteSizeRange: {
      min: Math.max(0, entry.fileSize - tolerance),
      max: entry.fileSize + tolerance,
    },
  };
}

function buildPendingPublicUrlResults(urlPlan) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    sourcePlan: MANIFESTS.urlPlan,
    summary: {
      status: "not_run",
      publicBaseUrlConfigured: false,
      publicBaseUrlIsLocalhost: false,
      publicUrlVerificationPassed: false,
      plannedUrlCount: urlPlan.summary.plannedUrlCount,
      svgUrlCount: urlPlan.summary.svgUrlCount,
      webpUrlCount: urlPlan.summary.webpUrlCount,
      status200Count: 0,
      contentTypePassCount: 0,
      svgCorsPassCount: 0,
      webpCorsDocumentedCount: 0,
      noPrivateEndpointRedirect: true,
      noAccessDeniedXml: true,
      noCloudflareErrorHtml: true,
    },
    checks: [],
    blockers: ["Public SVG plus WebP test assets have not been uploaded or configured for verification yet."],
  };
}

function buildPendingBrowserSvgWebpQa() {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      publicBrowserQaStatus: "not_run",
      publicTestAssetsUploaded: false,
      publicWebpRenders: false,
      publicSvgCanvasConversionPassed: false,
      printUsesGeneratedOutputWhenCorsPasses: false,
      publicFallbackWorksForMissingAssets: false,
      svgUserDownloadAbsent: true,
      jpgJpegWebpControlsAbsent: true,
      pngOnlyDownloadsRemain: true,
    },
    pages: [],
    screenshots: [],
    blockers: ["Public test assets must be uploaded and NEXT_PUBLIC_COLORING_ASSET_BASE_URL must point at that public asset base before public browser QA can run."],
  };
}

function buildFutureFullUploadPlan(readiness) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    finalR2Folders: ["svg", "webp"],
    excludedFolders: ["png", "thumbs"],
    expectedObjectKeyStructure: [
      "coloring-pages/svg/<category>/<filename>.svg",
      "coloring-pages/webp/<category>/<filename>.webp",
    ],
    summary: {
      usesSvgAndWebpOnly: true,
      fullUploadDeferred: true,
      totalPlannedFiles: readiness.summary.svgCount + readiness.summary.webpCount,
      totalPlannedBytes: readiness.summary.svgTotalBytes + readiness.summary.webpTotalBytes,
      svgFiles: readiness.summary.svgCount,
      webpFiles: readiness.summary.webpCount,
      excludesPngFiles: readiness.summary.pngCount,
      excludesThumbFiles: readiness.summary.thumbsCount,
      publicCorsRequiredBeforeJpgJpegWebpDownloads: true,
      imageSitemapDeferred: true,
      openGraphImageDeferred: true,
      uploadCommandRun: false,
    },
    launchDependencies: [
      "Final public asset base URL must be stable.",
      "SVG content type must be image/svg+xml.",
      "WebP content type must be image/webp.",
      "CORS must allow the production site origin before browser export controls expand.",
      "Cache headers should be verified before launch.",
    ],
  };
}

function buildCorsGuide() {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    officialSources: [CLOUDFLARE_R2_CORS_DOC],
    requiredContentTypes: {
      svg: "image/svg+xml",
      webp: "image/webp",
    },
    corsRequirements: {
      svg: "required for internal SVG-to-canvas conversion and future online coloring reads",
      webp: "not required for normal image display, but recommended if future canvas flows use WebP",
      allowedOrigins: ["http://localhost:3005", "http://127.0.0.1:3005", "final production site origin"],
      allowedMethods: ["GET", "HEAD"],
      allowedHeaders: ["Origin", "Range"],
      exposeHeaders: ["Content-Type", "Content-Length", "Cache-Control", "ETag"],
      maxAgeSeconds: 3600,
    },
    examplePolicy: [
      {
        AllowedOrigins: ["http://localhost:3005", "http://127.0.0.1:3005", "https://YOUR-SITE-DOMAIN.com"],
        AllowedMethods: ["GET", "HEAD"],
        AllowedHeaders: ["Origin", "Range"],
        ExposeHeaders: ["Content-Type", "Content-Length", "Cache-Control", "ETag"],
        MaxAgeSeconds: 3600,
      },
    ],
    notes: [
      "No credentials are needed for public static image reads.",
      "SVG is public-addressable for app internals but must not be presented as a visible download format.",
      "Use a custom asset domain for production. r2.dev is temporary testing only.",
      "Verify with the Round 5C public URL verifier after manual upload.",
    ],
  };
}

function buildAssetStrategyResults(readiness, selection, bundleResults) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      svgWebpReadinessComplete: readiness.summary.svgWebpCompleteForAllRecords,
      svgWebpTestBundleCreated: true,
      testBundleRecordCount: selection.summary.selectedRecordCount,
      testBundleFileCount: bundleResults.summary.createdMediaFileCount,
      testBundleTotalBytes: bundleResults.summary.totalBundleBytesRepresented,
      pngThumbsIncludedInTestBundle: false,
      webpGalleryPreviewWorksLocally: readiness.summary.galleryPreviewPrefersWebp,
      publicUrlVerificationRan: false,
      publicCorsPassed: false,
      jpgJpegWebpControlsRemainDeferred: true,
      finalFullUploadUsesSvgWebpOnly: true,
      fullUploadDeferred: true,
    },
    decisions: [
      "Round 5C creates a small SVG plus WebP test bundle only.",
      "The full upload plan remains SVG plus WebP only.",
      "PNG and thumbs stay untouched locally but are excluded from new test and future full upload plans.",
      "Public CORS must pass before JPG/JPEG/WebP controls are exposed.",
    ],
  };
}

function buildPendingBrowserQa() {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      browserQaCompleted: false,
      localPreviewInspected: false,
      publicPreviewInspected: false,
      galleryUsesWebpWhereAvailable: false,
      fallbackWorks: true,
      printStillWorks: false,
      pngDownloadStillWorks: false,
      svgDownloadAbsent: true,
      jpgJpegWebpControlsAbsent: true,
      adDensityMatchesRound4U: true,
      horizontalOverflowDetected: null,
      appApiRoutePresent: false,
    },
    pages: [],
    screenshotPaths: [],
    note: "Pending local/browser QA. The Round 5C browser runner or manual preview updates this evidence after a static preview is available.",
  };
}

function validateSelection(selection, entries, prefix) {
  if (selection.summary.selectedRecordCount !== DEFAULT_LIMIT) throw new Error("Round 5C selection must contain 30 records.");
  if (entries.length !== DEFAULT_LIMIT * 2) throw new Error("Round 5C bundle must contain 60 planned entries.");
  if (selection.summary.quarantinedAssetsIncluded !== 0) throw new Error("Round 5C selected a quarantined asset.");
  for (const slug of ["animals", "anime-girls", "chibi", "fantasy", "christmas", "halloween", "geometric", "plushies"]) {
    if (!selection.summary.coveredHubSlugs.includes(slug)) throw new Error(`Round 5C selection does not cover ${slug}`);
  }
  for (const entry of entries) {
    assertSafeRelativePath(entry.sourceLocalRelativePath);
    assertSafeRelativePath(entry.uploadBundleRelativePath);
    assertSafeRelativePath(entry.r2ObjectKey);
    if (!entry.r2ObjectKey.startsWith(`${prefix}/svg/`) && !entry.r2ObjectKey.startsWith(`${prefix}/webp/`)) {
      throw new Error(`Unexpected Round 5C object key: ${entry.r2ObjectKey}`);
    }
    if (entry.r2ObjectKey.includes("/png/") || entry.r2ObjectKey.includes("/thumbs/")) throw new Error(`Forbidden media folder in object key: ${entry.r2ObjectKey}`);
    if (!["image/svg+xml", "image/webp"].includes(entry.contentType)) throw new Error(`Unexpected content type: ${entry.contentType}`);
    if (!entry.fileSize || entry.fileSize <= 0) throw new Error(`Missing file size for ${entry.r2ObjectKey}`);
  }
}

function renderProjectContextReport(context) {
  return `# Round 5C Project Context Check

- Repository: ${context.summary.packageName}
- Branch: ${context.summary.branch}
- HEAD: ${context.summary.head}
- Round 5B commit exists: ${context.summary.round5bCommitExists}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api present: ${context.summary.appApiRoutePresent}
- Local SVG folder exists: ${context.summary.localSvgFolderExists}
- Local WebP folder exists: ${context.summary.localWebpFolderExists}
- Current public downloads: ${context.summary.currentPublicDownloadFormats.join(", ")}
- SVG user download exposed: ${context.summary.svgUserDownloadExposed}
- JPG/JPEG/WebP controls visible: ${context.summary.jpgJpegWebpControlsVisible}
- Live AdSense code present: ${context.summary.liveAdSenseCodePresent}
`;
}

function renderReadinessReport(audit) {
  return `# Round 5C SVG + WebP Readiness Audit

- Successful records: ${audit.summary.successfulRecordCount.toLocaleString()}
- SVG files: ${audit.summary.svgCount.toLocaleString()} (${formatBytes(audit.summary.svgTotalBytes)})
- WebP files: ${audit.summary.webpCount.toLocaleString()} (${formatBytes(audit.summary.webpTotalBytes)})
- Missing SVG records: ${audit.summary.missingSvgRecords}
- Missing WebP records: ${audit.summary.missingWebpRecords}
- Filename consistency issues: ${audit.summary.filenameConsistencyIssues}
- SVG + WebP complete for all records: ${audit.summary.svgWebpCompleteForAllRecords}
- PNG still referenced for fallback: ${audit.summary.pngStillReferencedForFallback}
- Thumbs still referenced for last-resort fallback: ${audit.summary.thumbsStillReferencedForLastResortFallback}
- Gallery preview prefers WebP: ${audit.summary.galleryPreviewPrefersWebp}

Before the final full upload, use the SVG plus WebP plan instead of the older PNG/thumb manifests and verify public CORS on the asset domain.
`;
}

function renderBundleReport(selection, results) {
  return `# Round 5C SVG + WebP Test Bundle Report

- Test records: ${selection.summary.selectedRecordCount}
- Media files: ${results.summary.createdMediaFileCount}
- SVG files: ${results.summary.totalSvgFiles}
- WebP files: ${results.summary.totalWebpFiles}
- PNG files: ${results.summary.totalPngFiles}
- Thumb files: ${results.summary.totalThumbFiles}
- Total represented bytes: ${results.summary.totalBundleBytesRepresented}
- Bundle root: \`${results.uploadBundleRoot}\`
- Upload command run: ${results.summary.uploadCommandRun}

The local bundle includes only SVG and WebP files. It does not include PNG previews or thumbnails.
`;
}

function renderUploadGuide(checklist) {
  return `# Round 5C SVG + WebP Manual Upload Guide

Upload this folder:

\`\`\`text
${checklist.exactLocalFolderToUpload}
\`\`\`

Upload to the bucket root so keys start with:

\`\`\`text
coloring-pages/svg/
coloring-pages/webp/
\`\`\`

Do not upload \`png/\` or \`thumbs/\`. Do not upload the full library in this round.

Set the app asset base after manual upload:

\`\`\`text
NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://YOUR-ASSET-DOMAIN.com/coloring-pages
\`\`\`

Temporary \`r2.dev\` can be used for testing only. A custom asset domain remains the preferred production path.

Required content types:

- SVG: \`image/svg+xml\`
- WebP: \`image/webp\`

Required CORS methods: ${checklist.requiredCors.methods.join(", ")}
`;
}

function renderUrlPlanReport(plan) {
  return `# Round 5C SVG + WebP URL Verification Plan

- Planned URLs: ${plan.summary.plannedUrlCount}
- SVG URLs: ${plan.summary.svgUrlCount}
- WebP URLs: ${plan.summary.webpUrlCount}
- PNG URLs: ${plan.summary.pngUrlCount}
- Thumb URLs: ${plan.summary.thumbUrlCount}
- Expected public base: \`${plan.publicBaseUrlTemplate}\`

WebP is the public gallery preview format. SVG is public-addressable for app internals, print conversion, and future coloring, but it must not be exposed as a visible user download.
`;
}

function renderFutureFullUploadReport(plan) {
  return `# Round 5C Future Full Upload Plan

Final full upload folders:

- svg/
- webp/

Excluded folders:

- png/
- thumbs/

- Planned files: ${plan.summary.totalPlannedFiles.toLocaleString()}
- Planned bytes: ${formatBytes(plan.summary.totalPlannedBytes)}
- Full upload deferred: ${plan.summary.fullUploadDeferred}
- Public CORS required before JPG/JPEG/WebP downloads: ${plan.summary.publicCorsRequiredBeforeJpgJpegWebpDownloads}
- Image sitemap deferred: ${plan.summary.imageSitemapDeferred}
- Open Graph image work deferred: ${plan.summary.openGraphImageDeferred}

No upload should happen in Round 5C.
`;
}

function renderCorsGuideReport(guide) {
  return `# Round 5C R2 CORS and Content-Type Guide

- Cloudflare R2 CORS docs: ${guide.officialSources.join(", ")}
- SVG content type: \`${guide.requiredContentTypes.svg}\`
- WebP content type: \`${guide.requiredContentTypes.webp}\`
- SVG CORS: ${guide.corsRequirements.svg}
- WebP CORS: ${guide.corsRequirements.webp}
- Allowed origins: ${guide.corsRequirements.allowedOrigins.join(", ")}
- Allowed methods: ${guide.corsRequirements.allowedMethods.join(", ")}
- Allowed headers: ${guide.corsRequirements.allowedHeaders.join(", ")}
- Exposed headers: ${guide.corsRequirements.exposeHeaders.join(", ")}
- Max age seconds: ${guide.corsRequirements.maxAgeSeconds}

Example policy:

\`\`\`json
${JSON.stringify(guide.examplePolicy, null, 2)}
\`\`\`
`;
}

function renderAssetStrategyReport(strategy) {
  return `# Round 5C Asset Strategy Report

- SVG + WebP readiness complete: ${strategy.summary.svgWebpReadinessComplete}
- SVG + WebP test bundle created: ${strategy.summary.svgWebpTestBundleCreated}
- Test bundle records: ${strategy.summary.testBundleRecordCount}
- Test bundle files: ${strategy.summary.testBundleFileCount}
- Test bundle bytes: ${strategy.summary.testBundleTotalBytes}
- PNG/thumbs included in test bundle: ${strategy.summary.pngThumbsIncludedInTestBundle}
- Public URL verification ran: ${strategy.summary.publicUrlVerificationRan}
- Public CORS passed: ${strategy.summary.publicCorsPassed}
- JPG/JPEG/WebP controls remain deferred: ${strategy.summary.jpgJpegWebpControlsRemainDeferred}
- Final full upload uses SVG + WebP only: ${strategy.summary.finalFullUploadUsesSvgWebpOnly}
- Full upload deferred: ${strategy.summary.fullUploadDeferred}
`;
}

function renderBrowserQaReport(browserQa) {
  return `# Round 5C Browser QA Report

- Completed: ${browserQa.summary.browserQaCompleted}
- Local preview inspected: ${browserQa.summary.localPreviewInspected}
- Public preview inspected: ${browserQa.summary.publicPreviewInspected}
- Gallery uses WebP where available: ${browserQa.summary.galleryUsesWebpWhereAvailable}
- Print still works: ${browserQa.summary.printStillWorks}
- PNG download still works: ${browserQa.summary.pngDownloadStillWorks}
- SVG download absent: ${browserQa.summary.svgDownloadAbsent}
- JPG/JPEG/WebP controls absent: ${browserQa.summary.jpgJpegWebpControlsAbsent}
- Horizontal overflow detected: ${browserQa.summary.horizontalOverflowDetected}

Screenshots:

${browserQa.screenshotPaths.length ? browserQa.screenshotPaths.map((item) => `- \`${item}\``).join("\n") : "- Pending"}
`;
}

function renderNextPhasePlan() {
  return `# Round 5C Next Phase Plan

Round 5D should use the 30-record SVG plus WebP test bundle for manual R2 upload and public URL verification.

Recommended Round 5D sequence:

- Upload only the 30-record SVG plus WebP test bundle.
- Verify \`image/svg+xml\` and \`image/webp\` content types.
- Verify CORS on SVG from the local preview origin and final site origin when known.
- Build the static app with the public test asset base.
- Confirm selected WebP gallery previews render from the public asset base.
- Confirm SVG-to-canvas conversion works against public SVG URLs before exposing JPG/JPEG/WebP controls.

Keep full media upload, image sitemap, Open Graph images, live AdSense, and backend routes out of scope until public assets are final.
`;
}

function sumBytes(entries) {
  return entries.reduce((sum, entry) => sum + Number(entry.fileSize || 0), 0);
}

async function folderStats(root, extension) {
  const exists = existsSync(root);
  const files = exists ? (await listFiles(root)).filter((file) => path.extname(file).toLowerCase() === extension) : [];
  let totalBytes = 0;
  const largestFiles = [];
  const byCategory = {};
  for (const file of files) {
    const fileStat = await stat(file);
    totalBytes += fileStat.size;
    largestFiles.push({ path: slash(path.relative(REPO_ROOT, file)), bytes: fileStat.size });
    const relative = slash(path.relative(root, file));
    const category = relative.includes("/") ? relative.split("/")[0] : "(root)";
    byCategory[category] = (byCategory[category] || 0) + 1;
  }
  largestFiles.sort((a, b) => b.bytes - a.bytes);
  return {
    folder: slash(path.relative(REPO_ROOT, root)),
    exists,
    extension,
    fileCount: files.length,
    totalBytes,
    averageBytes: files.length ? Math.round(totalBytes / files.length) : 0,
    categoryCount: Object.keys(byCategory).length,
    filesByCategory: byCategory,
    largestFiles: largestFiles.slice(0, 10),
  };
}

async function listFiles(root) {
  if (!existsSync(root)) return [];
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [root];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(absolute);
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(repoRoot, relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const root = path.join(repoRoot, relativeRoot);
    for (const file of await listFiles(root)) {
      const relative = slash(path.relative(repoRoot, file));
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (relative.startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readFile(file, "utf8"));
    }
  }
  return chunks.join("\n");
}

function deriveWebpSubpath(pngPreviewSubpath) {
  const normalized = normalizeAssetSubpath(pngPreviewSubpath);
  if (!normalized || !normalized.startsWith("png/") || !normalized.toLowerCase().endsWith(".png")) return "";
  return `webp/${normalized.slice("png/".length).replace(/\.png$/i, ".webp")}`;
}

function normalizeAssetSubpath(value) {
  if (!value) return "";
  return slash(String(value)).replace(/^\/+/, "");
}

function encodeAssetSubpath(value) {
  return value.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function assertSafeRelativePath(value) {
  const normalized = slash(String(value || ""));
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.includes(":") ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe relative path: ${value}`);
  }
}

function resolveSafeUnder(repoRoot, relativePath, allowedRoot) {
  assertSafeRelativePath(relativePath);
  const resolved = path.resolve(repoRoot, ...slash(relativePath).split("/"));
  assertPathInside(resolved, allowedRoot, relativePath);
  return resolved;
}

function assertPathInside(targetPath, allowedRoot, label) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedAllowed = path.resolve(allowedRoot);
  const relative = path.relative(resolvedAllowed, resolvedTarget);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw new Error(`${label} is outside allowed root: ${resolvedTarget}`);
}

function normalizePrefix(value) {
  const normalized = slash(String(value || "")).replace(/^\/+|\/+$/g, "");
  assertSafeRelativePath(normalized);
  if (normalized !== DEFAULT_PREFIX) throw new Error(`Round 5C only supports prefix ${DEFAULT_PREFIX}. Received ${value}`);
  return normalized;
}

async function readJson(repoRoot, relativePath) {
  return JSON.parse(await readText(repoRoot, relativePath));
}

async function readJsonIfExists(repoRoot, relativePath) {
  const target = path.join(repoRoot, relativePath);
  if (!existsSync(target)) return null;
  return JSON.parse(await readFile(target, "utf8"));
}

async function readText(repoRoot, relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function writeJson(repoRoot, relativePath, payload) {
  const target = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(repoRoot, relativePath, text) {
  const target = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text, "utf8");
}

function statSyncSafe(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function safeGit(repoRoot, args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function gitCommitExists(repoRoot, revision) {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${revision}^{commit}`], { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--clean") options.clean = true;
    else if (arg === "--copy") options.copy = true;
    else if (arg === "--limit") options.limit = Number(args[++index]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.split("=")[1]);
    else if (arg === "--prefix") options.prefix = args[++index];
    else if (arg.startsWith("--prefix=")) options.prefix = arg.split("=")[1];
    else throw new Error(`Unknown Round 5C option: ${arg}`);
  }
  return options;
}

function slash(value) {
  return String(value).replace(/\\/g, "/");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

async function main() {
  const result = await runRound5CSvgWebpTestBundle(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({
    runId: RUN_ID,
    selectedRecords: result.selection.summary.selectedRecordCount,
    mediaFiles: result.bundleResults.summary.createdMediaFileCount,
    svgFiles: result.bundleResults.summary.totalSvgFiles,
    webpFiles: result.bundleResults.summary.totalWebpFiles,
    totalBytes: result.bundleResults.summary.totalBundleBytesRepresented,
    bundleRoot: result.bundleResults.uploadBundleRoot,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
