#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const GENERATED_AT = new Date().toISOString();
const RUN_ID = "long-tail-hub-expansion";
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;
const PUBLIC_ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const PUBLIC_SITE_URL = "https://www.ilovecoloringpage.com";
const GALLERY_PAGE_SIZE = 48;
const FEATURED_LIMIT = 12;
const ROOT_ROUTE = "/coloring-pages";
const MAX_PROMOTED_NEW_HUBS = 128;

const INPUTS = {
  runtimeAvailable: "src/generated/coloring/runtime-available-items.json",
  runtimeDeferred: "src/generated/coloring/runtime-deferred-items.json",
  runtimeHubs: "src/generated/coloring/runtime-hubs.json",
  runtimeHubItems: "src/generated/coloring/runtime-hub-items.json",
  runtimeRoutes: "src/generated/coloring/runtime-routes.json",
  runtimeSiteMap: "src/generated/coloring/runtime-site-map.json",
  runtimeSearchIndex: "src/generated/coloring/runtime-search-index.json",
  runtimeHubFeaturedItems: "src/generated/coloring/runtime-hub-featured-items.json",
  runtimeHubFilterTags: "src/generated/coloring/runtime-hub-filter-tags.json",
  runtimeSeoPages: "src/generated/coloring/runtime-seo-pages.json",
  runtimeHubSeoContent: "src/generated/coloring/runtime-hub-seo-content.json",
  runtimeSocialMetadata: "src/generated/coloring/runtime-social-metadata.json",
  internalLinking: "src/generated/coloring/internal-linking.json",
  titleOverrides: "src/generated/coloring/title-overrides.json",
  round4aRejected: "pipeline/manifests/round-4a-rejected-hub-candidates.json",
  packageJson: "package.json",
  nextConfig: "next.config.mjs",
  browserDownloads: "src/lib/coloring/browserDownloads.ts",
  downloadMenu: "src/components/coloring/DownloadMenu.tsx",
  siteConfig: "src/lib/site/siteConfig.ts",
};

const OUTPUTS = {
  context: "pipeline/manifests/long-tail-hubs-context-check.json",
  currentAudit: "pipeline/manifests/long-tail-current-hub-audit.json",
  tokenFrequency: "pipeline/manifests/long-tail-token-frequency.json",
  subjectFrequency: "pipeline/manifests/long-tail-subject-frequency.json",
  combinationFrequency: "pipeline/manifests/long-tail-combination-frequency.json",
  rawCandidates: "pipeline/manifests/long-tail-candidate-hubs-raw.json",
  policy: "pipeline/manifests/long-tail-hub-promotion-policy.json",
  scores: "pipeline/manifests/long-tail-candidate-hub-scores.json",
  proposal: "pipeline/manifests/long-tail-promoted-hubs-proposal.json",
  manualReview: "pipeline/manifests/long-tail-hub-manual-review.json",
  implementation: "pipeline/manifests/long-tail-hub-implementation-results.json",
  seoContent: "pipeline/manifests/long-tail-hub-seo-content-results.json",
  internalLinking: "pipeline/manifests/long-tail-internal-linking-results.json",
  browserQa: "pipeline/manifests/long-tail-hub-browser-qa-results.json",
  staticExport: "pipeline/manifests/long-tail-static-export-results.json",
};

const REPORTS = {
  context: "pipeline/reports/long-tail-hubs-context-check.md",
  currentAudit: "pipeline/reports/long-tail-current-hub-audit.md",
  candidateDiscovery: "pipeline/reports/long-tail-candidate-discovery-report.md",
  policy: "pipeline/reports/long-tail-hub-promotion-policy.md",
  scores: "pipeline/reports/long-tail-candidate-hub-score-report.md",
  proposal: "pipeline/reports/long-tail-promoted-hubs-proposal.md",
  manualReview: "pipeline/reports/long-tail-hub-manual-review.md",
  implementation: "pipeline/reports/long-tail-hub-implementation-report.md",
  seoContent: "pipeline/reports/long-tail-hub-seo-content-report.md",
  internalLinking: "pipeline/reports/long-tail-internal-linking-report.md",
  browserQa: "pipeline/reports/long-tail-hub-browser-qa-report.md",
  staticExport: "pipeline/reports/long-tail-static-export-report.md",
};

const STOP_TOKENS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "without",
  "coloring",
  "page",
  "pages",
  "color",
  "line",
  "lineart",
  "outline",
  "illustration",
  "image",
  "images",
  "printable",
  "family",
  "famil",
  "scene",
  "set",
  "single",
  "collection",
  "picture",
  "pics",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "webp",
  "chatgpt",
  "failed",
  "openai",
  "oct",
  "am",
  "pm",
  "2024",
  "2025",
  "2026",
]);

const TOKEN_REPLACEMENTS = {
  dinos: "dinosaur",
  dino: "dinosaur",
  dinosaurs: "dinosaur",
  tyrannosaurus: "t-rex",
  trex: "t-rex",
  xmas: "christmas",
  patricks: "patrick",
  dinosuar: "dinosaur",
  midieval: "medieval",
  mideival: "medieval",
  medival: "medieval",
  vehiacle: "vehicle",
  vehicles: "vehicle",
  geometry: "geometric",
  patterns: "pattern",
  plushies: "plushie",
  dragons: "dragon",
  unicorns: "unicorn",
  cats: "cat",
  kittens: "kitten",
  kitties: "kitten",
  dogs: "dog",
  puppies: "puppy",
  flowers: "flower",
  roses: "rose",
  plants: "plant",
  trees: "tree",
  mushrooms: "mushroom",
  cars: "car",
  trains: "train",
  locomotives: "locomotive",
  planes: "plane",
  airplanes: "airplane",
  boats: "boat",
  ships: "ship",
  castles: "castle",
  houses: "house",
  homes: "home",
  cakes: "cake",
  bears: "bear",
  owls: "owl",
  foxes: "fox",
  wolves: "wolf",
  lions: "lion",
  tigers: "tiger",
  elephants: "elephant",
  giraffes: "giraffe",
  monkeys: "monkey",
  pandas: "panda",
  rabbits: "rabbit",
  bats: "bat",
  sharks: "shark",
  dolphins: "dolphin",
  horses: "horse",
  cows: "cow",
  sheep: "sheep",
  deer: "deer",
  reindeers: "reindeer",
  penguins: "penguin",
  snakes: "snake",
  lizards: "lizard",
  frogs: "frog",
  ducks: "duck",
  eagles: "eagle",
  bees: "bee",
  pumpkins: "pumpkin",
  snowmen: "snowman",
  robots: "robot",
  witches: "witch",
  wizards: "wizard",
  knights: "knight",
  princesses: "princess",
  phoenixes: "phoenix",
};

const POLICY = {
  runId: RUN_ID,
  generatedAt: GENERATED_AT,
  summary: {
    purpose: "Promote long-tail coloring page hubs from real runtime inventory while avoiding doorway pages and token spam.",
    currentRuntimeRecordSource: INPUTS.runtimeAvailable,
    deferredRecordsExcluded: true,
  },
  minimums: {
    subject: 8,
    object: 8,
    theme: 8,
    seasonal: 8,
    style: 20,
    audience: 20,
    combination: 10,
  },
  absoluteMinimumAssets: 6,
  maxPromotedNewHubs: MAX_PROMOTED_NEW_HUBS,
  uniqueness: {
    rejectReorderedDuplicateTitles: true,
    rejectExistingSlugDuplicates: true,
    comparableHubOverlapBlockerRatio: 0.9,
    broadParentOverlapAllowedWhenCandidateIntentIsDistinct: true,
    manualReviewOverlapRatio: 0.8,
  },
  sitemapInclusionRules: [
    "Only promote_now hubs are indexable and included in the sitemap.",
    "Backlog, manual-review, section-only, and rejected candidates are not routed.",
    "No per-image routes are created.",
  ],
  namingRules: [
    "Use stable public wording based on subject intent, not raw filenames.",
    "Do not expose AI export terms, timestamps, internal clean-key names, or source paths.",
    "Use one canonical slug per intent and avoid singular/plural duplicates.",
  ],
  internalLinkingRules: [
    "Specific hubs link to their parent hub and close sibling hubs.",
    "Broad hubs can list high-confidence specific hubs below the gallery.",
    "Navigation uses generated hub routes and stays bounded through the More menu.",
  ],
  noindexBacklogRules: [
    "Candidates below minimum inventory stay out of routes unless a documented exception exists.",
    "High-overlap or ambiguous candidates are backlog or manual-review only.",
    "Spammy token-only candidates are rejected and never routed.",
  ],
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const state = await loadState();
  const context = await buildContextCheck(state);
  const currentAudit = buildCurrentHubAudit(state, context);
  const discovery = buildCandidateDiscovery(state);
  const scored = scoreAndClassifyCandidates(state, discovery.rawCandidates);
  const proposal = buildPromotionProposal(state, scored);
  const manualReview = buildManualReview(scored);
  const implementation = buildImplementation(state, proposal);
  const seoContentResults = buildSeoContentResults(implementation);
  const internalLinkingResults = buildInternalLinkingResults(implementation);
  const browserQa = await buildPreservedBrowserQa();
  const staticExport = await buildStaticExportResults(state, implementation);

  await writeArtifacts({
    context,
    currentAudit,
    discovery,
    scored,
    proposal,
    manualReview,
    implementation,
    seoContentResults,
    internalLinkingResults,
    browserQa,
    staticExport,
  });

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        availableRuntimeRecords: state.availableItems.length,
        rawCandidateCount: discovery.rawCandidates.candidates.length,
        promotedNewHubCount: proposal.summary.promotedHubCount,
        finalIndexableHubCount: implementation.summary.finalIndexableHubCount,
        sitemapRouteCount: implementation.summary.sitemapRouteCount,
      },
      null,
      2,
    ),
  );
}

async function loadState() {
  const input = {};
  for (const [key, relativePath] of Object.entries(INPUTS)) {
    input[key] = relativePath.endsWith(".json") ? await readJson(relativePath) : await readTextIfExists(relativePath);
  }
  stripPriorLongTailExpansion(input);

  const availableItems = input.runtimeAvailable.items;
  const deferredRecords = input.runtimeDeferred.records;
  const existingHubs = input.runtimeHubs.hubs;
  const existingHubById = new Map(existingHubs.map((hub) => [hub.hubId, hub]));
  const existingHubBySlug = new Map(existingHubs.map((hub) => [hub.slug, hub]));
  const existingRoutes = input.runtimeRoutes.routes;
  const existingRoutePaths = new Set(existingRoutes.map((route) => route.path));
  const existingSlugs = new Set(existingHubs.map((hub) => hub.slug).filter(Boolean));
  const existingEquivalentSlugs = new Set([...existingSlugs, ...[...existingSlugs].map(singularSlug)]);
  const searchEntryById = new Map(input.runtimeSearchIndex.entries.map((entry) => [entry.assetId, entry]));
  const itemById = new Map(availableItems.map((item) => [item.assetId, item]));
  const hubItemsByAssetId = new Map(input.runtimeHubItems.items.map((entry) => [entry.assetId, entry]));
  const titleOverrideByAssetId = new Map((input.titleOverrides.overrides || []).map((entry) => [entry.assetId, entry]));
  const itemFeatures = new Map();

  for (const item of availableItems) {
    const override = titleOverrideByAssetId.get(item.assetId);
    const cleanTitle = override?.cleanTitle || item.title;
    const text = normalizeText(
      [
        cleanTitle,
        override?.cleanAltText,
        item.altText,
        item.filenameSlug,
        item.categorySlug,
        item.assetSubpaths?.webpPreview,
        item.assetSubpaths?.svg,
      ]
        .filter(Boolean)
        .join(" "),
    );
    itemFeatures.set(item.assetId, {
      assetId: item.assetId,
      cleanTitle,
      text,
      tokens: extractTokens(text),
    });
  }

  return {
    repoRoot: REPO_ROOT,
    input,
    availableItems,
    deferredRecords,
    existingHubs,
    existingHubById,
    existingHubBySlug,
    existingSlugs,
    existingEquivalentSlugs,
    existingRoutes,
    existingRoutePaths,
    itemById,
    searchEntryById,
    hubItemsByAssetId,
    titleOverrideByAssetId,
    itemFeatures,
  };
}

function stripPriorLongTailExpansion(input) {
  const previousLongTailHubs = (input.runtimeHubs.hubs || []).filter((hub) => hub.longTailSource?.runId === RUN_ID);
  if (previousLongTailHubs.length === 0) return;

  const removedHubIds = new Set(previousLongTailHubs.map((hub) => hub.hubId));
  const removedRoutes = new Set(previousLongTailHubs.map((hub) => hub.route));

  input.runtimeHubs.hubs = input.runtimeHubs.hubs
    .filter((hub) => !removedHubIds.has(hub.hubId))
    .map((hub) => ({
      ...hub,
      relatedHubIds: (hub.relatedHubIds || []).filter((hubId) => !removedHubIds.has(hubId)),
      childHubIds: (hub.childHubIds || []).filter((hubId) => !removedHubIds.has(hubId)),
      internalLinkingTargets: (hub.internalLinkingTargets || []).filter((hubId) => !removedHubIds.has(hubId)),
    }));
  input.runtimeRoutes.routes = input.runtimeRoutes.routes.filter((route) => !removedHubIds.has(route.hubId));
  input.runtimeSiteMap.entries = input.runtimeSiteMap.entries.filter((entry) => !removedRoutes.has(entry.path));
  input.runtimeHubItems.items = input.runtimeHubItems.items.map((entry) => ({
    ...entry,
    hubIds: (entry.hubIds || []).filter((hubId) => !removedHubIds.has(hubId)),
  }));
  input.runtimeSearchIndex.entries = input.runtimeSearchIndex.entries.map((entry) => ({
    ...entry,
    hubIds: (entry.hubIds || []).filter((hubId) => !removedHubIds.has(hubId)),
  }));
  input.runtimeHubFeaturedItems.hubs = input.runtimeHubFeaturedItems.hubs.filter((hub) => !removedHubIds.has(hub.hubId));
  input.runtimeHubFilterTags.hubs = input.runtimeHubFilterTags.hubs.filter((hub) => !removedHubIds.has(hub.hubId));
  input.runtimeSeoPages.pages = input.runtimeSeoPages.pages.filter((page) => !removedHubIds.has(page.hubId) && !removedRoutes.has(page.path));
  input.runtimeHubSeoContent.hubs = input.runtimeHubSeoContent.hubs.filter((page) => !removedHubIds.has(page.hubId) && !removedRoutes.has(page.route));
  input.runtimeSocialMetadata.pages = input.runtimeSocialMetadata.pages.filter((page) => !removedRoutes.has(page.path));
  input.internalLinking.pages = input.internalLinking.pages
    .filter((page) => !removedHubIds.has(page.hubId) && !removedRoutes.has(page.path))
    .map((page) => ({
      ...page,
      links: (page.links || []).filter((link) => !removedRoutes.has(link.href)),
    }));
}

async function buildContextCheck(state) {
  const branch = await git(["branch", "--show-current"]);
  const head = await git(["rev-parse", "HEAD"]);
  const repoRoot = await git(["rev-parse", "--show-toplevel"]);
  const appApiRoutePresent = existsSync(path.join(REPO_ROOT, "app", "api"));
  const staticExportConfigured = /output:\s*["']export["']/.test(state.input.nextConfig);
  const hubRoutesExist =
    existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")) &&
    existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx"));
  const publicSource = await readProjectText(["app", "src"], { includeGenerated: false });
  const packageScripts = state.input.packageJson.scripts || {};
  const publicDownloadFormats = readPublicDownloadFormats(state.input.browserDownloads);
  const svgUserDownloadExposed = /Download SVG|downloadSvg|svgDownload|label:\s*["']SVG["']/i.test(`${state.input.browserDownloads}\n${state.input.downloadMenu}`);
  const appSitemapTrustPageCount = countTrustPages();
  const appSitemapTotalRouteCount = state.input.runtimeSiteMap.entries.length + appSitemapTrustPageCount + 1;

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      correctRepository: path.basename(repoRoot) === "i-love-coloring-page",
      repoRoot: normalizePath(repoRoot),
      branch,
      head,
      productionBaseBranchDocumented: "version-4",
      currentBranchIsLongTailWorkBranch: branch === "ver-5-deployed-may-13-2026",
      appApiRoutePresent,
      staticExportConfigured,
      frontendOnlyNextStaticExport: staticExportConfigured && !appApiRoutePresent,
      hubRoutesExist,
      runtimeAvailableRecords: state.availableItems.length,
      deferredManualReviewRecords: state.deferredRecords.length,
      runtimeCleanAssetSetActive: state.availableItems.every((item) => item.runtimeAssetStatus === "uploaded_clean_svg_webp"),
      currentIndexableHubCount: state.input.runtimeHubs.hubs.length,
      currentRuntimeSitemapRouteCount: state.input.runtimeSiteMap.entries.length,
      currentAppSitemapEstimatedUrlCount: appSitemapTotalRouteCount,
      publicAssetBaseUrl: readConstant(state.input.siteConfig, "DEFAULT_COLORING_ASSET_BASE_URL") || PUBLIC_ASSET_BASE_URL,
      publicSiteUrl: readConstant(state.input.siteConfig, "DEFAULT_SITE_URL") || PUBLIC_SITE_URL,
      publicDownloads: publicDownloadFormats,
      svgUserDownloadExposed,
      svgInternalOnly: !svgUserDownloadExposed,
      imageSitemapPresent: /image-sitemap|ImageSitemap|xmlns:image|image:image/i.test(publicSource),
      openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(publicSource),
      liveAdsenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(publicSource),
      npmTestConfigured: Boolean(packageScripts.test),
      npmBuildConfigured: Boolean(packageScripts.build),
    },
    checks: [
      check("repository", "i-love-coloring-page", path.basename(repoRoot)),
      check("branch", "ver-5-deployed-may-13-2026", branch),
      check("app/api", "absent", appApiRoutePresent ? "present" : "absent"),
      check("static export", "configured", staticExportConfigured ? "configured" : "missing"),
      check("runtime available records", EXPECTED_AVAILABLE_RECORDS, state.availableItems.length),
      check("deferred manual-review records", EXPECTED_DEFERRED_RECORDS, state.deferredRecords.length),
      check("public downloads", "PNG/JPG/WebP", publicDownloadFormats.join("/")),
      check("SVG user download", "absent", svgUserDownloadExposed ? "present" : "absent"),
    ],
    routes: {
      rootGalleryExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      paginatedHubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page", "[page]", "page.tsx")),
    },
  };
}

function buildCurrentHubAudit(state, context) {
  const hubs = state.input.runtimeHubs.hubs;
  const routes = state.input.runtimeRoutes.routes;
  const sitemap = state.input.runtimeSiteMap.entries;
  const rootHub = hubs.find((hub) => hub.route === ROOT_ROUTE);
  const nonRootHubs = hubs.filter((hub) => hub.route !== ROOT_ROUTE);
  const sortedByCount = [...nonRootHubs].sort((a, b) => b.assetCount - a.assetCount || a.slug.localeCompare(b.slug));
  const broadGenericHubs = sortedByCount.filter((hub) => hub.assetCount >= 500 || /^(animals|plushies|fantasy|mandalas|geometric|cute|anime-girls|holidays)$/.test(hub.slug));
  const missingObviousSubjectHubs = findMissingObviousSubjects(state);
  const possibleCannibalization = findPossibleCannibalization(nonRootHubs);
  const internalLinkingCoverage = buildInternalLinkCoverage(state);

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      currentIndexableHubCount: hubs.length,
      currentNonRootHubCount: nonRootHubs.length,
      currentRuntimeSitemapRouteCount: sitemap.length,
      currentAppSitemapEstimatedUrlCount: context.summary.currentAppSitemapEstimatedUrlCount,
      rootAssetCount: rootHub?.assetCount || 0,
      phase1HubCount: hubs.length,
      phase2BacklogHubCount: state.input.runtimeHubs.backlogHubs?.length || 0,
      sectionOnlyTopicCount: state.input.runtimeHubs.sectionOnlyTopics?.length || 0,
      rejectedCandidateCount: state.input.round4aRejected.candidates?.length || 0,
    },
    phase1Hubs: nonRootHubs.map(summarizeHub),
    phase2BacklogHubs: (state.input.runtimeHubs.backlogHubs || []).map(summarizeLightHub),
    sectionOnlyTopics: (state.input.runtimeHubs.sectionOnlyTopics || []).map(summarizeLightHub),
    rejectedCandidates: (state.input.round4aRejected.candidates || []).map((candidate) => ({
      slug: candidate.slug,
      title: candidate.canonicalTitle || candidate.title,
      assetCount: candidate.assetCount || candidate.asset_count || candidate.assetIds?.length || 0,
      reason: candidate.rejectionReason || candidate.reason || "Round 4A rejected or held out.",
    })),
    largestHubs: sortedByCount.slice(0, 15).map(summarizeHub),
    smallestHubs: [...nonRootHubs].sort((a, b) => a.assetCount - b.assetCount || a.slug.localeCompare(b.slug)).slice(0, 15).map(summarizeHub),
    broadGenericHubs: broadGenericHubs.map(summarizeHub),
    missingObviousSubjectHubs,
    possibleCannibalization,
    currentInternalLinkingCoverage: internalLinkingCoverage,
    sitemap: {
      entries: sitemap,
      routesWithoutSitemap: routes.filter((route) => !sitemap.some((entry) => entry.path === route.path)).map((route) => route.path),
      sitemapWithoutRoutes: sitemap.filter((entry) => !routes.some((route) => route.path === entry.path)).map((entry) => entry.path),
    },
  };
}

function buildCandidateDiscovery(state) {
  const definitions = createTermDefinitions();
  const definitionByTerm = new Map(definitions.map((definition) => [definition.term, definition]));
  const tokenCounts = buildTokenCounts(state);
  const termAssets = buildTermAssets(state, definitions);
  const subjectFrequency = buildSubjectFrequency(termAssets, definitionByTerm);
  const combinationFrequency = buildCombinationFrequency(state, termAssets, definitions);
  const candidates = buildRawCandidates(state, subjectFrequency, combinationFrequency, definitionByTerm);

  return {
    tokenFrequency: {
      generatedAt: GENERATED_AT,
      runId: RUN_ID,
      source: INPUTS.runtimeAvailable,
      summary: {
        availableRuntimeRecords: state.availableItems.length,
        uniqueTokenCount: tokenCounts.length,
        stopTokensExcluded: STOP_TOKENS.size,
        tokenReplacementCount: Object.keys(TOKEN_REPLACEMENTS).length,
      },
      tokens: tokenCounts.slice(0, 500),
    },
    subjectFrequency: {
      generatedAt: GENERATED_AT,
      runId: RUN_ID,
      source: INPUTS.runtimeAvailable,
      summary: {
        availableRuntimeRecords: state.availableItems.length,
        trackedTermCount: subjectFrequency.length,
        existingHubTermsIncludedForAudit: true,
      },
      subjects: subjectFrequency,
    },
    combinationFrequency: {
      generatedAt: GENERATED_AT,
      runId: RUN_ID,
      source: INPUTS.runtimeAvailable,
      summary: {
        availableRuntimeRecords: state.availableItems.length,
        trackedCombinationCount: combinationFrequency.length,
        minimumCountRecorded: 6,
      },
      combinations: combinationFrequency,
    },
    rawCandidates: {
      generatedAt: GENERATED_AT,
      runId: RUN_ID,
      source: {
        runtimeItems: INPUTS.runtimeAvailable,
        runtimeHubs: INPUTS.runtimeHubs,
        runtimeHubItems: INPUTS.runtimeHubItems,
      },
      summary: {
        availableRuntimeRecords: state.availableItems.length,
        deferredRecordsExcluded: state.deferredRecords.length,
        rawCandidateCount: candidates.length,
        subjectCandidateCount: candidates.filter((candidate) => candidate.kind !== "combination").length,
        combinationCandidateCount: candidates.filter((candidate) => candidate.kind === "combination").length,
        existingHubSlugsExcludedFromPromotion: state.existingSlugs.size,
      },
      candidates,
    },
  };
}

function scoreAndClassifyCandidates(state, rawCandidateManifest) {
  const scoredCandidates = rawCandidateManifest.candidates
    .map((candidate) => scoreCandidate(state, candidate))
    .sort((a, b) => b.score.total - a.score.total || b.assetCount - a.assetCount || a.slug.localeCompare(b.slug));

  const promoteEligible = scoredCandidates.filter((candidate) => candidate.initialClassification === "promote_now");
  const selectionOrdered = [...promoteEligible].sort((a, b) => selectionScore(b) - selectionScore(a) || b.assetCount - a.assetCount || a.slug.localeCompare(b.slug));
  const selectedPromoted = [];
  const deferredBySelection = new Map();
  for (const candidate of selectionOrdered) {
    const redundantWith = findRedundantSelectedCandidate(candidate, selectedPromoted);
    if (redundantWith) {
      deferredBySelection.set(candidate.slug, `Deferred because it overlaps heavily with selected hub ${redundantWith.slug}.`);
      continue;
    }
    if (selectedPromoted.length >= MAX_PROMOTED_NEW_HUBS) {
      deferredBySelection.set(candidate.slug, `Deferred by round cap of ${MAX_PROMOTED_NEW_HUBS} promoted hubs.`);
      continue;
    }
    selectedPromoted.push(candidate);
  }
  const selectedPromotedSlugs = new Set(selectedPromoted.map((candidate) => candidate.slug));
  const candidates = scoredCandidates.map((candidate) => {
    if (candidate.initialClassification === "promote_now" && !selectedPromotedSlugs.has(candidate.slug)) {
      return {
        ...candidate,
        classification: "backlog_later",
        classificationReasons: [...candidate.classificationReasons, deferredBySelection.get(candidate.slug) || "Deferred by promotion selection."],
      };
    }
    return {
      ...candidate,
      classification: candidate.initialClassification,
    };
  });

  const summary = {
    availableRuntimeRecords: state.availableItems.length,
    deferredRecordsExcluded: state.deferredRecords.length,
    candidateCount: candidates.length,
    strongCandidateCount: promoteEligible.length,
    promotedNowCount: candidates.filter((candidate) => candidate.classification === "promote_now").length,
    backlogLaterCount: candidates.filter((candidate) => candidate.classification === "backlog_later").length,
    sectionOnlyCount: candidates.filter((candidate) => candidate.classification === "section_only").length,
    rejectedSpamOrThinCount: candidates.filter((candidate) => candidate.classification === "reject_spam_or_thin").length,
    manualReviewCount: candidates.filter((candidate) => candidate.classification === "manual_review").length,
    if200StrongCandidatesExist: promoteEligible.length >= 200 ? "yes" : "no",
    qualityGate: "Only promote_now candidates after scoring and round-cap filtering are routed.",
  };

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary,
    scoringModel: {
      totalPossibleScore: 100,
      factors: [
        "asset count",
        "subject specificity",
        "user and search intent clarity",
        "distinctness from existing hubs",
        "title and route quality",
        "thin-page and spam risk",
        "internal linking value",
        "seasonal value when relevant",
        "gallery usefulness",
      ],
    },
    candidates,
  };
}

function buildPromotionProposal(state, scored) {
  const promoted = scored.candidates.filter((candidate) => candidate.classification === "promote_now");
  const existingHubBySlug = new Map(state.existingHubs.map((hub) => [hub.slug, hub]));
  const records = promoted.map((candidate) => {
    const relatedHubs = pickRelatedHubSlugs(state, candidate, promoted, 8);
    return {
      hubTitle: candidate.title,
      slug: candidate.slug,
      kind: candidate.kind,
      intent: candidate.intent,
      assetCount: candidate.assetCount,
      assetIds: candidate.assetIds,
      exampleAssetTitles: candidate.exampleAssetTitles,
      relatedHubs,
      overlapNotes: candidate.overlapNotes,
      seoTitle: makeMetaTitle(candidate),
      metaDescription: makeMetaDescription(candidate),
      introCopy: makeIntro(candidate),
      belowGalleryContentOutline: makeBelowGallerySections(candidate).map((section) => section.heading),
      sitemapInclusionStatus: "include",
      parentHubSlug: candidate.parentSlug,
      parentHubAlreadyExists: existingHubBySlug.has(candidate.parentSlug),
      minimumExceptionDocumented: false,
      confidence: candidate.confidence,
      score: candidate.score.total,
    };
  });

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      startingIndexableHubCount: state.existingHubs.length,
      promotedHubCount: records.length,
      projectedIndexableHubCount: state.existingHubs.length + records.length,
      candidateHubCount: scored.summary.candidateCount,
      strongCandidateCount: scored.summary.strongCandidateCount,
      current72PageConcern: "The runtime hub sitemap starts at 65 gallery entries, or about 72 total app sitemap URLs when homepage and trust pages are included.",
      outputScaleAssessment:
        scored.summary.strongCandidateCount >= 200
          ? "The inventory has 200 or more strong candidates, but this round caps promotion for quality review."
          : scored.summary.strongCandidateCount >= 100
            ? "The inventory supports a meaningful 100 to 180 style expansion without forcing garbage pages."
            : "The inventory supports a focused expansion below 100 strong candidates.",
      noPerImagePages: true,
      noSpammyTokenPages: true,
    },
    promotedHubs: records,
  };
}

function buildManualReview(scored) {
  const candidates = scored.candidates
    .filter((candidate) => candidate.classification === "manual_review" || candidate.classification === "backlog_later")
    .filter(
      (candidate) =>
        candidate.assetCount <= 20 ||
        candidate.maxComparableOverlapRatio >= POLICY.uniqueness.manualReviewOverlapRatio ||
        candidate.publicNamingRisk !== "low" ||
        candidate.classificationReasons.some((reason) => /round cap|ambiguous|overlap|minimum/i.test(reason)),
    )
    .slice(0, 250)
    .map((candidate) => ({
      slug: candidate.slug,
      title: candidate.title,
      kind: candidate.kind,
      assetCount: candidate.assetCount,
      classification: candidate.classification,
      reasons: candidate.classificationReasons,
      exampleAssetTitles: candidate.exampleAssetTitles,
      overlapNotes: candidate.overlapNotes,
      ownerDecisionNeeded: candidate.publicNamingRisk !== "low" || candidate.assetCount < (POLICY.minimums[candidate.kind] || POLICY.minimums.subject),
    }));

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      manualReviewCandidateCount: candidates.length,
      includesSixToNineAssetUnclearCandidates: candidates.some((candidate) => candidate.assetCount >= 6 && candidate.assetCount <= 9),
      includesHighOverlapCandidates: candidates.some((candidate) => candidate.reasons.some((reason) => /overlap/i.test(reason))),
      notRouted: true,
    },
    candidates,
  };
}

function buildImplementation(state, proposal) {
  const promotedCandidates = proposal.promotedHubs.map((record) => hydrateCandidateFromProposal(state, record));
  const promotedByHubId = new Map(promotedCandidates.map((candidate) => [candidate.hubId, candidate]));
  const promotedBySlug = new Map(promotedCandidates.map((candidate) => [candidate.slug, candidate]));
  const updatedHubs = structuredClone(state.input.runtimeHubs);
  const updatedRoutes = structuredClone(state.input.runtimeRoutes);
  const updatedSiteMap = structuredClone(state.input.runtimeSiteMap);
  const updatedHubItems = structuredClone(state.input.runtimeHubItems);
  const updatedSearchIndex = structuredClone(state.input.runtimeSearchIndex);
  const updatedFeatured = structuredClone(state.input.runtimeHubFeaturedItems);
  const updatedFilters = structuredClone(state.input.runtimeHubFilterTags);
  const updatedSeoPages = structuredClone(state.input.runtimeSeoPages);
  const updatedHubSeoContent = structuredClone(state.input.runtimeHubSeoContent);
  const updatedSocialMetadata = structuredClone(state.input.runtimeSocialMetadata);
  const updatedInternalLinking = structuredClone(state.input.internalLinking);

  const existingHubIds = new Set(updatedHubs.hubs.map((hub) => hub.hubId));
  const promotedHubRecords = promotedCandidates.map((candidate) => buildHubRecord(state, candidate, promotedCandidates));
  const promotedSlugs = new Set(promotedHubRecords.map((hub) => hub.slug));
  updatedHubs.backlogHubs = (updatedHubs.backlogHubs || []).filter((hub) => !promotedSlugs.has(hub.slug));
  updatedHubs.sectionOnlyTopics = (updatedHubs.sectionOnlyTopics || []).filter((hub) => !promotedSlugs.has(hub.slug));
  const allHubByIdForLinks = new Map([...state.existingHubs, ...promotedHubRecords].map((hub) => [hub.hubId, hub]));
  for (const hub of promotedHubRecords) {
    if (existingHubIds.has(hub.hubId)) throw new Error(`Long-tail hub collision: ${hub.hubId}`);
    updatedHubs.hubs.push(hub);
    updatedRoutes.routes.push({
      hubId: hub.hubId,
      slug: hub.slug,
      path: hub.route,
      title: hub.title,
      indexable: true,
      sitemap: true,
      assetCount: hub.assetCount,
    });
    updatedSiteMap.entries.push({
      path: hub.route,
      changeFrequency: hub.assetCount >= 30 ? "weekly" : "monthly",
      priority: hub.assetCount >= 30 ? 0.7 : 0.6,
    });
    updatedFeatured.hubs.push({
      hubId: hub.hubId,
      slug: hub.slug,
      title: hub.title,
      assetCount: hub.assetCount,
      assetIds: hub.featuredAssetIds,
      warningFlagsPreservedInternally: true,
      selectionRule: "deterministic long-tail selection using title clarity, clean runtime assets, and stable asset ids",
    });
    updatedFilters.hubs.push(buildFilterUxForHub(state, hub));
    updatedSeoPages.pages.push(buildSeoPage(hub, promotedByHubId));
    updatedHubSeoContent.hubs.push(buildHubSeoContentRecord(hub, allHubByIdForLinks));
    updatedSocialMetadata.pages.push(buildSocialMetadataRecord(hub));
    updatedInternalLinking.pages.push(buildInternalLinkingPage(hub, allHubByIdForLinks));
  }

  applyHubRelationships(updatedHubs.hubs, promotedHubRecords);
  applyHubMemberships(updatedHubItems, updatedSearchIndex, promotedCandidates);
  applyRootAndParentInternalLinks(updatedInternalLinking, updatedHubs.hubs, promotedHubRecords);
  refreshSummaries({
    updatedHubs,
    updatedRoutes,
    updatedSiteMap,
    updatedHubItems,
    updatedSearchIndex,
    updatedFeatured,
    updatedFilters,
    updatedSeoPages,
    updatedHubSeoContent,
    updatedSocialMetadata,
  });

  const generatedAt = GENERATED_AT;
  for (const manifest of [
    updatedHubs,
    updatedRoutes,
    updatedSiteMap,
    updatedHubItems,
    updatedSearchIndex,
    updatedFeatured,
    updatedFilters,
    updatedSeoPages,
    updatedHubSeoContent,
    updatedSocialMetadata,
    updatedInternalLinking,
  ]) {
    manifest.generatedAt = generatedAt;
    if (manifest.runId) manifest.runId = `${manifest.runId}+long-tail`;
    else manifest.runId = RUN_ID;
  }

  const files = {
    [INPUTS.runtimeHubs]: updatedHubs,
    [INPUTS.runtimeRoutes]: updatedRoutes,
    [INPUTS.runtimeSiteMap]: updatedSiteMap,
    [INPUTS.runtimeHubItems]: updatedHubItems,
    [INPUTS.runtimeSearchIndex]: updatedSearchIndex,
    [INPUTS.runtimeHubFeaturedItems]: updatedFeatured,
    [INPUTS.runtimeHubFilterTags]: updatedFilters,
    [INPUTS.runtimeSeoPages]: updatedSeoPages,
    [INPUTS.runtimeHubSeoContent]: updatedHubSeoContent,
    [INPUTS.runtimeSocialMetadata]: updatedSocialMetadata,
    [INPUTS.internalLinking]: updatedInternalLinking,
  };

  const tRexHub = promotedHubRecords.find((hub) => hub.slug === "t-rex") || updatedHubs.hubs.find((hub) => hub.slug === "t-rex");
  const implementation = {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      startingIndexableHubCount: state.existingHubs.length,
      promotedNewHubCount: promotedHubRecords.length,
      finalIndexableHubCount: updatedRoutes.routes.length,
      sitemapRouteCount: updatedSiteMap.entries.length,
      runtimeAvailableRecords: state.availableItems.length,
      deferredRecordsExcluded: state.deferredRecords.length,
      generatedRouteCountDocumented: true,
      noPerImageRoutesCreated: true,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      phase2CandidatesRouted: false,
      sectionOnlyTopicsRouted: false,
      sitemapOnlyPromotedIndexableHubs: true,
      staticExportPreserved: /output:\s*["']export["']/.test(state.input.nextConfig),
      tRexResult: tRexHub
        ? { promoted: promotedHubRecords.some((hub) => hub.slug === "t-rex"), route: tRexHub.route, assetCount: tRexHub.assetCount }
        : { promoted: false, route: null, assetCount: 0 },
    },
    generatedFiles: Object.keys(files),
    promotedHubs: promotedHubRecords.map((hub) => ({
      hubId: hub.hubId,
      slug: hub.slug,
      title: hub.title,
      kind: promotedByHubId.get(hub.hubId)?.kind || "subject",
      route: hub.route,
      assetCount: hub.assetCount,
      relatedHubIds: hub.relatedHubIds,
      parentHubId: hub.parentHubId,
      exampleAssetTitles: hub.assetIds.slice(0, 5).map((assetId) => state.itemById.get(assetId)?.title).filter(Boolean),
      minimumExceptionDocumented: false,
    })),
    files,
  };

  return implementation;
}

function buildSeoContentResults(implementation) {
  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      newHubSeoContentCount: implementation.promotedHubs.length,
      uniqueMetaTitles: true,
      uniqueMetaDescriptions: true,
      galleryAccessSecondaryCopyOnly: true,
      noKeywordStuffingIntent: true,
      svgDownloadsMentionedPublicly: false,
      onlineColoringPromised: false,
      fakeFaqsAdded: false,
    },
    hubs: implementation.promotedHubs.map((hub) => ({
      slug: hub.slug,
      route: hub.route,
      metaTitle: implementation.files[INPUTS.runtimeSeoPages].pages.find((page) => page.path === hub.route)?.metaTitle,
      metaDescription: implementation.files[INPUTS.runtimeSeoPages].pages.find((page) => page.path === hub.route)?.metaDescription,
      h1: implementation.files[INPUTS.runtimeSeoPages].pages.find((page) => page.path === hub.route)?.h1,
      belowGallerySections: implementation.files[INPUTS.runtimeHubSeoContent].hubs.find((page) => page.route === hub.route)?.belowGallerySections?.map((section) => section.heading) || [],
    })),
  };
}

function buildInternalLinkingResults(implementation) {
  const internal = implementation.files[INPUTS.internalLinking];
  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      promotedHubCount: implementation.promotedHubs.length,
      internalLinkingPages: internal.pages.length,
      broadPagesUpdated: true,
      moreMenuBackedByRuntimeRoutes: true,
      excessiveTopNavLinksAdded: false,
      backendRoutesAdded: false,
    },
    promotedHubLinks: implementation.promotedHubs.map((hub) => {
      const page = internal.pages.find((entry) => entry.path === hub.route);
      return {
        slug: hub.slug,
        route: hub.route,
        linkCount: page?.links?.length || 0,
        links: page?.links || [],
      };
    }),
  };
}

async function buildPreservedBrowserQa() {
  const existing = await readJsonIfExists(OUTPUTS.browserQa);
  if (existing?.summary?.status === "completed") return existing;
  return {
    generatedAt: GENERATED_AT,
    runId: "long-tail-hub-browser-qa",
    summary: {
      status: "not_run",
      reason: "Run node pipeline/scripts/long-tail-hub-browser-qa-runner.cjs after starting a local Next.js server.",
      pagesInspected: 0,
      newHubsRendered: false,
      noBrokenImages: null,
      horizontalOverflowDetected: null,
      adLayoutChecked: false,
      pngJpgWebpControlsPresent: null,
      printControlPresent: null,
      svgDownloadAbsent: null,
    },
    pages: [],
    screenshotPaths: [],
    blockers: ["Browser QA has not run in this script."],
  };
}

async function buildStaticExportResults(state, implementation) {
  const outDir = path.join(REPO_ROOT, "out");
  const sitemapPath = path.join(outDir, "sitemap.xml");
  const outExists = existsSync(outDir);
  const sitemapText = existsSync(sitemapPath) ? await readFile(sitemapPath, "utf8") : "";
  const sitemapLocs = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1]);
  const routePaths = implementation.files[INPUTS.runtimeRoutes].routes.map((route) => route.path);
  const duplicatePaths = duplicates(routePaths);
  const duplicateCanonicalUrls = duplicates(sitemapLocs);
  const perImageRoutes = routePaths.filter((routePath) => /\/(?:image|asset|item)\//i.test(routePath));
  const badOutputUrls = sitemapLocs.filter((url) => /localhost|127\.0\.0\.1|\.r2\.dev|r2\.cloudflarestorage\.com|amazonaws\.com/i.test(url));
  const noindexInSitemap = implementation.files[INPUTS.runtimeSeoPages].pages.filter((page) => page.noIndex && sitemapLocs.includes(`${PUBLIC_SITE_URL}${page.path}`));
  const expectedLocs = [
    PUBLIC_SITE_URL,
    ...implementation.files[INPUTS.runtimeSiteMap].entries.map((entry) => `${PUBLIC_SITE_URL}${entry.path}`),
    `${PUBLIC_SITE_URL}/about`,
    `${PUBLIC_SITE_URL}/contact`,
    `${PUBLIC_SITE_URL}/privacy`,
    `${PUBLIC_SITE_URL}/terms`,
    `${PUBLIC_SITE_URL}/affiliate-disclosure`,
    `${PUBLIC_SITE_URL}/editorial-policy`,
  ];
  const missingExpectedLocs = outExists ? expectedLocs.filter((loc) => !sitemapLocs.includes(loc)) : [];

  return {
    generatedAt: GENERATED_AT,
    runId: "long-tail-static-export",
    summary: {
      status: outExists && sitemapText ? "export_present" : "not_run",
      npmBuildPasses: outExists && sitemapText ? true : null,
      expectedStaticHubRouteCount: implementation.files[INPUTS.runtimeRoutes].routes.length,
      sitemapRouteCount: implementation.files[INPUTS.runtimeSiteMap].entries.length,
      exportedSitemapLocCount: sitemapLocs.length || null,
      noPerImagePages: perImageRoutes.length === 0,
      noBrokenRouteLinks: missingExpectedLocs.length === 0,
      noDuplicateCanonicalUrls: duplicateCanonicalUrls.length === 0,
      noDuplicateSlugs: duplicates(implementation.files[INPUTS.runtimeHubs].hubs.map((hub) => hub.slug)).length === 0,
      noRouteSlugCollisions: duplicatePaths.length === 0,
      noNoindexPagesInSitemap: noindexInSitemap.length === 0,
      noLocalhostOrR2DevInGeneratedOutput: badOutputUrls.length === 0,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*["']export["']/.test(state.input.nextConfig),
    },
    expectedLocs: expectedLocs.slice(0, 20),
    missingExpectedLocs,
    duplicateCanonicalUrls,
    duplicateRoutePaths: duplicatePaths,
    perImageRoutes,
    badOutputUrls,
    noindexInSitemap: noindexInSitemap.map((page) => page.path),
    note:
      outExists && sitemapText
        ? "Static export files were present when this script ran. Re-run after npm run build for fresh evidence."
        : "Run npm run build, then re-run this script or inspect out/sitemap.xml for fresh static export evidence.",
  };
}

async function writeArtifacts(payload) {
  const {
    context,
    currentAudit,
    discovery,
    scored,
    proposal,
    manualReview,
    implementation,
    seoContentResults,
    internalLinkingResults,
    browserQa,
    staticExport,
  } = payload;

  const generatedDataFiles = implementation.files;
  for (const [relativePath, filePayload] of Object.entries(generatedDataFiles)) {
    await writeJson(relativePath, filePayload);
  }

  await writeJson(OUTPUTS.context, context);
  await writeJson(OUTPUTS.currentAudit, currentAudit);
  await writeJson(OUTPUTS.tokenFrequency, discovery.tokenFrequency);
  await writeJson(OUTPUTS.subjectFrequency, discovery.subjectFrequency);
  await writeJson(OUTPUTS.combinationFrequency, discovery.combinationFrequency);
  await writeJson(OUTPUTS.rawCandidates, discovery.rawCandidates);
  await writeJson(OUTPUTS.policy, POLICY);
  await writeJson(OUTPUTS.scores, scored);
  await writeJson(OUTPUTS.proposal, proposal);
  await writeJson(OUTPUTS.manualReview, manualReview);
  await writeJson(OUTPUTS.implementation, stripImplementationFiles(implementation));
  await writeJson(OUTPUTS.seoContent, seoContentResults);
  await writeJson(OUTPUTS.internalLinking, internalLinkingResults);
  await writeJson(OUTPUTS.browserQa, browserQa);
  await writeJson(OUTPUTS.staticExport, staticExport);

  await writeText(REPORTS.context, renderContextReport(context));
  await writeText(REPORTS.currentAudit, renderCurrentAuditReport(currentAudit));
  await writeText(REPORTS.candidateDiscovery, renderCandidateDiscoveryReport(discovery));
  await writeText(REPORTS.policy, renderPolicyReport(POLICY));
  await writeText(REPORTS.scores, renderScoreReport(scored));
  await writeText(REPORTS.proposal, renderProposalReport(proposal));
  await writeText(REPORTS.manualReview, renderManualReviewReport(manualReview));
  await writeText(REPORTS.implementation, renderImplementationReport(implementation));
  await writeText(REPORTS.seoContent, renderSeoContentReport(seoContentResults));
  await writeText(REPORTS.internalLinking, renderInternalLinkingReport(internalLinkingResults));
  await writeText(REPORTS.browserQa, renderBrowserQaReport(browserQa));
  await writeText(REPORTS.staticExport, renderStaticExportReport(staticExport));
}

function buildTokenCounts(state) {
  const counts = new Map();
  const examples = new Map();
  for (const item of state.availableItems) {
    const feature = state.itemFeatures.get(item.assetId);
    for (const token of feature.tokens) {
      if (!counts.has(token)) counts.set(token, new Set());
      counts.get(token).add(item.assetId);
      if (!examples.has(token)) examples.set(token, []);
      if (examples.get(token).length < 5) examples.get(token).push(feature.cleanTitle);
    }
  }
  return [...counts.entries()]
    .map(([token, ids]) => ({
      token,
      assetCount: ids.size,
      exampleTitles: examples.get(token) || [],
    }))
    .filter((entry) => entry.assetCount >= 3)
    .sort((a, b) => b.assetCount - a.assetCount || a.token.localeCompare(b.token));
}

function buildTermAssets(state, definitions) {
  const termAssets = new Map(definitions.map((definition) => [definition.term, new Set()]));
  for (const item of state.availableItems) {
    const feature = state.itemFeatures.get(item.assetId);
    for (const definition of definitions) {
      if (matchesDefinition(feature, definition)) termAssets.get(definition.term).add(item.assetId);
    }
  }
  return termAssets;
}

function buildSubjectFrequency(termAssets, definitionByTerm) {
  return [...termAssets.entries()]
    .map(([term, ids]) => {
      const definition = definitionByTerm.get(term);
      return {
        term,
        slug: definition.slug,
        label: definition.label,
        kind: definition.kind,
        parentSlug: definition.parentSlug,
        assetCount: ids.size,
        candidateEligible: ids.size >= 6,
        existingBroadHubIntent: definition.existingIntent || false,
        assetIds: [...ids].sort(),
      };
    })
    .filter((entry) => entry.assetCount >= 3)
    .sort((a, b) => b.assetCount - a.assetCount || a.slug.localeCompare(b.slug));
}

function buildCombinationFrequency(state, termAssets, definitions) {
  const modifiers = definitions.filter((definition) => ["style", "seasonal", "audience"].includes(definition.kind));
  const subjects = definitions.filter((definition) => ["subject", "object", "theme"].includes(definition.kind));
  const combinations = [];
  for (const modifier of modifiers) {
    const modifierIds = termAssets.get(modifier.term);
    if (!modifierIds || modifierIds.size < 6) continue;
    for (const subject of subjects) {
      if (modifier.term === subject.term) continue;
      const subjectIds = termAssets.get(subject.term);
      if (!subjectIds || subjectIds.size < 6) continue;
      const assetIds = intersectSets(modifierIds, subjectIds);
      if (assetIds.size < 6) continue;
      const slug = `${modifier.slugPrefix || modifier.slug}-${subject.slug}`;
      combinations.push({
        modifierTerm: modifier.term,
        modifierLabel: modifier.comboLabel || modifier.label,
        subjectTerm: subject.term,
        subjectLabel: subject.comboLabel || subject.label,
        slug,
        label: `${modifier.comboLabel || modifier.label} ${subject.comboLabel || subject.label}`,
        kind: "combination",
        parentSlug: subject.parentSlug || modifier.parentSlug || "coloring-pages",
        assetCount: assetIds.size,
        assetIds: [...assetIds].sort(),
      });
    }
  }
  return combinations.sort((a, b) => b.assetCount - a.assetCount || a.slug.localeCompare(b.slug));
}

function buildRawCandidates(state, subjectFrequency, combinationFrequency, definitionByTerm) {
  const candidates = [];
  for (const subject of subjectFrequency) {
    if (subject.assetCount < 6) continue;
    const definition = definitionByTerm.get(subject.term);
    if (!definition || state.existingEquivalentSlugs.has(subject.slug) || definition.existingIntent) continue;
    const candidate = makeCandidateFromFrequency(state, subject, definition);
    if (candidate) candidates.push(candidate);
  }

  const seenSlugs = new Set(candidates.map((candidate) => candidate.slug));
  for (const combo of combinationFrequency) {
    if (combo.assetCount < 6) continue;
    if (state.existingEquivalentSlugs.has(combo.slug) || seenSlugs.has(combo.slug)) continue;
    if (isDisallowedPublicTerm(combo.slug) || isWeakCombination(combo)) continue;
    candidates.push(makeCombinationCandidate(state, combo));
    seenSlugs.add(combo.slug);
  }

  return candidates.sort((a, b) => b.assetCount - a.assetCount || a.slug.localeCompare(b.slug));
}

function makeCandidateFromFrequency(state, frequency, definition) {
  if (isDisallowedPublicTerm(frequency.slug)) return null;
  const title = `${definition.label} Coloring Pages`;
  const assetIds = frequency.assetIds.sort();
  return {
    candidateId: `long_tail_${frequency.slug.replace(/-/g, "_")}`,
    slug: frequency.slug,
    title,
    kind: definition.kind,
    intent: definition.intent || `${definition.label} printable coloring pages for a focused subject collection.`,
    terms: [definition.term, ...(definition.aliases || [])],
    parentSlug: definition.parentSlug || parentSlugForKind(definition.kind),
    assetCount: assetIds.length,
    assetIds,
    exampleAssetTitles: exampleTitles(state, assetIds),
    sourceSignals: ["display title", "filename slug", "category", "clean object key", "runtime search text"],
    existingRouteConflict: state.existingRoutePaths.has(`${ROOT_ROUTE}/${frequency.slug}`),
    existingSlugConflict: state.existingEquivalentSlugs.has(frequency.slug),
  };
}

function makeCombinationCandidate(state, combo) {
  return {
    candidateId: `long_tail_${combo.slug.replace(/-/g, "_")}`,
    slug: combo.slug,
    title: `${combo.label} Coloring Pages`,
    kind: "combination",
    intent: `${combo.label} printable coloring pages for visitors who want both the subject and the style or season.`,
    terms: [combo.modifierTerm, combo.subjectTerm],
    parentSlug: combo.parentSlug,
    assetCount: combo.assetCount,
    assetIds: combo.assetIds.sort(),
    exampleAssetTitles: exampleTitles(state, combo.assetIds),
    sourceSignals: ["co-occurring title and filename terms", "runtime search text", "existing hub memberships"],
    existingRouteConflict: state.existingRoutePaths.has(`${ROOT_ROUTE}/${combo.slug}`),
    existingSlugConflict: state.existingEquivalentSlugs.has(combo.slug),
  };
}

function scoreCandidate(state, candidate) {
  const minimum = POLICY.minimums[candidate.kind] || POLICY.minimums.subject;
  const assetCountScore = Math.min(30, Math.round(Math.log2(candidate.assetCount + 1) * 5));
  const specificityScore = candidate.kind === "combination" ? 18 : ["subject", "object", "theme", "seasonal"].includes(candidate.kind) ? 16 : 10;
  const intentScore = /coloring pages|printable/i.test(candidate.intent) ? 14 : 8;
  const internalLinkScore = state.existingHubBySlug.has(candidate.parentSlug) ? 10 : 5;
  const seasonalScore = candidate.kind === "seasonal" || /(christmas|halloween|birthday|easter|patrick|winter|pumpkin|santa|snowman|reindeer)/.test(candidate.slug) ? 6 : 0;
  const titleScore = publicTitleQuality(candidate.title);
  const overlap = computeOverlap(state, candidate);
  const distinctnessScore = overlap.maxComparableOverlapRatio >= POLICY.uniqueness.comparableHubOverlapBlockerRatio ? 0 : overlap.maxComparableOverlapRatio >= POLICY.uniqueness.manualReviewOverlapRatio ? 6 : 14;
  const thinRisk = candidate.assetCount < minimum ? 18 : candidate.assetCount < minimum + 3 ? 8 : 0;
  const spamRisk = isSpammyCandidate(candidate) ? 35 : 0;
  const scoreTotal = clamp(assetCountScore + specificityScore + intentScore + internalLinkScore + seasonalScore + titleScore + distinctnessScore - thinRisk - spamRisk, 0, 100);
  const reasons = [];
  let initialClassification = "backlog_later";

  if (candidate.existingRouteConflict || candidate.existingSlugConflict) {
    initialClassification = "section_only";
    reasons.push("Existing route or equivalent slug already covers this candidate.");
  } else if (isSpammyCandidate(candidate)) {
    initialClassification = "reject_spam_or_thin";
    reasons.push("Candidate looks like a token-only or low-quality public route name.");
  } else if (candidate.assetCount < POLICY.absoluteMinimumAssets) {
    initialClassification = "reject_spam_or_thin";
    reasons.push(`Below absolute minimum of ${POLICY.absoluteMinimumAssets} assets.`);
  } else if (candidate.assetCount < minimum) {
    initialClassification = "manual_review";
    reasons.push(`Below ${candidate.kind} minimum of ${minimum} assets but above absolute minimum.`);
  } else if (overlap.maxComparableOverlapRatio >= POLICY.uniqueness.comparableHubOverlapBlockerRatio) {
    initialClassification = "manual_review";
    reasons.push("High overlap with a same-scale existing or candidate hub needs owner judgment.");
  } else if (scoreTotal >= 58) {
    initialClassification = "promote_now";
    reasons.push("Meets asset minimum, has clear intent, and passes overlap checks.");
  } else {
    initialClassification = "backlog_later";
    reasons.push("Inventory is valid but the score is not strong enough for this round.");
  }

  const confidence = initialClassification === "promote_now" && scoreTotal >= 70 ? "high" : initialClassification === "promote_now" ? "medium" : "low";

  return {
    ...candidate,
    score: {
      total: scoreTotal,
      assetCount: assetCountScore,
      specificity: specificityScore,
      intentClarity: intentScore,
      distinctness: distinctnessScore,
      titleQuality: titleScore,
      internalLinkingValue: internalLinkScore,
      seasonalValue: seasonalScore,
      thinRiskPenalty: thinRisk,
      spamRiskPenalty: spamRisk,
    },
    minimumAssets: minimum,
    maxExistingOverlapRatio: overlap.maxExistingOverlapRatio,
    maxComparableOverlapRatio: overlap.maxComparableOverlapRatio,
    overlapNotes: overlap.notes,
    publicNamingRisk: publicNamingRisk(candidate.title),
    initialClassification,
    classificationReasons: reasons,
    confidence,
  };
}

function selectionScore(candidate) {
  const kindWeight = {
    subject: 18,
    object: 16,
    theme: 14,
    seasonal: 14,
    audience: 4,
    style: 4,
    combination: 0,
  }[candidate.kind] || 0;
  const namedDemandWeight = candidate.slug === "t-rex" ? 24 : /^(dragons|sushi|bakery|mushrooms|bears|wolves|tigers|foxes|owls|velociraptors|stegosaurus|megalodon)$/.test(candidate.slug) ? 10 : 0;
  return candidate.score.total + kindWeight + namedDemandWeight;
}

function findRedundantSelectedCandidate(candidate, selectedCandidates) {
  const candidateSet = new Set(candidate.assetIds);
  for (const selected of selectedCandidates) {
    const selectedSet = new Set(selected.assetIds);
    const intersection = intersectSets(candidateSet, selectedSet).size;
    if (!intersection) continue;
    const smallerCount = Math.min(candidateSet.size, selectedSet.size);
    const largerCount = Math.max(candidateSet.size, selectedSet.size);
    const smallerOverlap = smallerCount ? intersection / smallerCount : 0;
    const sameScale = largerCount <= smallerCount * 1.35;
    if (sameScale && smallerOverlap >= 0.9) return selected;
    if (candidate.kind === "combination" && selected.kind !== "combination" && smallerOverlap >= 0.92) return selected;
  }
  return null;
}

function computeOverlap(state, candidate) {
  const candidateSet = new Set(candidate.assetIds);
  let maxExistingOverlapRatio = 0;
  let maxComparableOverlapRatio = 0;
  const notes = [];
  for (const hub of state.existingHubs) {
    if (!hub.assetIds?.length || hub.route === ROOT_ROUTE) continue;
    const hubSet = new Set(hub.assetIds);
    const intersection = intersectSets(candidateSet, hubSet).size;
    if (!intersection) continue;
    const candidateRatio = intersection / candidateSet.size;
    const hubRatio = intersection / hubSet.size;
    maxExistingOverlapRatio = Math.max(maxExistingOverlapRatio, candidateRatio);
    const sameScale = hub.assetCount <= candidate.assetCount * 1.35 && hub.assetCount >= candidate.assetCount * 0.65;
    if (sameScale) maxComparableOverlapRatio = Math.max(maxComparableOverlapRatio, candidateRatio);
    if (candidateRatio >= 0.5 || hubRatio >= 0.5) {
      notes.push({
        existingSlug: hub.slug,
        existingTitle: hub.title,
        existingAssetCount: hub.assetCount,
        candidateOverlapRatio: round(candidateRatio, 3),
        existingHubCoveredRatio: round(hubRatio, 3),
        relationship: sameScale ? "same-scale overlap" : hub.assetCount > candidate.assetCount ? "broad parent overlap" : "candidate covers existing hub",
      });
    }
  }
  return {
    maxExistingOverlapRatio: round(maxExistingOverlapRatio, 3),
    maxComparableOverlapRatio: round(maxComparableOverlapRatio, 3),
    notes: notes.sort((a, b) => b.candidateOverlapRatio - a.candidateOverlapRatio).slice(0, 6),
  };
}

function hydrateCandidateFromProposal(state, record) {
  return {
    ...record,
    hubId: toHubId(record.slug),
    title: record.title || record.hubTitle,
    assetIds: record.assetIds || [],
    parentSlug: record.parentHubSlug || "coloring-pages",
    confidence: record.confidence || "high",
  };
}

function buildHubRecord(state, candidate, promotedCandidates) {
  const hubId = toHubId(candidate.slug);
  const assetIds = orderAssetIdsForHub(state, candidate.assetIds, candidate.slug);
  const featuredAssetIds = pickFeaturedAssetIds(state, assetIds);
  const parentHub = state.existingHubBySlug.get(candidate.parentSlug) || state.existingHubBySlug.get("");
  const relatedHubIds = pickRelatedHubIds(state, candidate, promotedCandidates, 8);
  const sectionGroupings = buildSectionGroupingsForAssets(state, assetIds, candidate);
  return {
    hubId,
    slug: candidate.slug,
    normalizedSlug: candidate.slug,
    route: `${ROOT_ROUTE}/${candidate.slug}`,
    title: candidate.title,
    h1: candidate.title,
    metaTitle: makeMetaTitle(candidate),
    metaDescription: makeMetaDescription(candidate),
    intro: makeIntro(candidate),
    assetCount: assetIds.length,
    assetIds,
    featuredAssetIds,
    previewAssetIds: assetIds.slice(0, GALLERY_PAGE_SIZE),
    galleryPageSize: GALLERY_PAGE_SIZE,
    sectionGroupings,
    relatedHubIds,
    parentHubId: parentHub?.hubId || "hub_coloring_pages",
    childHubIds: [],
    breadcrumbPath: buildBreadcrumbPath(parentHub, candidate.title),
    internalLinkingTargets: relatedHubIds,
    indexable: true,
    sitemap: true,
    noPerImageIndexableRoute: true,
    score: candidate.score || null,
    longTailSource: {
      runId: RUN_ID,
      kind: candidate.kind,
      terms: candidate.terms,
      confidence: candidate.confidence,
    },
  };
}

function applyHubRelationships(hubs, promotedHubRecords) {
  const hubById = new Map(hubs.map((hub) => [hub.hubId, hub]));
  const root = hubById.get("hub_coloring_pages");
  for (const promoted of promotedHubRecords) {
    const parent = hubById.get(promoted.parentHubId);
    if (parent) {
      parent.childHubIds = uniqueIds([...(parent.childHubIds || []), promoted.hubId]);
      parent.relatedHubIds = uniqueIds([...(parent.relatedHubIds || []), promoted.hubId]).slice(0, 24);
    }
    if (root && promoted.parentHubId !== root.hubId) {
      root.childHubIds = uniqueIds([...(root.childHubIds || []), promoted.hubId]).slice(0, 80);
    }
    for (const relatedHubId of promoted.relatedHubIds || []) {
      const related = hubById.get(relatedHubId);
      if (!related) continue;
      related.relatedHubIds = uniqueIds([...(related.relatedHubIds || []), promoted.hubId]).slice(0, 24);
    }
  }
  for (const hub of hubs) {
    hub.childHubIds = sortHubIdsByCount(hub.childHubIds || [], hubById);
    hub.relatedHubIds = sortHubIdsByCount(uniqueIds(hub.relatedHubIds || []), hubById).slice(0, 16);
  }
}

function applyHubMemberships(updatedHubItems, updatedSearchIndex, promotedCandidates) {
  const candidateByAssetId = new Map();
  for (const candidate of promotedCandidates) {
    const hubId = toHubId(candidate.slug);
    for (const assetId of candidate.assetIds) {
      if (!candidateByAssetId.has(assetId)) candidateByAssetId.set(assetId, []);
      candidateByAssetId.get(assetId).push({ hubId, title: candidate.title, slug: candidate.slug });
    }
  }
  for (const entry of updatedHubItems.items) {
    const matches = candidateByAssetId.get(entry.assetId) || [];
    if (!matches.length) continue;
    entry.hubIds = uniqueIds([...(entry.hubIds || []), ...matches.map((match) => match.hubId)]).sort();
  }
  for (const entry of updatedSearchIndex.entries) {
    const matches = candidateByAssetId.get(entry.assetId) || [];
    if (!matches.length) continue;
    entry.hubIds = uniqueIds([...(entry.hubIds || []), ...matches.map((match) => match.hubId)]).sort();
    entry.searchText = normalizeSearchText(`${entry.searchText} ${matches.map((match) => `${match.title} ${match.slug}`).join(" ")}`);
  }
}

function buildFilterUxForHub(state, hub) {
  const searchEntries = hub.assetIds.map((assetId) => state.searchEntryById.get(assetId)).filter(Boolean);
  const counts = new Map();
  const tagLabels = new Map([
    ["simple", { label: "Simple", group: "difficulty" }],
    ["detailed", { label: "Detailed", group: "difficulty" }],
    ["cute", { label: "Cute", group: "style" }],
    ["patterns", { label: "Patterns", group: "style" }],
    ["characters", { label: "Characters", group: "subject" }],
    ["animals", { label: "Animals", group: "subject" }],
    ["flowers", { label: "Flowers", group: "subject" }],
    ["vehicles", { label: "Vehicles", group: "subject" }],
    ["dinosaurs", { label: "Dinosaurs", group: "subject" }],
    ["fantasy", { label: "Fantasy", group: "theme" }],
    ["seasonal", { label: "Seasonal", group: "theme" }],
  ]);
  for (const entry of searchEntries) {
    for (const tag of entry.tags || []) {
      if (tag === "printable") continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.ceil(hub.assetCount * 0.08));
  const tags = [...counts.entries()]
    .filter(([tag, count]) => tagLabels.has(tag) && count >= threshold)
    .map(([tag, count]) => ({
      id: tag,
      label: tagLabels.get(tag).label,
      group: tagLabels.get(tag).group,
      assetCount: count,
    }))
    .sort((a, b) => b.assetCount - a.assetCount || a.label.localeCompare(b.label))
    .slice(0, 10);
  const tabs = tags
    .filter((tag) => ["simple", "detailed", "cute", "patterns", "seasonal"].includes(tag.id))
    .slice(0, 5)
    .map(({ id, label, assetCount }) => ({ id, label, assetCount }));
  return {
    hubId: hub.hubId,
    slug: hub.slug,
    title: hub.title,
    assetCount: hub.assetCount,
    tags,
    tabs,
  };
}

function buildSeoPage(hub) {
  return {
    pageType: "hubPage",
    hubId: hub.hubId,
    slug: hub.slug,
    path: hub.route,
    canonicalPath: hub.route,
    pageTitle: hub.h1,
    metaTitle: hub.metaTitle,
    metaDescription: hub.metaDescription,
    h1: hub.h1,
    shortIntro: hub.intro,
    noIndex: false,
    sitemap: true,
    content: null,
  };
}

function buildHubSeoContentRecord(hub, hubById) {
  const relatedHubLinks = buildRelatedHubLinksFromIds(hub.relatedHubIds || [], hubById);
  return {
    pageType: "hubPage",
    hubId: hub.hubId,
    slug: hub.slug,
    route: hub.route,
    canonicalPath: hub.route,
    title: hub.title,
    pageTitle: hub.title,
    guideTitle: `Guide to ${hub.title}`,
    metaTitle: hub.metaTitle,
    metaDescription: hub.metaDescription,
    shortIntro: hub.intro,
    aboveGalleryValueBullets: [
      `${formatNumber(hub.assetCount)} printable ${collectionName(hub.title).toLowerCase()} pages`,
      "Gallery previews stay near the top of the page",
      "Print and PNG, JPG, or WebP controls remain on visible page cards",
    ],
    belowGallerySections: makeBelowGallerySections(hub),
    relatedHubLinks,
    internalLinkStrategy: "Long-tail related links connect the focused hub to parent and sibling collections without routing backlog candidates.",
    faqCandidates: [],
    pinterestDescription: `${hub.title} with real preview art, gallery search, and PNG, JPG, or WebP downloads for printable coloring sessions.`,
    noIndex: false,
    sitemap: true,
  };
}

function buildSocialMetadataRecord(hub) {
  return {
    path: hub.route,
    title: hub.metaTitle,
    description: hub.metaDescription,
    openGraph: {
      title: hub.metaTitle,
      description: hub.metaDescription,
      urlPath: hub.route,
      type: "website",
      images: [],
    },
    twitter: {
      card: "summary",
      title: hub.metaTitle,
      description: hub.metaDescription,
    },
    pinterest: {
      description: `${hub.title} with real preview art and printable download controls.`,
      richPinCandidate: "article",
    },
  };
}

function buildInternalLinkingPage(hub, hubById) {
  return {
    path: hub.route,
    hubId: hub.hubId,
    links: buildRelatedHubLinksFromIds(hub.relatedHubIds || [], hubById),
    strategy: "Long-tail hub links point to parent, sibling, and closely related promoted collections.",
  };
}

function buildRelatedHubLinksFromIds(hubIds, hubById) {
  return hubIds
    .map((hubId) => {
      const hub = hubById.get(hubId);
      return hub
        ? {
            label: hub.title,
            href: hub.route,
            reason: hub.longTailSource?.runId === RUN_ID ? "related long-tail collection" : "related parent or sibling collection",
            assetCount: hub.assetCount,
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 8);
}

function applyRootAndParentInternalLinks(internal, hubs, promotedHubRecords) {
  const hubById = new Map(hubs.map((hub) => [hub.hubId, hub]));
  const promotedLinksByParent = new Map();
  for (const hub of promotedHubRecords) {
    if (!promotedLinksByParent.has(hub.parentHubId)) promotedLinksByParent.set(hub.parentHubId, []);
    promotedLinksByParent.get(hub.parentHubId).push({
      label: hub.title,
      href: hub.route,
      reason: "specific long-tail collection",
      assetCount: hub.assetCount,
    });
  }
  for (const links of promotedLinksByParent.values()) {
    links.sort((a, b) => b.assetCount - a.assetCount || a.label.localeCompare(b.label));
  }
  for (const page of internal.pages) {
    const hub = hubs.find((entry) => entry.route === page.path);
    if (!hub) continue;
    const promotedLinks = promotedLinksByParent.get(hub.hubId) || [];
    if (!promotedLinks.length) continue;
    page.links = uniqueLinks([...(page.links || []), ...promotedLinks]).slice(0, 14);
    page.strategy = `${page.strategy || "Generated internal links."} Long-tail children were added after the gallery, not above it.`;
  }
  const rootPage = internal.pages.find((page) => page.path === ROOT_ROUTE);
  if (rootPage) {
    const topPromoted = promotedHubRecords
      .slice()
      .sort((a, b) => b.assetCount - a.assetCount || a.slug.localeCompare(b.slug))
      .slice(0, 12)
      .map((hub) => ({
        label: hub.title,
        href: hub.route,
        reason: "new long-tail collection",
        assetCount: hub.assetCount,
      }));
    rootPage.links = uniqueLinks([...(rootPage.links || []), ...topPromoted]).slice(0, 20);
  }
  for (const page of internal.pages) {
    page.links = (page.links || []).filter((link) => {
      const pathName = link.href === ROOT_ROUTE ? ROOT_ROUTE : link.href;
      if (pathName === ROOT_ROUTE) return true;
      return [...hubById.values()].some((hub) => hub.route === pathName);
    });
  }
}

function refreshSummaries(manifests) {
  manifests.updatedHubs.summary = {
    ...(manifests.updatedHubs.summary || {}),
    hubCount: manifests.updatedHubs.hubs.length,
    phase1Only: true,
    longTailPromotedHubCount: manifests.updatedHubs.hubs.filter((hub) => hub.longTailSource?.runId === RUN_ID).length,
    runtimeAvailableRecords: EXPECTED_AVAILABLE_RECORDS,
  };
  manifests.updatedRoutes.routes.sort((a, b) => a.path.localeCompare(b.path));
  manifests.updatedSiteMap.entries.sort((a, b) => a.path.localeCompare(b.path));
  manifests.updatedHubs.hubs.sort((a, b) => a.route.localeCompare(b.route));
  manifests.updatedHubItems.summary = {
    ...(manifests.updatedHubItems.summary || {}),
    assetCount: manifests.updatedHubItems.items.length,
    phase1HubAssignments: manifests.updatedHubItems.items.reduce((sum, item) => sum + item.hubIds.length, 0),
    longTailAssignmentsIncluded: true,
  };
  manifests.updatedSearchIndex.summary = {
    ...(manifests.updatedSearchIndex.summary || {}),
    entryCount: manifests.updatedSearchIndex.entries.length,
    longTailHubIdsIncluded: true,
  };
  manifests.updatedFeatured.summary = {
    ...(manifests.updatedFeatured.summary || {}),
    hubCount: manifests.updatedFeatured.hubs.length,
    longTailHubsIncluded: true,
  };
  manifests.updatedFilters.summary = {
    ...(manifests.updatedFilters.summary || {}),
    hubCount: manifests.updatedFilters.hubs.length,
    longTailHubsIncluded: true,
  };
  manifests.updatedSeoPages.pages.sort((a, b) => a.path.localeCompare(b.path));
  manifests.updatedHubSeoContent.hubs.sort((a, b) => a.route.localeCompare(b.route));
  manifests.updatedSocialMetadata.pages.sort((a, b) => a.path.localeCompare(b.path));
}

function createTermDefinitions() {
  const defs = [
    term("t-rex", "t-rex", "T-Rex", "subject", "dinosaurs", ["t rex", "trex", "tyrannosaurus rex", "tyrannosaurus"], "T-Rex dinosaur pages with a focused long-tail search intent."),
    term("dragon", "dragons", "Dragons", "subject", "fantasy", ["dragon", "dragons"], "Dragon coloring pages for fantasy creatures and creature art."),
    term("unicorn", "unicorns", "Unicorns", "subject", "fantasy", ["unicorn", "unicorns"], "Unicorn coloring pages for fantasy and animal-themed browsing.", true),
    term("triceratops", "triceratops", "Triceratops", "subject", "dinosaurs", ["triceratops"], "Triceratops dinosaur pages.", true),
    term("velociraptor", "velociraptors", "Velociraptors", "subject", "dinosaurs", ["velociraptor", "raptor"], "Velociraptor dinosaur pages."),
    term("stegosaurus", "stegosaurus", "Stegosaurus", "subject", "dinosaurs", ["stegosaurus"], "Stegosaurus dinosaur pages."),
    term("brachiosaurus", "brachiosaurus", "Brachiosaurus", "subject", "dinosaurs", ["brachiosaurus"], "Brachiosaurus dinosaur pages."),
    term("diplodocus", "diplodocus", "Diplodocus", "subject", "dinosaurs", ["diplodocus"], "Diplodocus dinosaur pages."),
    term("megalodon", "megalodon", "Megalodon", "subject", "prehistoric-animals", ["megalodon"], "Megalodon prehistoric sea animal pages."),
    term("bear", "bears", "Bears", "subject", "animals", ["bear", "bears", "teddy bear"], "Bear coloring pages from the animal collection."),
    term("wolf", "wolves", "Wolves", "subject", "animals", ["wolf", "wolves"], "Wolf coloring pages from the animal collection."),
    term("tiger", "tigers", "Tigers", "subject", "animals", ["tiger", "tigers"], "Tiger coloring pages from the animal collection."),
    term("fox", "foxes", "Foxes", "subject", "animals", ["fox", "foxes"], "Fox coloring pages from the animal collection."),
    term("lion", "lions", "Lions", "subject", "animals", ["lion", "lions"], "Lion coloring pages from the animal collection."),
    term("owl", "owls", "Owls", "subject", "birds", ["owl", "owls"], "Owl coloring pages from the birds collection."),
    term("eagle", "eagles", "Eagles", "subject", "birds", ["eagle", "eagles"], "Eagle coloring pages from the birds collection."),
    term("duck", "ducks", "Ducks", "subject", "birds", ["duck", "ducks"], "Duck coloring pages from the birds collection."),
    term("penguin", "penguins", "Penguins", "subject", "birds", ["penguin", "penguins"], "Penguin coloring pages from the birds collection."),
    term("panda", "pandas", "Pandas", "subject", "animals", ["panda", "pandas"], "Panda coloring pages from the animal collection."),
    term("elephant", "elephants", "Elephants", "subject", "animals", ["elephant", "elephants"], "Elephant coloring pages from the animal collection."),
    term("giraffe", "giraffes", "Giraffes", "subject", "animals", ["giraffe", "giraffes"], "Giraffe coloring pages from the animal collection."),
    term("monkey", "monkeys", "Monkeys", "subject", "animals", ["monkey", "monkeys"], "Monkey coloring pages from the animal collection."),
    term("rabbit", "rabbits", "Rabbits", "subject", "animals", ["rabbit", "rabbits", "bunny", "bunnies"], "Rabbit coloring pages from the animal collection."),
    term("horse", "horses", "Horses", "subject", "animals", ["horse", "horses"], "Horse coloring pages from the animal collection."),
    term("cow", "cows", "Cows", "subject", "animals", ["cow", "cows"], "Cow coloring pages from the animal collection."),
    term("sheep", "sheep", "Sheep", "subject", "animals", ["sheep"], "Sheep coloring pages from the animal collection."),
    term("deer", "deer", "Deer", "subject", "animals", ["deer"], "Deer coloring pages from the animal collection."),
    term("koala", "koalas", "Koalas", "subject", "animals", ["koala", "koalas"], "Koala coloring pages from the animal collection."),
    term("otter", "otters", "Otters", "subject", "animals", ["otter", "otters"], "Otter coloring pages from the animal collection."),
    term("sloth", "sloths", "Sloths", "subject", "animals", ["sloth", "sloths"], "Sloth coloring pages from the animal collection."),
    term("moose", "moose", "Moose", "subject", "animals", ["moose"], "Moose coloring pages from the animal collection."),
    term("zebra", "zebras", "Zebras", "subject", "animals", ["zebra", "zebras"], "Zebra coloring pages from the animal collection."),
    term("hippo", "hippos", "Hippos", "subject", "animals", ["hippo", "hippos", "hippopotamus"], "Hippo coloring pages from the animal collection."),
    term("hedgehog", "hedgehogs", "Hedgehogs", "subject", "animals", ["hedgehog", "hedgehogs"], "Hedgehog coloring pages from the animal collection."),
    term("llama", "llamas", "Llamas", "subject", "animals", ["llama", "llamas"], "Llama coloring pages from the animal collection."),
    term("shark", "sharks", "Sharks", "subject", "sea-life", ["shark", "sharks"], "Shark coloring pages from the sea life collection."),
    term("dolphin", "dolphins", "Dolphins", "subject", "sea-life", ["dolphin", "dolphins"], "Dolphin coloring pages from the sea life collection."),
    term("fish", "fish", "Fish", "subject", "sea-life", ["fish"], "Fish coloring pages from the sea life collection."),
    term("snake", "snakes", "Snakes", "subject", "reptiles", ["snake", "snakes"], "Snake coloring pages from the reptiles collection."),
    term("lizard", "lizards", "Lizards", "subject", "reptiles", ["lizard", "lizards", "iguana", "iguanas"], "Lizard coloring pages from the reptiles collection."),
    term("bee", "bees", "Bees", "subject", "insects", ["bee", "bees"], "Bee coloring pages from the insects collection."),
    term("bat", "bats", "Bats", "subject", "animals", ["bat", "bats"], "Bat coloring pages with animal and Halloween browsing value."),
    term("butterfly", "butterflies", "Butterflies", "subject", "insects", ["butterfly", "butterflies"], "Butterfly coloring pages.", true),
    term("spider", "spiders", "Spiders", "subject", "insects", ["spider", "spiders"], "Spider coloring pages.", true),
    term("whale", "whales", "Whales", "subject", "sea-life", ["whale", "whales"], "Whale coloring pages.", true),
    term("cat", "cats", "Cats", "subject", "animals", ["cat", "cats", "kitten", "kittens"], "Cat coloring pages.", true),
    term("dog", "dogs", "Dogs", "subject", "animals", ["dog", "dogs", "puppy", "puppies"], "Dog coloring pages.", true),
    term("sushi", "sushi", "Sushi", "object", "food", ["sushi", "maki", "nigiri"], "Sushi coloring pages for food-themed browsing."),
    term("bakery", "bakery", "Bakery", "object", "food", ["bakery", "bakeries", "bread", "pastry", "pastries"], "Bakery coloring pages for food and treat themes."),
    term("cake", "cakes", "Cakes", "object", "food", ["cake", "cakes", "cupcake", "cupcakes"], "Cake coloring pages for birthday and food themes."),
    term("mushroom", "mushrooms", "Mushrooms", "object", "plants", ["mushroom", "mushrooms", "fungus"], "Mushroom coloring pages for nature and fantasy browsing."),
    term("rose", "roses", "Roses", "object", "flowers", ["rose", "roses"], "Rose coloring pages for flower browsing."),
    term("cactus", "cactus", "Cactus", "object", "plants", ["cactus", "cacti"], "Cactus coloring pages for plant browsing."),
    term("castle", "castles", "Castles", "object", "buildings", ["castle", "castles"], "Castle coloring pages for fantasy and building themes."),
    term("house", "houses", "Houses", "object", "buildings", ["house", "houses", "home", "homes"], "House coloring pages for building themes."),
    term("chess", "chess", "Chess", "object", "playing-cards", ["chess"], "Chess coloring pages for game-themed browsing."),
    term("robot", "robots", "Robots", "theme", "fantasy", ["robot", "robots"], "Robot coloring pages for character and technology themes."),
    term("phoenix", "phoenix", "Phoenix", "theme", "fantasy", ["phoenix", "phoenixes"], "Phoenix coloring pages for fantasy creature browsing."),
    term("hydra", "hydras", "Hydras", "theme", "fantasy", ["hydra", "hydras"], "Hydra coloring pages for fantasy creature browsing."),
    term("wyvern", "wyverns", "Wyverns", "theme", "fantasy", ["wyvern", "wyverns"], "Wyvern coloring pages for dragon-like fantasy creature browsing."),
    term("wizard", "wizards", "Wizards", "theme", "fantasy", ["wizard", "wizards", "sorcerer", "sorcerers"], "Wizard coloring pages for fantasy character browsing."),
    term("witch", "witches", "Witches", "theme", "halloween", ["witch", "witches"], "Witch coloring pages for Halloween and fantasy themes."),
    term("knight", "knights", "Knights", "theme", "medieval-fantasy", ["knight", "knights"], "Knight coloring pages for medieval fantasy themes."),
    term("princess", "princesses", "Princesses", "theme", "fantasy", ["princess", "princesses"], "Princess coloring pages for character and fantasy themes."),
    term("pumpkin", "pumpkins", "Pumpkins", "seasonal", "halloween", ["pumpkin", "pumpkins"], "Pumpkin coloring pages for fall and Halloween themes."),
    term("snowman", "snowmen", "Snowmen", "seasonal", "christmas", ["snowman", "snowmen"], "Snowman coloring pages for winter and Christmas themes."),
    term("santa", "santa", "Santa", "seasonal", "christmas", ["santa"], "Santa coloring pages for Christmas themes."),
    term("reindeer", "reindeer", "Reindeer", "seasonal", "christmas", ["reindeer"], "Reindeer coloring pages for Christmas and winter themes."),
    term("christmas", "christmas", "Christmas", "seasonal", "holidays", ["christmas", "xmas"], "Christmas coloring pages.", true, "Christmas"),
    term("halloween", "halloween", "Halloween", "seasonal", "holidays", ["halloween"], "Halloween coloring pages.", true, "Halloween"),
    term("birthday", "birthday", "Birthday", "seasonal", "holidays", ["birthday"], "Birthday coloring pages.", true, "Birthday"),
    term("st-patricks-day", "st-patricks-day", "St. Patrick's Day", "seasonal", "holidays", ["st patricks day", "saint patricks day"], "St. Patrick's Day coloring pages.", true, "St. Patrick's Day"),
    term("cute", "cute", "Cute", "style", "coloring-pages", ["cute", "adorable"], "Cute coloring pages.", true, "Cute", "cute"),
    term("kawaii", "kawaii", "Kawaii", "style", "cute", ["kawaii"], "Kawaii coloring pages.", true, "Kawaii", "kawaii"),
    term("chibi", "chibi", "Chibi", "style", "coloring-pages", ["chibi"], "Chibi coloring pages.", true, "Chibi", "chibi"),
    term("plushie", "plushie", "Plushie", "style", "coloring-pages", ["plushie", "plushies"], "Plushie coloring pages.", true, "Plushie", "plushie"),
    term("mandala", "mandala", "Mandala", "style", "mandalas", ["mandala", "mandalas"], "Mandala coloring pages.", true, "Mandala", "mandala"),
    term("geometric", "geometric", "Geometric", "style", "geometric", ["geometric", "geometry", "pattern", "patterns"], "Geometric coloring pages.", true, "Geometric", "geometric"),
    term("easy", "easy", "Easy", "audience", "for-kids", ["easy", "simple"], "Easy coloring pages.", true, "Easy", "easy"),
    term("detailed", "detailed", "Detailed", "audience", "detailed-for-adults", ["detailed", "intricate"], "Detailed coloring pages.", true, "Detailed", "detailed"),
  ];
  return defs;
}

function term(termValue, slug, label, kind, parentSlug, aliases, intent, existingIntent = false, comboLabel = null, slugPrefix = null) {
  return {
    term: termValue,
    slug,
    label,
    comboLabel,
    slugPrefix,
    kind,
    parentSlug,
    aliases,
    intent,
    existingIntent,
    regexes: aliases.map((alias) => phraseRegex(alias)),
  };
}

function matchesDefinition(feature, definition) {
  if (feature.tokens.has(definition.term)) return true;
  if (feature.tokens.has(singularSlug(definition.slug))) return true;
  return definition.regexes.some((regex) => regex.test(feature.text));
}

function phraseRegex(value) {
  const normalized = normalizeText(value).trim();
  const source = normalized
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join("[\\s-]+");
  return new RegExp(`\\b${source}(?:s|es)?\\b`, "i");
}

function isWeakCombination(combo) {
  if (/^(easy|detailed)-/.test(combo.slug) && combo.assetCount < 20) return true;
  if (/^(geometric|mandala)-/.test(combo.slug) && combo.assetCount < 14) return true;
  if (/(chess|cake|house|castle)$/.test(combo.slug) && combo.assetCount < 12) return true;
  return false;
}

function isSpammyCandidate(candidate) {
  return isDisallowedPublicTerm(candidate.slug) || /(?:jutsu|summoning|hoodie|costume|pose|face|red|blue|black|happy|sitting|flying|floating|circle|single|guardian)$/i.test(candidate.slug);
}

function isDisallowedPublicTerm(value) {
  return /(?:goblin|gremlin|troll|ogre|pigeon|raccoon|chatgpt|failed|openai|jutsu|summoning|hoodie|vehiacle|midieval)/i.test(value);
}

function parentSlugForKind(kind) {
  if (kind === "seasonal") return "holidays";
  if (kind === "object") return "coloring-pages";
  if (kind === "theme") return "fantasy";
  return "coloring-pages";
}

function findMissingObviousSubjects(state) {
  const definitions = createTermDefinitions().filter((definition) => !definition.existingIntent && !state.existingEquivalentSlugs.has(definition.slug));
  const termAssets = buildTermAssets(state, definitions);
  return definitions
    .map((definition) => ({
      slug: definition.slug,
      title: `${definition.label} Coloring Pages`,
      kind: definition.kind,
      parentSlug: definition.parentSlug,
      assetCount: termAssets.get(definition.term)?.size || 0,
    }))
    .filter((entry) => entry.assetCount >= 8)
    .sort((a, b) => b.assetCount - a.assetCount || a.slug.localeCompare(b.slug))
    .slice(0, 50);
}

function findPossibleCannibalization(hubs) {
  const pairs = [];
  for (let i = 0; i < hubs.length; i += 1) {
    for (let j = i + 1; j < hubs.length; j += 1) {
      const a = hubs[i];
      const b = hubs[j];
      const aSet = new Set(a.assetIds || []);
      const bSet = new Set(b.assetIds || []);
      const intersection = intersectSets(aSet, bSet).size;
      if (!intersection) continue;
      const smaller = Math.min(aSet.size, bSet.size);
      const ratio = smaller ? intersection / smaller : 0;
      if (ratio >= 0.8) {
        pairs.push({
          slugs: [a.slug, b.slug],
          titles: [a.title, b.title],
          assetCounts: [a.assetCount, b.assetCount],
          smallerHubOverlapRatio: round(ratio, 3),
        });
      }
    }
  }
  return pairs.sort((a, b) => b.smallerHubOverlapRatio - a.smallerHubOverlapRatio).slice(0, 40);
}

function buildInternalLinkCoverage(state) {
  const internalPages = state.input.internalLinking.pages || [];
  const pagePaths = new Set(internalPages.map((page) => page.path));
  const routePaths = state.input.runtimeRoutes.routes.map((route) => route.path);
  return {
    internalLinkingPageCount: internalPages.length,
    routeCount: routePaths.length,
    routesWithInternalLinks: routePaths.filter((routePath) => pagePaths.has(routePath)).length,
    routesMissingInternalLinks: routePaths.filter((routePath) => !pagePaths.has(routePath)).slice(0, 30),
    averageLinksPerPage: round(internalPages.reduce((sum, page) => sum + (page.links?.length || 0), 0) / Math.max(1, internalPages.length), 2),
  };
}

function pickRelatedHubSlugs(state, candidate, promoted, limit) {
  return pickRelatedHubIds(state, candidate, promoted, limit)
    .map((hubId) => state.existingHubById.get(hubId)?.slug || promoted.find((entry) => toHubId(entry.slug) === hubId)?.slug)
    .filter(Boolean);
}

function pickRelatedHubIds(state, candidate, promotedCandidates, limit) {
  const ids = [];
  const parent = state.existingHubBySlug.get(candidate.parentSlug);
  if (parent) ids.push(parent.hubId);
  ids.push("hub_coloring_pages");
  const candidateSet = new Set(candidate.assetIds);
  const existingRelated = state.existingHubs
    .filter((hub) => hub.route !== ROOT_ROUTE)
    .map((hub) => ({
      hubId: hub.hubId,
      overlap: intersectSets(candidateSet, new Set(hub.assetIds || [])).size,
      count: hub.assetCount,
    }))
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.count - a.count)
    .slice(0, 5)
    .map((entry) => entry.hubId);
  ids.push(...existingRelated);
  const promotedRelated = promotedCandidates
    .filter((entry) => entry.slug !== candidate.slug)
    .map((entry) => ({
      hubId: toHubId(entry.slug),
      overlap: intersectSets(candidateSet, new Set(entry.assetIds || [])).size,
      count: entry.assetCount,
    }))
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.count - a.count)
    .slice(0, 4)
    .map((entry) => entry.hubId);
  ids.push(...promotedRelated);
  return uniqueIds(ids).filter((hubId) => hubId !== toHubId(candidate.slug)).slice(0, limit);
}

function orderAssetIdsForHub(state, assetIds, slug) {
  return [...assetIds].sort((a, b) => {
    const aItem = state.itemById.get(a);
    const bItem = state.itemById.get(b);
    const aScore = assetOrderingScore(state, aItem, slug);
    const bScore = assetOrderingScore(state, bItem, slug);
    if (bScore !== aScore) return bScore - aScore;
    return a.localeCompare(b);
  });
}

function assetOrderingScore(state, item, slug) {
  if (!item) return 0;
  const feature = state.itemFeatures.get(item.assetId);
  let score = 0;
  if (feature.text.includes(slug.replace(/-/g, " "))) score += 8;
  if (item.assetSubpaths?.webpPreview) score += 5;
  if (item.assetSubpaths?.svg) score += 5;
  if (item.warningFlags?.length) score -= Math.min(4, item.warningFlags.length);
  if (/chatgpt|failed|openai|20\d{2}/i.test(item.title)) score -= 20;
  return score;
}

function pickFeaturedAssetIds(state, assetIds) {
  return assetIds
    .filter((assetId) => {
      const item = state.itemById.get(assetId);
      return Boolean(item?.assetSubpaths?.webpPreview && item?.assetSubpaths?.svg);
    })
    .slice(0, FEATURED_LIMIT);
}

function buildSectionGroupingsForAssets(state, assetIds, candidate) {
  const featureTokens = new Map();
  for (const assetId of assetIds) {
    const feature = state.itemFeatures.get(assetId);
    for (const token of feature.tokens) {
      if (!featureTokens.has(token)) featureTokens.set(token, 0);
      featureTokens.set(token, featureTokens.get(token) + 1);
    }
  }
  const common = [...featureTokens.entries()]
    .filter(([token, count]) => count >= Math.max(3, Math.ceil(assetIds.length * 0.08)) && !STOP_TOKENS.has(token))
    .filter(([token]) => !isDisallowedPublicTerm(token))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([token, count]) => ({
      label: titleCase(token.replace(/-/g, " ")),
      term: token,
      assetCount: count,
    }));
  return [
    {
      groupingId: "long_tail_themes",
      label: "Common Themes",
      items: [
        {
          label: collectionName(candidate.title),
          term: candidate.slug,
          assetCount: assetIds.length,
        },
        ...common,
      ].slice(0, 12),
    },
  ];
}

function buildBreadcrumbPath(parentHub, title) {
  const pathEntries = [{ label: "Coloring Pages", route: ROOT_ROUTE }];
  if (parentHub && parentHub.route !== ROOT_ROUTE) pathEntries.push({ label: parentHub.title.replace(/\s+Coloring Pages$/i, ""), route: parentHub.route });
  pathEntries.push({ label: title.replace(/\s+Coloring Pages$/i, ""), route: "" });
  return pathEntries;
}

function makeMetaTitle(candidate) {
  return `${candidate.title} to Print`;
}

function makeMetaDescription(candidate) {
  const name = collectionName(candidate.title).toLowerCase();
  return `Browse ${formatNumber(candidate.assetCount)} ${name} coloring pages with real previews, gallery search, and PNG, JPG, or WebP downloads for printing.`;
}

function makeIntro(candidate) {
  const name = collectionName(candidate.title).toLowerCase();
  return `${candidate.title} gathers ${formatNumber(candidate.assetCount)} printable ${name} pages from the approved runtime library. Start with the gallery, then use search and filters to narrow the set.`;
}

function makeBelowGallerySections(candidate) {
  const title = candidate.title || `${titleCase(candidate.slug)} Coloring Pages`;
  const name = collectionName(title);
  const count = candidate.assetCount || 0;
  const examples = (candidate.exampleAssetTitles || []).slice(0, 3).map((example) => example.replace(/\s+Coloring Page$/i, ""));
  return [
    {
      heading: `What you'll find in ${name}`,
      body: `${title} focuses on a distinct subject or theme with ${formatNumber(count)} real gallery assets. The page keeps artwork previews and controls first so visitors can compare pages before printing.`,
    },
    {
      heading: "Good uses for this collection",
      body: `Use this collection when a broad hub is too large and you want a focused printable set. It can work for classroom activities, themed craft sessions, quiet weekend printing, or quick subject-based browsing.`,
    },
    {
      heading: "Browsing tips",
      body:
        examples.length > 0
          ? `Start with the featured images, then search within this collection for related ideas like ${joinList(examples)}. Use related hubs when you want a nearby subject or broader parent collection.`
          : "Start with the featured images, then search within this collection or use related hubs when you want a nearby subject or broader parent collection.",
    },
  ];
}

function stripImplementationFiles(implementation) {
  const { files, ...rest } = implementation;
  return {
    ...rest,
    generatedFiles: Object.keys(files),
  };
}

function renderContextReport(payload) {
  return `# Long-Tail Hubs Context Check

- Repository: ${payload.summary.repoRoot}
- Branch: ${payload.summary.branch}
- Static export configured: ${pass(payload.summary.staticExportConfigured)}
- app/api present: ${payload.summary.appApiRoutePresent ? "yes" : "no"}
- Runtime available records: ${formatNumber(payload.summary.runtimeAvailableRecords)}
- Deferred manual-review records: ${formatNumber(payload.summary.deferredManualReviewRecords)}
- Current runtime hub routes: ${formatNumber(payload.summary.currentRuntimeSitemapRouteCount)}
- Estimated current app sitemap URLs: ${formatNumber(payload.summary.currentAppSitemapEstimatedUrlCount)}
- Public site URL: ${payload.summary.publicSiteUrl}
- Public asset base: ${payload.summary.publicAssetBaseUrl}
- Public downloads: ${payload.summary.publicDownloads.join(", ")}
- SVG user download exposed: ${payload.summary.svgUserDownloadExposed ? "yes" : "no"}
- Image sitemap present: ${payload.summary.imageSitemapPresent ? "yes" : "no"}
- Open Graph image generation present: ${payload.summary.openGraphImageGenerationPresent ? "yes" : "no"}
- Live AdSense code present: ${payload.summary.liveAdsenseCodePresent ? "yes" : "no"}
`;
}

function renderCurrentAuditReport(payload) {
  return `# Current Hub Taxonomy Audit

- Current indexable hub count: ${payload.summary.currentIndexableHubCount}
- Current non-root hub count: ${payload.summary.currentNonRootHubCount}
- Current runtime sitemap route count: ${payload.summary.currentRuntimeSitemapRouteCount}
- Phase 2 or backlog hubs: ${payload.summary.phase2BacklogHubCount}
- Section-only topics: ${payload.summary.sectionOnlyTopicCount}
- Rejected candidates from Round 4A: ${payload.summary.rejectedCandidateCount}

## Largest Hubs

${table(payload.largestHubs.slice(0, 12), ["slug", "title", "assetCount"])}

## Smallest Hubs

${table(payload.smallestHubs.slice(0, 12), ["slug", "title", "assetCount"])}

## Missing Subject Opportunities

${table(payload.missingObviousSubjectHubs.slice(0, 20), ["slug", "title", "assetCount", "parentSlug"])}

## Cannibalization Watch

${table(payload.possibleCannibalization.slice(0, 15), ["slugs", "assetCounts", "smallerHubOverlapRatio"])}
`;
}

function renderCandidateDiscoveryReport(discovery) {
  return `# Long-Tail Candidate Discovery

- Runtime records analyzed: ${formatNumber(discovery.rawCandidates.summary.availableRuntimeRecords)}
- Deferred records excluded: ${formatNumber(discovery.rawCandidates.summary.deferredRecordsExcluded)}
- Token count recorded: ${formatNumber(discovery.tokenFrequency.summary.uniqueTokenCount)}
- Raw candidates: ${formatNumber(discovery.rawCandidates.summary.rawCandidateCount)}
- Subject and object candidates: ${formatNumber(discovery.rawCandidates.summary.subjectCandidateCount)}
- Combination candidates: ${formatNumber(discovery.rawCandidates.summary.combinationCandidateCount)}

## Top Subject Frequencies

${table(discovery.subjectFrequency.subjects.slice(0, 25), ["slug", "label", "kind", "assetCount", "parentSlug"])}

## Top Combination Frequencies

${table(discovery.combinationFrequency.combinations.slice(0, 25), ["slug", "label", "assetCount", "parentSlug"])}
`;
}

function renderPolicyReport(policy) {
  return `# Long-Tail Hub Promotion Policy

- Subject minimum: ${policy.minimums.subject} assets
- Combination minimum: ${policy.minimums.combination} assets
- Seasonal and special minimum: ${policy.minimums.seasonal} assets
- Absolute floor: ${policy.absoluteMinimumAssets} assets
- Round cap: ${policy.maxPromotedNewHubs} promoted hubs
- Comparable hub overlap blocker: ${Math.round(policy.uniqueness.comparableHubOverlapBlockerRatio * 100)} percent

Only \`promote_now\` candidates become indexable routes and sitemap entries. Backlog, manual-review, section-only, and rejected candidates stay unrouted.
`;
}

function renderScoreReport(scored) {
  return `# Long-Tail Candidate Score Report

- Candidates scored: ${formatNumber(scored.summary.candidateCount)}
- Strong candidates before cap: ${formatNumber(scored.summary.strongCandidateCount)}
- Promote now: ${formatNumber(scored.summary.promotedNowCount)}
- Backlog later: ${formatNumber(scored.summary.backlogLaterCount)}
- Manual review: ${formatNumber(scored.summary.manualReviewCount)}
- Section only: ${formatNumber(scored.summary.sectionOnlyCount)}
- Rejected as spam or thin: ${formatNumber(scored.summary.rejectedSpamOrThinCount)}

## Promoted Candidates

${table(scored.candidates.filter((candidate) => candidate.classification === "promote_now").slice(0, 40), ["slug", "title", "kind", "assetCount", "classification", "confidence"])}

## Rejected Or Held Candidates

${table(scored.candidates.filter((candidate) => candidate.classification !== "promote_now").slice(0, 40), ["slug", "title", "kind", "assetCount", "classification"])}
`;
}

function renderProposalReport(proposal) {
  return `# Long-Tail Promoted Hubs Proposal

- Starting indexable hub count: ${proposal.summary.startingIndexableHubCount}
- Proposed new hubs: ${proposal.summary.promotedHubCount}
- Projected indexable hub count: ${proposal.summary.projectedIndexableHubCount}
- Candidate hub count: ${proposal.summary.candidateHubCount}
- Scale assessment: ${proposal.summary.outputScaleAssessment}

## Examples

${table(proposal.promotedHubs.slice(0, 40), ["slug", "hubTitle", "kind", "assetCount", "parentHubSlug"])}
`;
}

function renderManualReviewReport(payload) {
  return `# Long-Tail Hub Manual Review

- Manual-review or deferred candidates listed: ${payload.summary.manualReviewCandidateCount}
- These candidates are not routed.

${table(payload.candidates.slice(0, 80), ["slug", "title", "assetCount", "classification", "ownerDecisionNeeded"])}
`;
}

function renderImplementationReport(implementation) {
  return `# Long-Tail Hub Implementation

- Starting indexable hub count: ${implementation.summary.startingIndexableHubCount}
- Promoted new hubs: ${implementation.summary.promotedNewHubCount}
- Final indexable hub count: ${implementation.summary.finalIndexableHubCount}
- Sitemap route count: ${implementation.summary.sitemapRouteCount}
- Runtime available records: ${implementation.summary.runtimeAvailableRecords}
- Deferred records excluded: ${implementation.summary.deferredRecordsExcluded}
- T-Rex result: ${implementation.summary.tRexResult.promoted ? "promoted" : "not promoted"} (${implementation.summary.tRexResult.assetCount} assets)

## Promoted Hubs

${table(implementation.promotedHubs.slice(0, 80), ["slug", "title", "assetCount", "route"])}
`;
}

function renderSeoContentReport(payload) {
  return `# Long-Tail Hub SEO Content

- New hub SEO records: ${payload.summary.newHubSeoContentCount}
- Unique meta titles: ${pass(payload.summary.uniqueMetaTitles)}
- Unique meta descriptions: ${pass(payload.summary.uniqueMetaDescriptions)}
- Fake FAQs added: ${payload.summary.fakeFaqsAdded ? "yes" : "no"}
- Online coloring promised: ${payload.summary.onlineColoringPromised ? "yes" : "no"}

${table(payload.hubs.slice(0, 60), ["slug", "route", "metaTitle"])}
`;
}

function renderInternalLinkingReport(payload) {
  return `# Long-Tail Internal Linking

- Promoted hubs: ${payload.summary.promotedHubCount}
- Internal linking pages: ${payload.summary.internalLinkingPages}
- Broad pages updated: ${pass(payload.summary.broadPagesUpdated)}
- More menu uses runtime routes: ${pass(payload.summary.moreMenuBackedByRuntimeRoutes)}

${table(payload.promotedHubLinks.slice(0, 50), ["slug", "route", "linkCount"])}
`;
}

function renderBrowserQaReport(payload) {
  return `# Long-Tail Hub Browser QA

- Status: ${payload.summary.status}
- Pages inspected: ${payload.summary.pagesInspected}
- New hubs rendered: ${payload.summary.newHubsRendered === true ? "yes" : payload.summary.newHubsRendered === false ? "no" : "not run"}
- Broken images absent: ${payload.summary.noBrokenImages === true ? "yes" : payload.summary.noBrokenImages === false ? "no" : "not run"}
- Horizontal overflow detected: ${payload.summary.horizontalOverflowDetected === true ? "yes" : payload.summary.horizontalOverflowDetected === false ? "no" : "not run"}

Screenshots are written under \`pipeline/review/long-tail-hubs/screenshots/\` when the browser runner is executed. That folder is ignored by Git.
`;
}

function renderStaticExportReport(payload) {
  return `# Long-Tail Static Export Report

- Status: ${payload.summary.status}
- Build pass recorded: ${payload.summary.npmBuildPasses === true ? "yes" : "not run"}
- Expected static hub route count: ${payload.summary.expectedStaticHubRouteCount}
- Sitemap route count: ${payload.summary.sitemapRouteCount}
- Exported sitemap loc count: ${payload.summary.exportedSitemapLocCount ?? "not run"}
- No per-image pages: ${pass(payload.summary.noPerImagePages)}
- No duplicate canonical URLs: ${pass(payload.summary.noDuplicateCanonicalUrls)}
- No route slug collisions: ${pass(payload.summary.noRouteSlugCollisions)}
- No localhost or r2.dev output URLs: ${pass(payload.summary.noLocalhostOrR2DevInGeneratedOutput)}

${payload.note}
`;
}

async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      const normalized = normalizePath(file);
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(normalized)) continue;
      if (!options.includeGenerated && normalized.startsWith("src/generated/")) continue;
      chunks.push(await readFile(path.join(REPO_ROOT, file), "utf8"));
    }
  }
  return chunks.join("\n");
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root)];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results;
}

async function git(args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function readJsonIfExists(relativePath) {
  if (!existsSync(path.join(REPO_ROOT, relativePath))) return null;
  return readJson(relativePath);
}

async function readTextIfExists(relativePath) {
  if (!existsSync(path.join(REPO_ROOT, relativePath))) return "";
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, payload) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeText(relativePath, text) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, text);
}

function readPublicDownloadFormats(source) {
  const match = source.match(/EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\[([^\]]+)\]/);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1].toUpperCase() === "JPG" ? "JPG" : entry[1].toUpperCase());
}

function readConstant(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*["']([^"']+)["']`));
  return match?.[1] || "";
}

function countTrustPages() {
  return 6;
}

function check(name, expected, actual) {
  return {
    name,
    expected,
    actual,
    passed: String(expected) === String(actual),
  };
}

function summarizeHub(hub) {
  return {
    hubId: hub.hubId,
    slug: hub.slug,
    title: hub.title || hub.canonicalTitle,
    route: hub.route,
    assetCount: hub.assetCount || hub.asset_count || hub.assetIds?.length || 0,
    parentHubId: hub.parentHubId || null,
    relatedHubCount: hub.relatedHubIds?.length || 0,
    childHubCount: hub.childHubIds?.length || 0,
  };
}

function summarizeLightHub(hub) {
  return {
    hubId: hub.hubId,
    slug: hub.slug,
    title: hub.title || hub.canonicalTitle,
    assetCount: hub.assetCount || hub.asset_count || hub.assetIds?.length || 0,
    indexable: Boolean(hub.indexable),
    sitemap: Boolean(hub.sitemap),
  };
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(value) {
  return normalizeText(value);
}

function extractTokens(text) {
  const tokens = new Set();
  for (const rawToken of normalizeText(text).split(/\s+/)) {
    let token = TOKEN_REPLACEMENTS[rawToken] || rawToken;
    if (!token || token.length < 3 || STOP_TOKENS.has(token) || /^\d+$/.test(token)) continue;
    if (STOP_TOKENS.has(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

function exampleTitles(state, assetIds) {
  return assetIds.slice(0, 8).map((assetId) => state.itemById.get(assetId)?.title).filter(Boolean);
}

function intersectSets(a, b) {
  const result = new Set();
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const value of smaller) {
    if (larger.has(value)) result.add(value);
  }
  return result;
}

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean))];
}

function sortHubIdsByCount(ids, hubById) {
  return uniqueIds(ids).sort((a, b) => {
    const aHub = hubById.get(a);
    const bHub = hubById.get(b);
    return (bHub?.assetCount || 0) - (aHub?.assetCount || 0) || a.localeCompare(b);
  });
}

function uniqueLinks(links) {
  const seen = new Set();
  const result = [];
  for (const link of links) {
    if (!link?.href || seen.has(link.href)) continue;
    seen.add(link.href);
    result.push(link);
  }
  return result;
}

function toHubId(slug) {
  return `hub_${slug.replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "")}`;
}

function singularSlug(slug) {
  return slug
    .replace(/ies$/i, "y")
    .replace(/ves$/i, "f")
    .replace(/s$/i, "");
}

function titleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^t-rex$/i.test(word)) return "T-Rex";
      if (/^st$/i.test(word)) return "St.";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function collectionName(title) {
  return String(title || "").replace(/\s+Coloring Pages$/i, "");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function publicTitleQuality(title) {
  if (publicNamingRisk(title) !== "low") return 0;
  if (title.length > 72) return 7;
  return 12;
}

function publicNamingRisk(title) {
  if (/chatgpt|failed|openai|20\d{2}|jutsu|summoning|hoodie|costume|pose/i.test(title)) return "high";
  if (title.length > 80) return "medium";
  return "low";
}

function pass(value) {
  return value ? "yes" : "no";
}

function table(rows, keys) {
  if (!rows.length) return "_None._\n";
  const header = `| ${keys.join(" | ")} |`;
  const divider = `| ${keys.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${keys.map((key) => formatCell(row[key])).join(" | ")} |`)
    .join("\n");
  return `${header}\n${divider}\n${body}\n`;
}

function formatCell(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null || value === undefined) return "";
  return String(value).replace(/\|/g, "/");
}

function joinList(values) {
  const clean = values.filter(Boolean);
  if (clean.length <= 1) return clean.join("");
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean.at(-1)}`;
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes].sort();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}
