#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const RUN_ID = "long-tail-round-2";
const GENERATED_AT = new Date().toISOString();
const EXPECTED_BRANCH = "ver-5-deployed-may-13-2026";
const REQUIRED_COMMIT = "7190c41160d0ef5013c18931675a6ee8bf76cdd0";
const EXPECTED_AVAILABLE_RECORDS = 6352;
const PUBLIC_SITE_URL = "https://www.ilovecoloringpage.com";
const PUBLIC_ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const GALLERY_PAGE_SIZE = 48;
const FEATURED_LIMIT = 12;
const ROOT_HUB_ID = "hub_coloring_pages";
const MAX_PROMOTED = 32;

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
  nextConfig: "next.config.mjs",
  browserDownloads: "src/lib/coloring/browserDownloads.ts",
  downloadMenu: "src/components/coloring/DownloadMenu.tsx",
  siteConfig: "src/lib/site/siteConfig.ts",
  ogImages: "src/generated/coloring/og-images.json",
};

const MANIFESTS = {
  context: "pipeline/manifests/long-tail-round-2-context-check.json",
  raw: "pipeline/manifests/long-tail-round-2-raw-candidates.json",
  promoted: "pipeline/manifests/long-tail-round-2-promoted-candidates.json",
  manual: "pipeline/manifests/long-tail-round-2-manual-review-candidates.json",
  backlog: "pipeline/manifests/long-tail-round-2-backlog-candidates.json",
  rejected: "pipeline/manifests/long-tail-round-2-rejected-candidates.json",
  evidence: "pipeline/manifests/long-tail-round-2-candidate-evidence.json",
  unsupported: "pipeline/manifests/long-tail-round-2-unsupported-concepts.json",
  ipRisk: "pipeline/manifests/long-tail-round-2-ip-risk-audit.json",
  promotedHubs: "pipeline/manifests/long-tail-round-2-promoted-hubs.json",
  acceptance: "pipeline/manifests/long-tail-round-2-acceptance-gate.json",
};

const REPORTS = {
  context: "pipeline/reports/long-tail-round-2-context-check.md",
  candidates: "pipeline/reports/long-tail-round-2-candidate-report.md",
  evidence: "pipeline/reports/long-tail-round-2-candidate-evidence.md",
  unsupported: "pipeline/reports/long-tail-round-2-unsupported-concepts.md",
  ipRisk: "pipeline/reports/long-tail-round-2-ip-risk-audit.md",
  promotedHubs: "pipeline/reports/long-tail-round-2-promoted-hubs.md",
  manualCsv: "pipeline/reports/long-tail-round-2-manual-review.csv",
  backlogCsv: "pipeline/reports/long-tail-round-2-backlog.csv",
  manualMd: "pipeline/reports/long-tail-round-2-manual-review.md",
  backlogMd: "pipeline/reports/long-tail-round-2-backlog.md",
  acceptance: "pipeline/reports/long-tail-round-2-acceptance-gate.md",
};

const MINIMUMS = {
  "dog-breed": 6,
  "flower-name": 6,
  "dinosaur-species": 6,
  "animal-type": 8,
  "food-dessert": 6,
  "vehicle-type": 6,
  "holiday-subtheme": 8,
  "fantasy-theme": 8,
  "plant-name": 6,
  "place-theme": 8,
  "pattern-theme": 10,
  subject: 8,
  combination: 10,
  broad: 20,
};

const IP_RISK_TERMS = [
  "naruto",
  "mario",
  "pokemon",
  "disney",
  "marvel",
  "dc",
  "sonic",
  "minecraft",
  "roblox",
  "paw patrol",
  "bluey",
];

const IP_RISK_RE = new RegExp(`\\b(?:${IP_RISK_TERMS.map(escapeRegExp).join("|")})\\b`, "i");

const TOKEN_REPLACEMENTS = new Map(
  Object.entries({
    dinos: "dinosaur",
    dino: "dinosaur",
    dinosaurs: "dinosaur",
    tyrannosaurus: "tyrannosaurus",
    trex: "t-rex",
    "t rex": "t-rex",
    midieval: "medieval",
    mideival: "medieval",
    medival: "medieval",
    vehiacle: "vehicle",
    vehicles: "vehicle",
    cars: "car",
    planes: "plane",
    trains: "train",
    locomotives: "locomotive",
    dogs: "dog",
    puppies: "puppy",
    cats: "cat",
    kittens: "kitten",
    flowers: "flower",
    plants: "plant",
    cookies: "cookie",
    donuts: "donut",
    cupcakes: "cupcake",
    pumpkins: "pumpkin",
    costumes: "costume",
    snowmen: "snowman",
  }),
);

const STOP_TOKENS = new Set([
  "a",
  "an",
  "and",
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
  "printable",
  "line",
  "lineart",
  "outline",
  "illustration",
  "image",
  "images",
  "single",
  "set",
  "collection",
  "family",
  "famil",
  "scene",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "webp",
  "chatgpt",
  "failed",
  "openai",
  "am",
  "pm",
  "2024",
  "2025",
  "2026",
]);

const GENERIC_PHRASES = new Set([
  "animal",
  "anime",
  "birthday",
  "cartoon",
  "celebration",
  "character",
  "chibi",
  "christmas",
  "costume",
  "cute",
  "day",
  "detailed",
  "easy",
  "family",
  "fantasy",
  "flower",
  "food",
  "garden",
  "geometric",
  "girl",
  "holiday",
  "indoor",
  "jutsu",
  "kawaii",
  "life",
  "mandala",
  "midieval",
  "medieval",
  "pattern",
  "patterns",
  "pet",
  "pets",
  "plant",
  "plushie",
  "prehistoric",
  "simple",
  "vehiacle",
  "vehicle",
  "world",
]);

const DUPLICATE_ALIASES = new Map([
  ["tyrannosaurus-rex", "t-rex"],
  ["t-rex", "t-rex"],
  ["dog", "dogs"],
  ["cat", "cats"],
  ["dragon", "dragons"],
  ["flower", "flowers"],
  ["mushroom", "mushrooms"],
  ["pumpkin", "pumpkins"],
  ["snow", "christmas"],
  ["vehicle-car", "cars"],
  ["car", "cars"],
  ["plane", "planes"],
  ["train", "trains"],
  ["locomotive", "trains"],
  ["dinosaur", "dinosaurs"],
  ["prehistoric", "prehistoric-animals"],
  ["plant", "plants"],
  ["indoor-plant", "indoor-plants"],
  ["sea-life", "sea-life"],
  ["sea", "ocean"],
  ["world-landmarks", "world-landmarks"],
  ["rose", "roses"],
  ["santa-claus", "santa"],
  ["tyrannosaurus", "t-rex"],
]);

const PROMOTION_DENY_SLUGS = new Set([
  "anemone",
  "blossom",
  "heart",
  "hearts",
  "golden",
  "green",
  "moon",
  "nest",
  "not",
  "queen",
  "retriever",
  "saber-toothed",
  "shepherd",
  "spaniel",
  "star",
  "bleeding",
]);

const TAIL_STOP_TOKENS = new Set([
  "animal",
  "animals",
  "art",
  "birthday",
  "character",
  "coloring",
  "cosplay",
  "creative",
  "cute",
  "family",
  "famil",
  "garden",
  "gardener",
  "happy",
  "high",
  "kawaii",
  "mandala",
  "on",
  "page",
  "pages",
  "pattern",
  "patterns",
  "playing",
  "plushie",
  "plushies",
  "puppies",
  "puppy",
  "roaming",
  "scene",
  "smiling",
  "walking",
  "with",
]);

const TRUSTED_SOURCE_PATTERNS = [
  /^phrase after Dogs/i,
  /^dog breed suffix/i,
  /^flower or indoor plant/i,
  /^flower name suffix/i,
  /^phrase after Prehistoric/i,
  /^holiday subtheme phrase/i,
  /^food or dessert term/i,
  /^vehicle phrase/i,
  /^fantasy or magic phrase/i,
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const state = await loadState();
  stripPriorRound2(state);

  const context = await buildContext(state);
  const discovered = buildCandidates(state);
  const classified = classifyCandidates(state, discovered);
  const promoted = selectPromotedCandidates(classified);
  const evidence = buildEvidence(state, classified, promoted);
  const unsupported = buildUnsupportedConcepts(state, classified, promoted);
  const ipRisk = buildIpRiskAudit(classified, promoted);
  const implementation = buildImplementation(state, promoted, evidence);
  const promotedHubs = buildPromotedHubsManifest(implementation, evidence);
  const acceptance = buildAcceptanceGate({
    promoted,
    classified,
    context,
    browserQa: await readJsonIfExists("pipeline/manifests/long-tail-round-2-browser-qa-results.json"),
    sampledUrl: await readJsonIfExists("pipeline/manifests/long-tail-round-2-sampled-url-check-results.json"),
    implementation,
    unsupported,
    ipRisk,
  });

  await writeGeneratedRuntimeFiles(implementation.files);
  await writeJson(MANIFESTS.context, context);
  await writeText(REPORTS.context, renderContextReport(context));
  await writeJson(MANIFESTS.raw, buildCandidateManifest("raw", classified.rawCandidates));
  await writeJson(MANIFESTS.promoted, buildCandidateManifest("promoted", promoted));
  await writeJson(MANIFESTS.manual, buildCandidateManifest("manual_review", classified.manualReview));
  await writeJson(MANIFESTS.backlog, buildCandidateManifest("backlog", classified.backlog));
  await writeJson(MANIFESTS.rejected, buildCandidateManifest("rejected", classified.rejected));
  await writeText(REPORTS.candidates, renderCandidateReport(classified, promoted));
  await writeJson(MANIFESTS.evidence, evidence);
  await writeText(REPORTS.evidence, renderEvidenceReport(evidence));
  await writeJson(MANIFESTS.unsupported, unsupported);
  await writeText(REPORTS.unsupported, renderUnsupportedReport(unsupported));
  await writeJson(MANIFESTS.ipRisk, ipRisk);
  await writeText(REPORTS.ipRisk, renderIpRiskReport(ipRisk));
  await writeJson(MANIFESTS.promotedHubs, promotedHubs);
  await writeText(REPORTS.promotedHubs, renderPromotedHubsReport(promotedHubs));
  await writeText(REPORTS.manualCsv, renderDecisionCsv(classified.manualReview));
  await writeText(REPORTS.backlogCsv, renderDecisionCsv(classified.backlog));
  await writeText(REPORTS.manualMd, renderDecisionMd("Manual Review", classified.manualReview));
  await writeText(REPORTS.backlogMd, renderDecisionMd("Backlog", classified.backlog));
  await writeJson(MANIFESTS.acceptance, acceptance);
  await writeText(REPORTS.acceptance, renderAcceptanceReport(acceptance));

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        promoted: promoted.length,
        manualReview: classified.manualReview.length,
        backlog: classified.backlog.length,
        rejected: classified.rejected.length,
        runtimeHubCountAfter: implementation.summary.runtimeHubCountAfter,
        sitemapLocCountAfter: implementation.summary.sitemapLocCountAfter,
      },
      null,
      2,
    ),
  );
}

async function loadState() {
  const input = {};
  for (const [key, relativePath] of Object.entries(INPUTS)) {
    input[key] = relativePath.endsWith(".json") ? await readJson(relativePath) : await readText(relativePath);
  }

  const titleOverrides = new Map((input.titleOverrides.overrides || []).map((entry) => [entry.assetId, entry.cleanTitle]));
  const items = input.runtimeAvailable.items;
  const itemById = new Map(items.map((item) => [item.assetId, item]));
  const hubById = new Map(input.runtimeHubs.hubs.map((hub) => [hub.hubId, hub]));
  const hubBySlug = new Map(input.runtimeHubs.hubs.map((hub) => [hub.slug, hub]));
  const hubItemsByAssetId = new Map(input.runtimeHubItems.items.map((entry) => [entry.assetId, entry]));
  const deferredRecords = input.runtimeDeferred.records || input.runtimeDeferred.items || [];
  const features = new Map();

  for (const item of items) {
    const title = titleOverrides.get(item.assetId) || item.title;
    const text = normalizeText(
      [
        title,
        item.title,
        item.altText,
        item.filenameSlug,
        item.categorySlug,
        item.assetSubpaths?.webpPreview,
        item.assetSubpaths?.svg,
      ]
        .filter(Boolean)
        .join(" "),
    );
    features.set(item.assetId, {
      item,
      title,
      text,
      tokens: extractTokens(text),
      categorySlug: item.categorySlug,
      filenameSlug: item.filenameSlug,
    });
  }

  return {
    input,
    items,
    itemById,
    titleOverrides,
    hubById,
    hubBySlug,
    hubItemsByAssetId,
    deferredRecords,
    features,
  };
}

function stripPriorRound2(state) {
  const prior = state.input.runtimeHubs.hubs.filter((hub) => hub.longTailSource?.runId === RUN_ID);
  if (prior.length === 0) return;

  const priorHubIds = new Set(prior.map((hub) => hub.hubId));
  const priorRoutes = new Set(prior.map((hub) => hub.route));

  state.input.runtimeHubs.hubs = state.input.runtimeHubs.hubs
    .filter((hub) => !priorHubIds.has(hub.hubId))
    .map((hub) => ({
      ...hub,
      relatedHubIds: (hub.relatedHubIds || []).filter((hubId) => !priorHubIds.has(hubId)),
      childHubIds: (hub.childHubIds || []).filter((hubId) => !priorHubIds.has(hubId)),
      internalLinkingTargets: (hub.internalLinkingTargets || []).filter((hubId) => !priorHubIds.has(hubId)),
    }));
  state.input.runtimeRoutes.routes = state.input.runtimeRoutes.routes.filter((route) => !priorHubIds.has(route.hubId));
  state.input.runtimeSiteMap.entries = state.input.runtimeSiteMap.entries.filter((entry) => !priorRoutes.has(entry.path));
  state.input.runtimeHubItems.items = state.input.runtimeHubItems.items.map((entry) => ({
    ...entry,
    hubIds: (entry.hubIds || []).filter((hubId) => !priorHubIds.has(hubId)),
  }));
  state.input.runtimeSearchIndex.entries = state.input.runtimeSearchIndex.entries.map((entry) => ({
    ...entry,
    hubIds: (entry.hubIds || []).filter((hubId) => !priorHubIds.has(hubId)),
    searchText: removePriorHubTitlesFromSearch(entry.searchText || "", prior),
  }));
  state.input.runtimeHubFeaturedItems.hubs = state.input.runtimeHubFeaturedItems.hubs.filter((entry) => !priorHubIds.has(entry.hubId));
  state.input.runtimeHubFilterTags.hubs = state.input.runtimeHubFilterTags.hubs.filter((entry) => !priorHubIds.has(entry.hubId));
  state.input.runtimeSeoPages.pages = state.input.runtimeSeoPages.pages.filter((entry) => !priorHubIds.has(entry.hubId) && !priorRoutes.has(entry.path));
  state.input.runtimeHubSeoContent.hubs = state.input.runtimeHubSeoContent.hubs.filter((entry) => !priorHubIds.has(entry.hubId) && !priorRoutes.has(entry.route));
  state.input.runtimeSocialMetadata.pages = state.input.runtimeSocialMetadata.pages.filter((entry) => !priorRoutes.has(entry.path));
  state.input.internalLinking.pages = state.input.internalLinking.pages
    .filter((entry) => !priorHubIds.has(entry.hubId) && !priorRoutes.has(entry.path))
    .map((entry) => ({
      ...entry,
      links: (entry.links || []).filter((link) => !priorRoutes.has(link.href)),
    }));

  state.hubById = new Map(state.input.runtimeHubs.hubs.map((hub) => [hub.hubId, hub]));
  state.hubBySlug = new Map(state.input.runtimeHubs.hubs.map((hub) => [hub.slug, hub]));
  state.hubItemsByAssetId = new Map(state.input.runtimeHubItems.items.map((entry) => [entry.assetId, entry]));
}

function removePriorHubTitlesFromSearch(searchText, priorHubs) {
  let text = searchText;
  for (const hub of priorHubs) {
    text = text.replaceAll(normalizeText(hub.title), "").replaceAll(hub.slug.replace(/-/g, " "), "");
  }
  return text.replace(/\s+/g, " ").trim();
}

async function buildContext(state) {
  const repoRoot = (await git(["rev-parse", "--show-toplevel"])).trim();
  const branch = (await git(["branch", "--show-current"])).trim();
  const head = (await git(["rev-parse", "HEAD"])).trim();
  const latestFinalLinkNavCommitExists = await commitExists(REQUIRED_COMMIT);
  const appApiAbsent = !existsSync(path.join(REPO_ROOT, "app", "api"));
  const staticExportConfigured = /output:\s*["']export["']/.test(state.input.nextConfig);
  const publicSource = await readProjectText(["app", "src"], { includeGenerated: false });
  const downloads = readPublicDownloads(state.input.browserDownloads);
  const svgUserDownloadExposed = /Download SVG|svgDownload|downloadSvg|label:\s*["']SVG["']/i.test(`${state.input.browserDownloads}\n${state.input.downloadMenu}`);
  const sitemapLocCount = state.input.runtimeSiteMap.entries.length;
  const ogImagesExist = Object.keys(state.input.ogImages.metadataByPath || {}).length > 0 || Boolean(state.input.ogImages.defaults?.fallbackPath);

  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-context-check`,
    git: {
      repoRoot: normalizePath(repoRoot),
      branch,
      head,
      requiredCommit: REQUIRED_COMMIT,
      latestFinalLinkNavCommitExists,
    },
    summary: {
      repoProjectCorrect: path.basename(repoRoot) === "i-love-coloring-page",
      branchCorrect: branch === EXPECTED_BRANCH,
      latestFinalLinkNavCommitExists,
      appApiAbsent,
      staticExportConfigured,
      frontendOnlyNextStaticExport: appApiAbsent && staticExportConfigured,
      runtimeAvailableRecordsLoaded: state.items.length > 0,
      runtimeAvailableRecords: state.items.length,
      deferredRecordCount: state.deferredRecords.length,
      deferredRecordsExcluded: state.deferredRecords.every((record) => !state.itemById.has(record.assetId)),
      currentHubCountBefore: state.input.runtimeHubs.hubs.length,
      currentSitemapCountBefore: sitemapLocCount,
      svgInternalOnly: !svgUserDownloadExposed,
      publicDownloads: downloads,
      imageSitemapExists: existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")),
      ogImagesExist,
      jsonLdExists: /JsonLdScript|buildHubPageJsonLd|buildGalleryLandingJsonLd|application\/ld\+json/i.test(publicSource),
      liveAdSenseAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(publicSource),
      publicSafeDefaultsExist:
        state.input.siteConfig.includes(PUBLIC_SITE_URL) &&
        state.input.siteConfig.includes(PUBLIC_ASSET_BASE_URL) &&
        state.input.siteConfig.includes("admin@ilovecoloringpage.com"),
    },
  };
}

function buildCandidates(state) {
  const phraseMap = new Map();

  for (const feature of state.features.values()) {
    const contexts = detectContexts(feature);
    addTokenNgrams(phraseMap, feature, contexts);
    addDogBreedTerms(phraseMap, feature);
    addFlowerTerms(phraseMap, feature);
    addPrehistoricTerms(phraseMap, feature);
    addHolidayTerms(phraseMap, feature);
    addFoodTerms(phraseMap, feature);
    addVehicleTerms(phraseMap, feature);
    addFantasyTerms(phraseMap, feature);
  }

  return [...phraseMap.values()]
    .map((candidate) => finalizeRawCandidate(state, candidate))
    .filter((candidate) => candidate.assetCount >= 3)
    .sort((a, b) => b.assetCount - a.assetCount || a.slug.localeCompare(b.slug));
}

function addTokenNgrams(phraseMap, feature, contexts) {
  const tokens = feature.tokens.filter((token) => !STOP_TOKENS.has(token));
  const added = new Set();
  for (let n = 1; n <= 3; n += 1) {
    for (let index = 0; index <= tokens.length - n; index += 1) {
      const parts = tokens.slice(index, index + n);
      if (parts.some((part) => STOP_TOKENS.has(part))) continue;
      const phrase = parts.join(" ");
      if (phrase.length < 3 || added.has(phrase)) continue;
      added.add(phrase);
      addPhrase(phraseMap, phrase, feature, contexts, "runtime title/filename n-gram");
    }
  }
}

function addDogBreedTerms(phraseMap, feature) {
  const title = normalizeText(feature.title);
  const match = title.match(/\bdogs?\s+([a-z0-9\s-]+)/);
  if (!match) return;
  const phrase = cleanTailPhrase(match[1], 4);
  if (!phrase || phrase === "dog") return;
  addPhrase(phraseMap, phrase, feature, ["dog-breed"], "phrase after Dogs in runtime title");
  const tokens = extractTokens(phrase);
  if (tokens.length > 1) addPhrase(phraseMap, tokens.slice(-1).join(" "), feature, ["dog-breed"], "dog breed suffix from runtime title");
}

function addFlowerTerms(phraseMap, feature) {
  const title = normalizeText(feature.title);
  for (const prefix of [/\bflowers?\s+([a-z0-9\s-]+)/, /\bchibi flowers?\s+([a-z0-9\s-]+)/, /\bindoor plants?\s+([a-z0-9\s-]+)/]) {
    const match = title.match(prefix);
    if (!match) continue;
    const phrase = cleanTailPhrase(match[1], 3);
    if (!phrase) continue;
    addPhrase(phraseMap, phrase, feature, ["flower-name", "plant-name"], "flower or indoor plant phrase in runtime title");
    const tokens = extractTokens(phrase);
    if (tokens.length > 1) addPhrase(phraseMap, tokens.slice(-1).join(" "), feature, ["flower-name"], "flower name suffix from runtime title");
  }
}

function addPrehistoricTerms(phraseMap, feature) {
  const title = normalizeText(feature.title);
  const match = title.match(/\bprehistoric\s+([a-z0-9\s-]+)/);
  if (!match) return;
  const phrase = cleanTailPhrase(match[1], 3);
  if (!phrase) return;
  addPhrase(phraseMap, phrase, feature, ["dinosaur-species"], "phrase after Prehistoric in runtime title");
}

function addHolidayTerms(phraseMap, feature) {
  const title = normalizeText(feature.title);
  const phraseRules = [
    ["halloween costume", /\bhalloween\s+costume\b/],
    ["birthday celebration", /\bbirthday\s+celebration\b/],
    ["christmas plushie", /\bchristmas\s+plushie\b/],
    ["gingerbread", /\bgingerbread\b/],
    ["snowman", /\bsnowman\b/],
    ["trick or treat", /\btrick\s+or\s+treat\b/],
    ["haunted house", /\bhaunted\s+house\b/],
    ["leprechaun", /\bleprechauns?\b/],
    ["shamrock", /\bshamrocks?\b/],
  ];
  for (const [phrase, re] of phraseRules) {
    if (re.test(title)) addPhrase(phraseMap, phrase, feature, ["holiday-subtheme"], "holiday subtheme phrase in runtime title");
  }
}

function addFoodTerms(phraseMap, feature) {
  if (!/(bakery|sushi|food|cake|cookie|donut|cupcake|bread|nigiri|gingerbread)/i.test(feature.text)) return;
  const phraseRules = [
    ["cookie", /\bcookies?\b/],
    ["donut", /\bdonuts?\b/],
    ["cupcake", /\bcupcakes?\b/],
    ["bread", /\bbread\b/],
    ["nigiri", /\bnigiri\b/],
    ["gingerbread", /\bgingerbread\b/],
    ["salmon", /\bsalmon\b/],
  ];
  for (const [phrase, re] of phraseRules) {
    if (re.test(feature.text)) addPhrase(phraseMap, phrase, feature, ["food-dessert"], "food or dessert term in runtime title");
  }
}

function addVehicleTerms(phraseMap, feature) {
  const text = feature.text;
  const phraseRules = [
    ["steam train", /\bsteam\s+train\b/],
    ["bullet train", /\bbullet\s+train\b/],
    ["sports car", /\bsports\s+car\b/],
    ["helicopter", /\bhelicopters?\b/],
  ];
  for (const [phrase, re] of phraseRules) {
    if (re.test(text)) addPhrase(phraseMap, phrase, feature, ["vehicle-type"], "vehicle phrase in runtime title");
  }
}

function addFantasyTerms(phraseMap, feature) {
  const text = feature.text;
  const phraseRules = [
    ["summoning", /\bsummoning\b/],
    ["magic", /\bmagic\b/],
    ["sorcerer", /\bsorcerers?\b/],
    ["mage", /\bmages?\b/],
    ["arcane", /\barcane\b/],
    ["crystal dragon", /\bcrystal\s+dragon\b/],
    ["fire dragon", /\bfire\s+dragon\b/],
    ["ice dragon", /\bice\s+dragon\b/],
  ];
  for (const [phrase, re] of phraseRules) {
    if (re.test(text)) addPhrase(phraseMap, phrase, feature, ["fantasy-theme"], "fantasy or magic phrase in runtime title");
  }
}

function addPhrase(phraseMap, phrase, feature, contexts, source) {
  const normalizedPhrase = normalizePhrase(phrase);
  if (!normalizedPhrase) return;
  const slug = slugify(normalizedPhrase);
  if (!slug || slug.length < 3) return;
  if (!phraseMap.has(slug)) {
    phraseMap.set(slug, {
      slug,
      phrase: normalizedPhrase,
      exactTerms: new Set(),
      assetIds: new Set(),
      sourceCategories: new Set(),
      contexts: new Map(),
      sources: new Set(),
    });
  }
  const record = phraseMap.get(slug);
  record.exactTerms.add(normalizedPhrase);
  record.assetIds.add(feature.item.assetId);
  record.sourceCategories.add(feature.item.categorySlug);
  record.sources.add(source);
  for (const context of contexts) record.contexts.set(context, (record.contexts.get(context) || 0) + 1);
}

function finalizeRawCandidate(state, raw) {
  const assetIds = [...raw.assetIds].sort((a, b) => {
    const aTitle = state.titleOverrides.get(a) || state.itemById.get(a)?.title || a;
    const bTitle = state.titleOverrides.get(b) || state.itemById.get(b)?.title || b;
    return aTitle.localeCompare(bTitle) || a.localeCompare(b);
  });
  const nearest = findNearestOverlap(state, assetIds);
  const contexts = [...raw.contexts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const kind = chooseKind(raw.phrase, contexts);
  const title = buildCandidateTitle(raw.phrase, kind);
  return {
    slug: raw.slug,
    title,
    phrase: raw.phrase,
    kind,
    assetCount: assetIds.length,
    threshold: {
      minimum: minimumForKind(kind),
      rule: thresholdRuleForKind(kind),
    },
    exactMatchingTerms: [...raw.exactTerms].sort(),
    sourceCategories: [...raw.sourceCategories].sort(),
    sourceTypes: [...raw.sources].sort(),
    trustedEvidence: [...raw.sources].some((source) => TRUSTED_SOURCE_PATTERNS.some((pattern) => pattern.test(source))),
    contextCounts: Object.fromEntries(contexts),
    assetIds,
    representativeAssetIds: assetIds.slice(0, 12),
    representativeTitles: assetIds.slice(0, 12).map((assetId) => state.titleOverrides.get(assetId) || state.itemById.get(assetId)?.title || assetId),
    representativeFilenames: assetIds.slice(0, 12).map((assetId) => state.itemById.get(assetId)?.filenameSlug || ""),
    relatedExistingHubs: relatedExistingHubIds(state, assetIds).slice(0, 8),
    nearestOverlapHub: nearest,
    ipRisk: IP_RISK_RE.test(`${raw.slug} ${title}`),
    duplicateSlug: isDuplicateSlug(state, raw.slug),
    weakGeneric: isWeakGeneric(raw.phrase, kind),
  };
}

function classifyCandidates(state, rawCandidates) {
  const raw = rawCandidates.map((candidate) => {
    const reasons = [];
    let decision = "backlog";
    if (candidate.ipRisk) {
      decision = "rejected";
      reasons.push("Blocked because the candidate contains a franchise or trademark-risk term.");
    } else if (candidate.duplicateSlug) {
      decision = "rejected";
      reasons.push("Blocked as an existing hub duplicate or reordered duplicate.");
    } else if (candidate.weakGeneric) {
      decision = "rejected";
      reasons.push("Blocked because the phrase is generic, decorative, or too weak as a route concept.");
    } else if (!candidate.trustedEvidence) {
      decision = candidate.assetCount >= candidate.threshold.minimum ? "manual_review" : "backlog";
      reasons.push("Held back because the phrase came only from generic n-gram mining rather than a clear subject extractor.");
    } else if (candidate.assetCount >= candidate.threshold.minimum) {
      const confidence = confidenceForCandidate(candidate);
      if (confidence === "high") {
        decision = "promote_candidate";
        reasons.push("Meets the evidence threshold with clear runtime asset support.");
      } else {
        decision = "manual_review";
        reasons.push("Meets a numeric threshold but needs owner review for ambiguity or overlap.");
      }
    } else if (candidate.assetCount >= 6) {
      decision = "manual_review";
      reasons.push("Has some support but does not meet this candidate type threshold cleanly.");
    } else {
      decision = "backlog";
      reasons.push("Evidence is below the minimum promotion threshold.");
    }

    return {
      ...candidate,
      confidence: decision === "promote_candidate" ? "high" : decision === "manual_review" ? "medium" : "low",
      decision,
      reason: reasons.join(" "),
      reasonNotDuplicate: candidate.duplicateSlug
        ? "Rejected as duplicate."
        : `${candidate.title} is a narrower evidence-backed collection distinct from broader hubs such as ${candidate.relatedExistingHubs.slice(0, 3).map((hub) => hub.title).join(", ") || "Coloring Pages"}.`,
      searchIntentReason: `${candidate.title} has specific subject wording found in runtime asset titles or filenames, making it useful for focused printable coloring page searches.`,
    };
  });

  return {
    rawCandidates: raw,
    promotionPool: raw.filter((candidate) => candidate.decision === "promote_candidate"),
    manualReview: raw.filter((candidate) => candidate.decision === "manual_review").slice(0, 200),
    backlog: raw.filter((candidate) => candidate.decision === "backlog").slice(0, 300),
    rejected: raw.filter((candidate) => candidate.decision === "rejected").slice(0, 300),
  };
}

function selectPromotedCandidates(classified) {
  const perKindLimits = new Map([
    ["dog-breed", 4],
    ["flower-name", 7],
    ["dinosaur-species", 9],
    ["animal-type", 8],
    ["food-dessert", 8],
    ["vehicle-type", 4],
    ["holiday-subtheme", 8],
    ["fantasy-theme", 8],
    ["plant-name", 3],
    ["place-theme", 2],
    ["pattern-theme", 2],
  ]);
  const kindCounts = new Map();
  const promoted = [];
  const sorted = classified.promotionPool
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate) }))
    .sort((a, b) => b.score - a.score || b.assetCount - a.assetCount || a.slug.localeCompare(b.slug));

  for (const kind of ["animal-type", "plant-name", "vehicle-type"]) {
    const candidate = sorted.find((record) => record.kind === kind && !promoted.some((existing) => existing.slug === record.slug));
    if (candidate) {
      promoted.push({ ...candidate, decision: "promoted", promotedRoute: `/coloring-pages/${candidate.slug}` });
      kindCounts.set(kind, 1);
    }
  }

  for (const candidate of sorted) {
    if (promoted.length >= MAX_PROMOTED) break;
    if (promoted.some((record) => record.slug === candidate.slug)) continue;
    const current = kindCounts.get(candidate.kind) || 0;
    const limit = perKindLimits.get(candidate.kind) || 4;
    if (current >= limit) continue;
    promoted.push({ ...candidate, decision: "promoted", promotedRoute: `/coloring-pages/${candidate.slug}` });
    kindCounts.set(candidate.kind, current + 1);
  }
  return promoted;
}

function buildEvidence(state, classified, promoted) {
  const promotedSlugs = new Set(promoted.map((candidate) => candidate.slug));
  const candidates = [...promoted, ...classified.manualReview, ...classified.backlog].map((candidate) => {
    const decision = promotedSlugs.has(candidate.slug) ? "promoted" : candidate.decision === "manual_review" ? "manual-review" : "backlog";
    return {
      slug: candidate.slug,
      title: candidate.title,
      candidateType: candidate.kind,
      assetCount: candidate.assetCount,
      threshold: {
        minimum: candidate.threshold.minimum,
        rule: candidate.threshold.rule,
        documentedException: false,
      },
      exactMatchingTerms: candidate.exactMatchingTerms,
      representativeAssetIds: candidate.representativeAssetIds.slice(0, Math.min(12, candidate.assetCount)),
      representativeTitles: candidate.representativeTitles.slice(0, Math.min(12, candidate.assetCount)),
      representativeFilenames: candidate.representativeFilenames.slice(0, Math.min(12, candidate.assetCount)),
      sourceCategories: candidate.sourceCategories,
      relatedExistingHubs: candidate.relatedExistingHubs,
      nearestOverlapHub: candidate.nearestOverlapHub,
      overlapPercentage: candidate.nearestOverlapHub.overlapPercentage,
      confidence: promotedSlugs.has(candidate.slug) ? "high" : candidate.confidence,
      decision,
      reason: candidate.reason,
      reasonNotDuplicate: candidate.reasonNotDuplicate,
      searchIntentReason: candidate.searchIntentReason,
    };
  });

  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-candidate-evidence`,
    summary: {
      promotedCount: promoted.length,
      manualReviewCount: classified.manualReview.length,
      backlogCount: classified.backlog.length,
      evidenceFromRuntimeAvailableOnly: true,
      deferredRecordsExcluded: true,
    },
    candidates,
  };
}

function buildUnsupportedConcepts(state, classified, promoted) {
  const promotedBySlug = new Map(promoted.map((candidate) => [candidate.slug, candidate]));
  const concepts = [
    conceptFromPatterns("anime boys", state, [/anime\s+boys?/, /male\s+anime/, /boy\s+character/], promotedBySlug.get("anime-boys")),
    conceptFromPatterns("anime magic", state, [/anime\s+magic/], promotedBySlug.get("anime-magic")),
    conceptFromPatterns("anime summoning", state, [/anime\s+summoning/], promotedBySlug.get("anime-summoning")),
    conceptFromPatterns("summoning magic", state, [/summoning\s+magic/], promotedBySlug.get("summoning-magic")),
    groupedConcept("dog breeds", promoted, classified, "dog-breed"),
    groupedConcept("flower names", promoted, classified, "flower-name"),
    groupedConcept("dinosaur species", promoted, classified, "dinosaur-species"),
    groupedConcept("specific animal types", promoted, classified, "animal-type"),
    groupedConcept("food/dessert subjects", promoted, classified, "food-dessert"),
    groupedConcept("holiday subthemes", promoted, classified, "holiday-subtheme"),
    groupedConcept("fantasy and magic clusters", promoted, classified, "fantasy-theme"),
    groupedConcept("plant names", promoted, classified, "plant-name"),
    groupedConcept("vehicle subjects", promoted, classified, "vehicle-type"),
  ];

  const animeBoys = concepts.find((concept) => concept.concept === "anime boys");
  if (animeBoys && !animeBoys.promotedRoute) {
    animeBoys.reason = "anime boys was not promoted because runtime assets did not contain sufficient clear anime boy, anime boys, male anime, or boy character evidence.";
  }

  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-unsupported-concepts`,
    summary: {
      conceptsReviewed: concepts.length,
      animeBoysPromoted: Boolean(promotedBySlug.get("anime-boys")),
      animeBoysWasNotPromoted: !promotedBySlug.get("anime-boys"),
      unsupportedRequestedConceptsCount: concepts.filter((concept) => !concept.promotedRoute).length,
    },
    concepts,
  };
}

function conceptFromPatterns(concept, state, patterns, promotedCandidate) {
  const matches = [];
  for (const feature of state.features.values()) {
    if (patterns.some((pattern) => pattern.test(feature.text))) {
      matches.push({
        assetId: feature.item.assetId,
        title: feature.title,
        filename: feature.item.filenameSlug,
      });
    }
  }
  return {
    concept,
    supported: Boolean(promotedCandidate),
    evidenceCount: matches.length,
    exampleAssets: matches.slice(0, 8),
    promotedRoute: promotedCandidate?.promotedRoute || null,
    reason: promotedCandidate
      ? `Promoted as ${promotedCandidate.promotedRoute} with sufficient runtime evidence.`
      : `${concept} was not promoted because the evidence count was below the required threshold or the wording was not clearly present in runtime assets.`,
  };
}

function groupedConcept(concept, promoted, classified, kind) {
  const promotedMatches = promoted.filter((candidate) => candidate.kind === kind);
  const manualMatches = classified.manualReview.filter((candidate) => candidate.kind === kind);
  const backlogMatches = classified.backlog.filter((candidate) => candidate.kind === kind);
  const all = [...promotedMatches, ...manualMatches, ...backlogMatches];
  return {
    concept,
    supported: promotedMatches.length > 0,
    evidenceCount: all.reduce((total, candidate) => total + candidate.assetCount, 0),
    exampleAssets: all.flatMap((candidate) =>
      candidate.representativeAssetIds.slice(0, 2).map((assetId, index) => ({
        assetId,
        title: candidate.representativeTitles[index],
        candidate: candidate.slug,
      })),
    ).slice(0, 8),
    promotedRoute: promotedMatches[0]?.promotedRoute || null,
    promotedRoutes: promotedMatches.map((candidate) => candidate.promotedRoute),
    reason: promotedMatches.length
      ? `${concept} is supported by promoted runtime-backed hubs such as ${promotedMatches.slice(0, 5).map((candidate) => candidate.slug).join(", ")}.`
      : `${concept} was not promoted because discovered candidates did not meet confidence and threshold requirements.`,
  };
}

function buildIpRiskAudit(classified, promoted) {
  const risky = classified.rawCandidates.filter((candidate) => candidate.ipRisk);
  const promotedRisk = promoted.filter((candidate) => IP_RISK_RE.test(`${candidate.slug} ${candidate.title}`));
  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-ip-risk-audit`,
    blockedTerms: IP_RISK_TERMS,
    summary: {
      noPromotedRouteUsesFranchiseNames: promotedRisk.length === 0,
      noPromotedTitleUsesFranchiseNames: promotedRisk.length === 0,
      noPublicRouteImpliesProtectedFranchise: promotedRisk.length === 0,
      riskyCandidatesRejectedOrManualOnly: risky.every((candidate) => candidate.decision !== "promoted"),
      ipRiskBlockedCount: risky.length,
    },
    riskyCandidates: risky.map(lightCandidate),
    promotedRiskCandidates: promotedRisk.map(lightCandidate),
  };
}

function buildImplementation(state, promoted, evidence) {
  const updatedHubs = structuredClone(state.input.runtimeHubs);
  const updatedRoutes = structuredClone(state.input.runtimeRoutes);
  const updatedSiteMap = structuredClone(state.input.runtimeSiteMap);
  const updatedHubItems = structuredClone(state.input.runtimeHubItems);
  const updatedSearchIndex = structuredClone(state.input.runtimeSearchIndex);
  const updatedFeatured = structuredClone(state.input.runtimeHubFeaturedItems);
  const updatedFilters = structuredClone(state.input.runtimeHubFilterTags);
  const updatedSeoPages = structuredClone(state.input.runtimeSeoPages);
  const updatedHubSeo = structuredClone(state.input.runtimeHubSeoContent);
  const updatedSocial = structuredClone(state.input.runtimeSocialMetadata);
  const updatedInternal = structuredClone(state.input.internalLinking);
  const existingHubIds = new Set(updatedHubs.hubs.map((hub) => hub.hubId));
  const allHubById = new Map(updatedHubs.hubs.map((hub) => [hub.hubId, hub]));
  const promotedHubRecords = [];

  for (const candidate of promoted) {
    const hub = buildHubRecord(state, candidate, evidence);
    if (existingHubIds.has(hub.hubId)) continue;
    existingHubIds.add(hub.hubId);
    allHubById.set(hub.hubId, hub);
    promotedHubRecords.push(hub);
  }

  for (const hub of promotedHubRecords) {
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
      selectionRule: "deterministic Round 2 long-tail selection from runtime asset titles and filenames",
    });
    updatedFilters.hubs.push(buildFilterUxForHub(state, hub));
    updatedSeoPages.pages.push(buildSeoPage(hub));
    updatedHubSeo.hubs.push(buildHubSeoContent(hub, allHubById));
    updatedSocial.pages.push(buildSocialMetadata(hub));
    updatedInternal.pages.push(buildInternalLinkingPage(hub, allHubById));
  }

  applyRelationships(updatedHubs.hubs, promotedHubRecords);
  applyMemberships(updatedHubItems, updatedSearchIndex, promotedHubRecords);
  applyParentInternalLinks(updatedInternal, updatedHubs.hubs, promotedHubRecords);
  refreshRuntimeSummaries({
    updatedHubs,
    updatedRoutes,
    updatedSiteMap,
    updatedHubItems,
    updatedSearchIndex,
    updatedFeatured,
    updatedFilters,
    updatedSeoPages,
    updatedHubSeo,
    updatedSocial,
  });

  const files = {
    [INPUTS.runtimeHubs]: updatedHubs,
    [INPUTS.runtimeRoutes]: updatedRoutes,
    [INPUTS.runtimeSiteMap]: updatedSiteMap,
    [INPUTS.runtimeHubItems]: updatedHubItems,
    [INPUTS.runtimeSearchIndex]: updatedSearchIndex,
    [INPUTS.runtimeHubFeaturedItems]: updatedFeatured,
    [INPUTS.runtimeHubFilterTags]: updatedFilters,
    [INPUTS.runtimeSeoPages]: updatedSeoPages,
    [INPUTS.runtimeHubSeoContent]: updatedHubSeo,
    [INPUTS.runtimeSocialMetadata]: updatedSocial,
    [INPUTS.internalLinking]: updatedInternal,
  };

  for (const manifest of Object.values(files)) {
    manifest.generatedAt = GENERATED_AT;
    if (manifest.runId) manifest.runId = appendRunId(manifest.runId, RUN_ID);
    else manifest.runId = RUN_ID;
  }

  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-implementation`,
    summary: {
      promotedCount: promotedHubRecords.length,
      runtimeHubCountBefore: state.input.runtimeHubs.hubs.length,
      runtimeHubCountAfter: updatedHubs.hubs.length,
      sitemapLocCountBefore: state.input.runtimeSiteMap.entries.length,
      sitemapLocCountAfter: updatedSiteMap.entries.length,
      routesAfter: updatedRoutes.routes.length,
      noPerImageRoutes: updatedRoutes.noPerImageRoutes === true && updatedRoutes.routes.every((route) => !/\/(?:image|asset|item)\//i.test(route.path)),
      deferredRecordsExcluded: true,
      staticExportStillConfigured: /output:\s*["']export["']/.test(state.input.nextConfig),
      appApiAbsent: !existsSync(path.join(REPO_ROOT, "app", "api")),
    },
    promotedHubs: promotedHubRecords.map((hub) => ({
      hubId: hub.hubId,
      slug: hub.slug,
      title: hub.title,
      route: hub.route,
      assetCount: hub.assetCount,
      parentHubId: hub.parentHubId,
      relatedHubIds: hub.relatedHubIds,
      evidenceSummary: hub.longTailSource.evidenceTerms,
      seoIntent: hub.longTailSource.searchIntentReason,
      overlapRisk: hub.longTailSource.nearestOverlapHub,
    })),
    files,
  };
}

function buildHubRecord(state, candidate) {
  const hubId = `hub_${candidate.slug.replace(/-/g, "_")}`;
  const route = `/coloring-pages/${candidate.slug}`;
  const parentHubId = chooseParentHubId(state, candidate);
  const parentHub = parentHubId ? state.hubById.get(parentHubId) : null;
  const relatedHubIds = unique([
    parentHubId,
    ROOT_HUB_ID,
    ...candidate.relatedExistingHubs.map((hub) => hub.hubId),
  ]).filter(Boolean).slice(0, 8);
  const assetIds = candidate.assetIds;
  const featuredAssetIds = assetIds.slice(0, Math.min(FEATURED_LIMIT, assetIds.length));
  const titleSubject = candidate.title.replace(/\s+Coloring Pages$/i, "");

  return {
    hubId,
    slug: candidate.slug,
    normalizedSlug: candidate.slug,
    route,
    title: candidate.title,
    h1: candidate.title,
    metaTitle: `${titleSubject} Coloring Pages to Print`,
    metaDescription: `Browse ${assetIds.length.toLocaleString()} ${titleSubject.toLowerCase()} coloring pages with real previews, gallery search, and PNG, JPG, or WebP downloads for printing.`,
    intro: `${candidate.title} gathers ${assetIds.length.toLocaleString()} printable pages supported by actual runtime assets. Start with the previews, then search or filter within the collection.`,
    assetCount: assetIds.length,
    assetIds,
    featuredAssetIds,
    previewAssetIds: assetIds.slice(0, Math.min(24, assetIds.length)),
    galleryPageSize: GALLERY_PAGE_SIZE,
    sectionGroupings: buildSectionGroupings(state, candidate),
    relatedHubIds,
    parentHubId,
    childHubIds: [],
    breadcrumbPath: [
      { label: "Coloring Pages", route: "/coloring-pages" },
      ...(parentHub && parentHub.route !== "/coloring-pages" ? [{ label: cleanTitle(parentHub.title), route: parentHub.route }] : []),
      { label: titleSubject, route: "" },
    ],
    internalLinkingTargets: relatedHubIds,
    indexable: true,
    sitemap: true,
    noPerImageIndexableRoute: true,
    score: scoreCandidate(candidate),
    longTailSource: {
      runId: RUN_ID,
      kind: candidate.kind,
      confidence: "high",
      evidenceTerms: candidate.exactMatchingTerms,
      searchIntentReason: candidate.searchIntentReason,
      reasonNotDuplicate: candidate.reasonNotDuplicate,
      nearestOverlapHub: candidate.nearestOverlapHub,
    },
  };
}

function buildSectionGroupings(state, candidate) {
  const tokenCounts = new Map();
  for (const assetId of candidate.assetIds) {
    const feature = state.features.get(assetId);
    if (!feature) continue;
    for (const token of feature.tokens) {
      if (STOP_TOKENS.has(token) || GENERIC_PHRASES.has(token)) continue;
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }
  }
  const items = [...tokenCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([term, assetCount]) => ({
      label: titleCase(term),
      term,
      assetCount,
    }));
  return [
    {
      groupingId: "long_tail_round_2_terms",
      label: "Common Themes",
      items,
    },
  ];
}

function buildFilterUxForHub(state, hub) {
  const tagDefinitions = [
    { id: "animals", label: "Animals", group: "subject", re: /\banimals?|dogs?|cats?|bird|fish|reptile|insect|dinosaur|prehistoric\b/i },
    { id: "flowers", label: "Flowers", group: "subject", re: /\bflowers?|lily|daisy|orchid|lotus|poppy|plant|fern|cactus\b/i },
    { id: "fantasy", label: "Fantasy", group: "theme", re: /\bfantasy|magic|summoning|dragon|wizard|witch|sorcerer|mage|arcane\b/i },
    { id: "seasonal", label: "Seasonal", group: "theme", re: /\bholiday|christmas|halloween|birthday|snowman|gingerbread|trick|treat\b/i },
    { id: "patterns", label: "Patterns", group: "style", re: /\bmandala|geometric|pattern\b/i },
    { id: "cute", label: "Cute", group: "style", re: /\bcute|kawaii|chibi|plushie\b/i },
    { id: "simple", label: "Simple", group: "difficulty", re: /\bsimple|easy\b/i },
    { id: "detailed", label: "Detailed", group: "difficulty", re: /\bdetailed|intricate|mandala|geometric\b/i },
  ];
  const tags = tagDefinitions
    .map((tag) => ({
      id: tag.id,
      label: tag.label,
      group: tag.group,
      assetCount: hub.assetIds.filter((assetId) => {
        const feature = state.features.get(assetId);
        return feature ? tag.re.test(feature.text) : false;
      }).length,
    }))
    .filter((tag) => tag.assetCount > 0)
    .sort((a, b) => b.assetCount - a.assetCount || a.label.localeCompare(b.label));
  return {
    hubId: hub.hubId,
    slug: hub.slug,
    title: hub.title,
    assetCount: hub.assetCount,
    tags,
    tabs: tags.filter((tag) => !["animals", "flowers", "fantasy"].includes(tag.id)).slice(0, 6),
  };
}

function buildSeoPage(hub) {
  return {
    pageType: "hubPage",
    hubId: hub.hubId,
    slug: hub.slug,
    path: hub.route,
    canonicalPath: hub.route,
    pageTitle: hub.title,
    metaTitle: hub.metaTitle,
    metaDescription: hub.metaDescription,
    h1: hub.h1,
    shortIntro: hub.intro,
    noIndex: false,
    sitemap: true,
    content: null,
  };
}

function buildHubSeoContent(hub, allHubById) {
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
      `${hub.assetCount.toLocaleString()} printable ${cleanTitle(hub.title).toLowerCase()} pages`,
      "Evidence-backed collection built from runtime asset titles and filenames",
      "Print and PNG, JPG, or WebP controls remain on visible gallery cards",
    ],
    belowGallerySections: [
      {
        heading: `What you'll find in ${cleanTitle(hub.title)}`,
        body: `${hub.title} is promoted from repeated terms in the runtime image library, with ${hub.assetCount.toLocaleString()} matching assets and no per-image route expansion.`,
      },
      {
        heading: "How this collection is organized",
        body: "The page keeps artwork previews first, then supports search, filters, related collections, printing, and browser-side PNG, JPG, or WebP downloads.",
      },
      {
        heading: "Related browsing",
        body: "Use the related links when you want a broader parent collection or a nearby subject supported by the same runtime inventory.",
      },
    ],
    relatedHubLinks: hub.relatedHubIds
      .map((hubId) => allHubById.get(hubId))
      .filter(Boolean)
      .slice(0, 8)
      .map((related) => ({
        label: related.title,
        href: related.route,
        reason: "related parent or sibling collection",
        assetCount: related.assetCount,
      })),
    contentWarnings: [],
  };
}

function buildSocialMetadata(hub) {
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
      description: hub.metaDescription,
      richPinCandidate: "article",
    },
  };
}

function buildInternalLinkingPage(hub, allHubById) {
  return {
    path: hub.route,
    hubId: hub.hubId,
    links: hub.relatedHubIds
      .map((hubId) => allHubById.get(hubId))
      .filter(Boolean)
      .slice(0, 8)
      .map((related) => ({
        label: related.title,
        href: related.route,
        reason: "related parent or sibling collection",
        assetCount: related.assetCount,
      })),
    strategy: "Round 2 evidence-backed long-tail hubs link to their broader parent and high-overlap sibling collections.",
  };
}

function applyRelationships(hubs, promotedHubRecords) {
  const hubById = new Map(hubs.map((hub) => [hub.hubId, hub]));
  for (const hub of promotedHubRecords) {
    const parent = hubById.get(hub.parentHubId);
    if (parent) {
      parent.childHubIds = unique([...(parent.childHubIds || []), hub.hubId]);
      parent.relatedHubIds = unique([...(parent.relatedHubIds || []), hub.hubId]).slice(0, 24);
      parent.internalLinkingTargets = unique([...(parent.internalLinkingTargets || []), hub.hubId]).slice(0, 24);
    }
  }
}

function applyMemberships(updatedHubItems, updatedSearchIndex, promotedHubRecords) {
  const hubIdsByAssetId = new Map();
  for (const hub of promotedHubRecords) {
    for (const assetId of hub.assetIds) {
      if (!hubIdsByAssetId.has(assetId)) hubIdsByAssetId.set(assetId, []);
      hubIdsByAssetId.get(assetId).push(hub.hubId);
    }
  }

  updatedHubItems.items = updatedHubItems.items.map((entry) => ({
    ...entry,
    hubIds: unique([...(entry.hubIds || []), ...(hubIdsByAssetId.get(entry.assetId) || [])]),
  }));

  const hubTitleById = new Map(promotedHubRecords.map((hub) => [hub.hubId, normalizeText(hub.title)]));
  updatedSearchIndex.entries = updatedSearchIndex.entries.map((entry) => {
    const addHubIds = hubIdsByAssetId.get(entry.assetId) || [];
    const addedSearch = addHubIds.map((hubId) => hubTitleById.get(hubId)).filter(Boolean).join(" ");
    return {
      ...entry,
      hubIds: unique([...(entry.hubIds || []), ...addHubIds]),
      searchText: `${entry.searchText || ""} ${addedSearch}`.replace(/\s+/g, " ").trim(),
    };
  });
}

function applyParentInternalLinks(updatedInternal, hubs, promotedHubRecords) {
  const hubById = new Map(hubs.map((hub) => [hub.hubId, hub]));
  for (const parentHubId of unique(promotedHubRecords.map((hub) => hub.parentHubId).filter(Boolean))) {
    const parentPage = updatedInternal.pages.find((page) => page.hubId === parentHubId);
    if (!parentPage) continue;
    const additions = promotedHubRecords
      .filter((hub) => hub.parentHubId === parentHubId)
      .map((hub) => ({
        label: hub.title,
        href: hub.route,
        reason: "new evidence-backed long-tail child collection",
        assetCount: hub.assetCount,
      }));
    parentPage.links = uniqueLinks([...(parentPage.links || []), ...additions]).slice(0, 24);
  }

  const rootPage = updatedInternal.pages.find((page) => page.hubId === ROOT_HUB_ID || page.path === "/coloring-pages");
  if (rootPage) {
    rootPage.links = uniqueLinks([
      ...(rootPage.links || []),
      ...promotedHubRecords.slice(0, 16).map((hub) => ({
        label: hub.title,
        href: hub.route,
        reason: "new evidence-backed long-tail collection",
        assetCount: hub.assetCount,
      })),
    ]).slice(0, 32);
  }

  for (const hub of promotedHubRecords) {
    for (const relatedHubId of hub.relatedHubIds) {
      const related = hubById.get(relatedHubId);
      if (!related) continue;
      related.relatedHubIds = unique([...(related.relatedHubIds || []), hub.hubId]).slice(0, 24);
    }
  }
}

function refreshRuntimeSummaries(files) {
  files.updatedHubs.summary = {
    ...(files.updatedHubs.summary || {}),
    hubCount: files.updatedHubs.hubs.length,
    runtimeAvailableRecords: EXPECTED_AVAILABLE_RECORDS,
    longTailRound2PromotedHubCount: files.updatedHubs.hubs.filter((hub) => hub.longTailSource?.runId === RUN_ID).length,
    noPerImageRoutes: true,
  };
  files.updatedRoutes.routes.sort((a, b) => a.path.localeCompare(b.path));
  files.updatedSiteMap.entries.sort((a, b) => a.path.localeCompare(b.path));
  files.updatedRoutes.summary = {
    ...(files.updatedRoutes.summary || {}),
    routeCount: files.updatedRoutes.routes.length,
    noPerImageRoutes: true,
    longTailRound2PromotedRoutes: files.updatedRoutes.routes.filter((route) => files.updatedHubs.hubs.some((hub) => hub.hubId === route.hubId && hub.longTailSource?.runId === RUN_ID)).length,
  };
  files.updatedSiteMap.summary = {
    ...(files.updatedSiteMap.summary || {}),
    entryCount: files.updatedSiteMap.entries.length,
    noPerImageRoutes: true,
  };
  files.updatedHubItems.summary = {
    ...(files.updatedHubItems.summary || {}),
    assetCount: files.updatedHubItems.items.length,
    longTailRound2HubIdsIncluded: true,
  };
  files.updatedSearchIndex.summary = {
    ...(files.updatedSearchIndex.summary || {}),
    entryCount: files.updatedSearchIndex.entries.length,
    longTailRound2HubIdsIncluded: true,
  };
  files.updatedFeatured.summary = {
    ...(files.updatedFeatured.summary || {}),
    hubCount: files.updatedFeatured.hubs.length,
  };
  files.updatedFilters.summary = {
    ...(files.updatedFilters.summary || {}),
    hubCount: files.updatedFilters.hubs.length,
  };
  files.updatedSeoPages.summary = {
    ...(files.updatedSeoPages.summary || {}),
    pageCount: files.updatedSeoPages.pages.length,
  };
  files.updatedHubSeo.summary = {
    ...(files.updatedHubSeo.summary || {}),
    hubSeoContentCount: files.updatedHubSeo.hubs.length,
  };
}

function buildPromotedHubsManifest(implementation, evidence) {
  const evidenceBySlug = new Map(evidence.candidates.map((candidate) => [candidate.slug, candidate]));
  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-promoted-hubs`,
    summary: {
      promotedCount: implementation.promotedHubs.length,
      runtimeHubCountAfter: implementation.summary.runtimeHubCountAfter,
      sitemapLocCountAfter: implementation.summary.sitemapLocCountAfter,
      noPerImageRoutes: implementation.summary.noPerImageRoutes,
      deferredRecordsExcluded: implementation.summary.deferredRecordsExcluded,
    },
    hubs: implementation.promotedHubs.map((hub) => {
      const record = evidenceBySlug.get(hub.slug);
      return {
        slug: hub.slug,
        title: hub.title,
        routeUrl: `${PUBLIC_SITE_URL}${hub.route}`,
        assetCount: hub.assetCount,
        evidenceSummary: record?.exactMatchingTerms || [],
        reasonPromoted: record?.reason || "Promoted from data-driven runtime evidence.",
        parentBroaderRelatedHubs: hub.relatedHubIds,
        seoIntent: record?.searchIntentReason || "",
        overlapRisk: record?.nearestOverlapHub || null,
      };
    }),
  };
}

function buildAcceptanceGate({ promoted, classified, context, browserQa, sampledUrl, implementation, unsupported, ipRisk }) {
  const browserPassed = browserQa?.summary?.browserQaPassed === true;
  const sampledPassed = sampledUrl?.summary?.sampledUrlCheckPassed === true;
  const blockers = [];
  if (!context.summary.repoProjectCorrect || !context.summary.branchCorrect) blockers.push("Project context failed.");
  if (!context.summary.appApiAbsent || !context.summary.staticExportConfigured) blockers.push("Static frontend-only boundary failed.");
  if (promoted.some((candidate) => candidate.ipRisk || candidate.duplicateSlug || candidate.weakGeneric)) blockers.push("A promoted candidate violates support or duplicate rules.");
  if (!ipRisk.summary.noPromotedRouteUsesFranchiseNames) blockers.push("IP-risk route promoted.");
  if (!browserPassed) blockers.push("Round 2 browser QA has not passed yet.");
  if (!sampledPassed) blockers.push("Round 2 sampled URL check has not passed yet.");

  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-acceptance-gate`,
    promoted_count: promoted.length,
    manual_review_count: classified.manualReview.length,
    backlog_count: classified.backlog.length,
    rejected_count: classified.rejected.length,
    unsupported_requested_concepts_count: unsupported.summary.unsupportedRequestedConceptsCount,
    ip_risk_blocked_count: ipRisk.summary.ipRiskBlockedCount,
    runtime_hub_count_after: implementation.summary.runtimeHubCountAfter,
    sitemap_loc_count_after: implementation.summary.sitemapLocCountAfter,
    browser_qa_passed: browserPassed,
    sampled_url_check_passed: sampledPassed,
    no_unsupported_categories_promoted: promoted.every((candidate) => !candidate.duplicateSlug && !candidate.weakGeneric && !candidate.ipRisk),
    ready_for_next_local_qa: blockers.length === 0,
    blockers,
  };
}

function detectContexts(feature) {
  const text = feature.text;
  const contexts = [];
  if (/\bdogs?\b/.test(text)) contexts.push("dog-breed", "animal-type");
  if (/\bflowers?|garden flowers?|orchid|lily|daisy|lotus|poppy|tulip|sunflower|lavender\b/.test(text)) contexts.push("flower-name", "plant-name");
  if (/\bindoor plants?|cactus|fern|pothos|monstera|bamboo\b/.test(text)) contexts.push("plant-name");
  if (/\bprehistoric|dinosaur|pteranodon|pterodactyl|mosasaurus|plesiosaurus|ankylosaurus|iguanodon|saber toothed tiger\b/.test(text)) contexts.push("dinosaur-species", "animal-type");
  if (/\banimals?|birds?|reptiles?|insects?|sea life|fish|alligator|salamander|lemur|jaguar|gecko|chameleon|dolphin|seal\b/.test(text)) contexts.push("animal-type");
  if (/\bbakery|sushi|food|cookie|donut|cupcake|bread|nigiri|gingerbread\b/.test(text)) contexts.push("food-dessert");
  if (/\bvehicle|vehiacle|car|train|locomotive|plane|helicopter|truck|bus|boat|ship\b/.test(text)) contexts.push("vehicle-type");
  if (/\bholiday|christmas|halloween|birthday|st patricks|shamrock|leprechaun|snowman|gingerbread|trick or treat|haunted house\b/.test(text)) contexts.push("holiday-subtheme");
  if (/\bfantasy|magic|summoning|wizard|witch|sorcerer|mage|arcane|dragon|dungeon\b/.test(text)) contexts.push("fantasy-theme");
  if (/\bjapan|landmarks?|temple|castle|bridge|house\b/.test(text)) contexts.push("place-theme");
  if (/\bmandala|geometric|pattern|face patterns\b/.test(text)) contexts.push("pattern-theme");
  return unique(contexts.length ? contexts : ["subject"]);
}

function chooseKind(phrase, contexts) {
  const contextMap = new Map(contexts);
  if (/\b(?:german shepherd|golden retriever|labrador retriever|bulldog|terrier|poodle|beagle|husky|chihuahua|rottweiler|collie|shepherd|dane|samoyed|akita|pug|dalmatian)\b/.test(phrase)) return "dog-breed";
  if (/\b(?:maple|cactus|fern|pothos|bamboo|monstera)\b/.test(phrase)) return "plant-name";
  if (/\b(?:peacock|alligator|salamander|lemur|jaguar|gecko|chameleon|seal|turkey|armadillo|camel)\b/.test(phrase)) return "animal-type";
  if (/\b(?:lily|daisy|orchid|lotus|poppy|tulip|sunflower|lavender|hibiscus|peony|iris|flower)\b/.test(phrase) && (contextMap.get("flower-name") || 0) >= 2) return "flower-name";
  if (/\b(?:ankylosaurus|pteranodon|pterodactyl|plesiosaurus|mosasaurus|iguanodon|saber toothed tiger|woolly mammoth|tyrannosaurus rex)\b/.test(phrase)) return "dinosaur-species";
  if (/\b(?:cookie|donut|cupcake|bread|nigiri|gingerbread|salmon)\b/.test(phrase)) return "food-dessert";
  if (/\b(?:steam train|bullet train|sports car|helicopter)\b/.test(phrase)) return "vehicle-type";
  if (/\b(?:halloween costume|birthday celebration|christmas plushie|snowman|trick or treat|haunted house|leprechaun|shamrock|gingerbread)\b/.test(phrase)) return "holiday-subtheme";
  if (/\b(?:summoning|magic|sorcerer|mage|arcane|crystal dragon|fire dragon|ice dragon)\b/.test(phrase)) return "fantasy-theme";
  if (/\b(?:japan|temple|castle|bridge|landmark)\b/.test(phrase) && (contextMap.get("place-theme") || 0) >= 4) return "place-theme";
  if (/\b(?:face patterns|animal mandala)\b/.test(phrase)) return "pattern-theme";
  if ((contextMap.get("animal-type") || 0) >= Math.max(3, (contextMap.get("subject") || 0))) return "animal-type";
  const [top] = contexts[0] || ["subject"];
  return top || "subject";
}

function isDuplicateSlug(state, slug) {
  const existing = new Set(state.input.runtimeHubs.hubs.map((hub) => hub.slug));
  const equivalents = new Set([...existing, ...[...existing].map(singularSlug)]);
  const alias = DUPLICATE_ALIASES.get(slug) || slug;
  return existing.has(slug) || equivalents.has(singularSlug(slug)) || existing.has(alias);
}

function isWeakGeneric(phrase, kind) {
  if (PROMOTION_DENY_SLUGS.has(slugify(phrase))) return true;
  const parts = phrase.split(" ");
  if (new Set(parts).size !== parts.length) return true;
  if (GENERIC_PHRASES.has(phrase)) return true;
  if (/^(?:all|more|new|old|great|little|big|classic|happy|smiling|playing|flying|sitting|standing|red|blue|black|white)$/.test(phrase)) return true;
  if (/\bjutsu\b/.test(phrase)) return true;
  if (parts.some((part) => GENERIC_PHRASES.has(part)) && !["food-dessert", "holiday-subtheme", "fantasy-theme"].includes(kind)) return true;
  if (phrase.split(" ").length === 1 && ["subject", "combination", "broad"].includes(kind) && !/summoning|magic|japan/.test(phrase)) return true;
  return false;
}

function confidenceForCandidate(candidate) {
  if (candidate.assetCount < candidate.threshold.minimum) return "low";
  if (!candidate.trustedEvidence) return "low";
  if (candidate.nearestOverlapHub.slug === candidate.slug) return "low";
  if (candidate.sourceCategories.length === 1 && candidate.assetCount < 8 && !["dog-breed", "flower-name", "dinosaur-species", "food-dessert", "vehicle-type", "plant-name"].includes(candidate.kind)) return "medium";
  return "high";
}

function scoreCandidate(candidate) {
  const kindWeight = {
    "dog-breed": 75,
    "flower-name": 72,
    "dinosaur-species": 76,
    "food-dessert": 65,
    "vehicle-type": 62,
    "holiday-subtheme": 68,
    "fantasy-theme": 58,
    "plant-name": 54,
    "animal-type": 52,
    "place-theme": 45,
    "pattern-theme": 40,
  }[candidate.kind] || 35;
  const specificity = candidate.slug.split("-").length * 4;
  const countScore = Math.min(80, candidate.assetCount);
  return kindWeight + specificity + countScore;
}

function minimumForKind(kind) {
  return MINIMUMS[kind] || MINIMUMS.subject;
}

function thresholdRuleForKind(kind) {
  if (["dog-breed", "flower-name", "dinosaur-species", "food-dessert", "vehicle-type", "plant-name"].includes(kind)) {
    return "Specific species, breed, flower, object, food, plant, or vehicle hubs require 6 or more runtime assets.";
  }
  if (kind === "holiday-subtheme" || kind === "fantasy-theme" || kind === "animal-type" || kind === "place-theme") {
    return "Subject or theme hubs require 8 or more runtime assets.";
  }
  if (kind === "pattern-theme") return "Combination or pattern hubs require 10 or more runtime assets.";
  return "Subject hubs require 8 or more runtime assets.";
}

function findNearestOverlap(state, assetIds) {
  const candidateSet = new Set(assetIds);
  let best = { hubId: null, slug: null, title: null, overlapCount: 0, overlapPercentage: 0 };
  for (const hub of state.input.runtimeHubs.hubs) {
    const overlapCount = hub.assetIds.filter((assetId) => candidateSet.has(assetId)).length;
    if (overlapCount > best.overlapCount) {
      best = {
        hubId: hub.hubId,
        slug: hub.slug,
        title: hub.title,
        overlapCount,
        overlapPercentage: Number((overlapCount / Math.max(1, assetIds.length)).toFixed(4)),
      };
    }
  }
  return best;
}

function relatedExistingHubIds(state, assetIds) {
  const candidateSet = new Set(assetIds);
  return state.input.runtimeHubs.hubs
    .map((hub) => ({
      hubId: hub.hubId,
      slug: hub.slug,
      title: hub.title,
      route: hub.route,
      assetCount: hub.assetCount,
      overlapCount: hub.assetIds.filter((assetId) => candidateSet.has(assetId)).length,
    }))
    .filter((hub) => hub.overlapCount > 0)
    .sort((a, b) => b.overlapCount - a.overlapCount || a.title.localeCompare(b.title))
    .slice(0, 10);
}

function chooseParentHubId(state, candidate) {
  const preferredByKind = {
    "dog-breed": ["dogs", "animals"],
    "flower-name": ["flowers", "garden-flowers", "plants"],
    "dinosaur-species": ["dinosaurs", "prehistoric-animals", "animals"],
    "animal-type": ["animals"],
    "food-dessert": candidate.slug.includes("nigiri") || candidate.slug.includes("salmon") ? ["sushi", "food"] : ["bakery", "food"],
    "vehicle-type": candidate.slug.includes("train") ? ["trains", "vehicles"] : candidate.slug.includes("helicopter") ? ["planes", "vehicles"] : ["vehicles"],
    "holiday-subtheme": candidate.slug.includes("halloween") || candidate.slug.includes("haunted") || candidate.slug.includes("trick") ? ["halloween", "holidays"] : candidate.slug.includes("christmas") || candidate.slug.includes("gingerbread") || candidate.slug.includes("snowman") ? ["christmas", "holidays"] : candidate.slug.includes("birthday") ? ["birthday", "holidays"] : ["holidays"],
    "fantasy-theme": ["fantasy", "anime-girls"],
    "plant-name": ["indoor-plants", "plants"],
    "place-theme": candidate.slug.includes("japan") ? ["world-landmarks", "geometric"] : ["world-landmarks"],
    "pattern-theme": ["geometric", "mandalas"],
  }[candidate.kind] || ["coloring-pages"];
  for (const slug of preferredByKind) {
    const hub = state.hubBySlug.get(slug);
    if (hub) return hub.hubId;
  }
  return ROOT_HUB_ID;
}

function cleanTailPhrase(tail, maxTokens) {
  const tokens = extractTokens(tail).filter((token) => !STOP_TOKENS.has(token));
  const kept = [];
  for (const token of tokens) {
    if (TAIL_STOP_TOKENS.has(token)) break;
    kept.push(token);
    if (kept.length >= maxTokens) break;
  }
  return kept.join(" ");
}

function normalizeText(value) {
  return String(value || "")
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/t[\s-]?rex/gi, "t-rex")
    .replace(/[^a-zA-Z0-9-]+/g, " ")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhrase(phrase) {
  const raw = String(phrase || "").toLowerCase();
  if (/\btrick\s+or\s+treat\b/.test(raw)) return "trick or treat";
  if (/\bforget\s+me\s+not\b/.test(raw)) return "forget me not";
  const normalized = normalizeText(phrase);
  const tokens = extractTokens(normalized).filter((token) => !STOP_TOKENS.has(token));
  return tokens.join(" ").trim();
}

function extractTokens(text) {
  return normalizeText(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => TOKEN_REPLACEMENTS.get(token) || token)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token));
}

function slugify(value) {
  return normalizePhrase(value).replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function singularSlug(slug) {
  return slug
    .split("-")
    .map((part) => {
      if (part.endsWith("ies")) return `${part.slice(0, -3)}y`;
      if (part.endsWith("ses")) return part.slice(0, -1);
      if (part.endsWith("es") && part.length > 4) return part.slice(0, -2);
      if (part.endsWith("s") && part.length > 3) return part.slice(0, -1);
      return part;
    })
    .join("-");
}

function buildCandidateTitle(phrase, kind) {
  if (phrase === "forget me not") return "Forget-Me-Not Coloring Pages";
  const subject = titleCase(phrase)
    .replace(/\bT Rex\b/g, "T-Rex")
    .replace(/\bPteranodon\b/g, "Pteranodon")
    .replace(/\bPterodactyl\b/g, "Pterodactyl")
    .replace(/\bMosasaurus\b/g, "Mosasaurus")
    .replace(/\bPlesiosaurus\b/g, "Plesiosaurus")
    .replace(/\bIguanodon\b/g, "Iguanodon");
  if (kind === "holiday-subtheme" && phrase === "halloween costume") return "Halloween Costumes Coloring Pages";
  if (kind === "holiday-subtheme" && phrase === "christmas plushie") return "Christmas Plushies Coloring Pages";
  if (kind === "fantasy-theme" && phrase === "summoning") return "Summoning Coloring Pages";
  return `${subject} Coloring Pages`;
}

function titleCase(value) {
  return String(value)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => {
      if (part === "or" || part === "me" || part === "not") return part;
      return part.length <= 2 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

function cleanTitle(title) {
  return title.replace(/\s+Coloring Pages$/i, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueLinks(links) {
  const seen = new Set();
  return links.filter((link) => {
    if (!link?.href || seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

function appendRunId(current, runId) {
  return current.includes(runId) ? current : `${current}+${runId}`;
}

function lightCandidate(candidate) {
  return {
    slug: candidate.slug,
    title: candidate.title,
    kind: candidate.kind,
    assetCount: candidate.assetCount,
    exactMatchingTerms: candidate.exactMatchingTerms,
    decision: candidate.decision,
    reason: candidate.reason,
    representativeAssetIds: candidate.representativeAssetIds?.slice(0, 8) || [],
    representativeTitles: candidate.representativeTitles?.slice(0, 8) || [],
    nearestOverlapHub: candidate.nearestOverlapHub,
  };
}

function buildCandidateManifest(type, candidates) {
  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-${type}-candidates`,
    summary: {
      type,
      candidateCount: candidates.length,
      promotedCount: type === "promoted" ? candidates.length : 0,
      runtimeAvailableOnly: true,
      deferredRecordsExcluded: true,
      franchiseRiskBlocked: true,
    },
    candidates: candidates.map(lightCandidate),
  };
}

function renderContextReport(context) {
  return `# Long-Tail Round 2 Context Check

| Check | Result |
| --- | --- |
| repoProjectCorrect | ${pass(context.summary.repoProjectCorrect)} |
| branchCorrect | ${pass(context.summary.branchCorrect)} |
| latestFinalLinkNavCommitExists | ${pass(context.summary.latestFinalLinkNavCommitExists)} |
| appApiAbsent | ${pass(context.summary.appApiAbsent)} |
| staticExportConfigured | ${pass(context.summary.staticExportConfigured)} |
| runtimeAvailableRecords | ${context.summary.runtimeAvailableRecords.toLocaleString()} |
| deferredRecordsExcluded | ${pass(context.summary.deferredRecordsExcluded)} |
| currentHubCountBefore | ${context.summary.currentHubCountBefore} |
| currentSitemapCountBefore | ${context.summary.currentSitemapCountBefore} |
| svgInternalOnly | ${pass(context.summary.svgInternalOnly)} |
| publicDownloads | ${context.summary.publicDownloads.join(", ")} |
| imageSitemapExists | ${pass(context.summary.imageSitemapExists)} |
| ogImagesExist | ${pass(context.summary.ogImagesExist)} |
| jsonLdExists | ${pass(context.summary.jsonLdExists)} |
| liveAdSenseAbsent | ${pass(context.summary.liveAdSenseAbsent)} |
`;
}

function renderCandidateReport(classified, promoted) {
  const rows = promoted
    .map((candidate) => `| ${candidate.slug} | ${candidate.kind} | ${candidate.assetCount} | promoted | ${candidate.exactMatchingTerms.join(", ")} |`)
    .join("\n");
  return `# Long-Tail Round 2 Candidate Report

Candidate mining used runtime-available titles, filenames, categories, existing hub memberships, token frequency, n-grams, repeated subject phrases, and cross-folder co-occurrence only.

| Metric | Count |
| --- | ---: |
| raw candidates | ${classified.rawCandidates.length} |
| promoted | ${promoted.length} |
| manual review | ${classified.manualReview.length} |
| backlog | ${classified.backlog.length} |
| rejected | ${classified.rejected.length} |

## Promoted

| Slug | Type | Assets | Decision | Evidence terms |
| --- | --- | ---: | --- | --- |
${rows}
`;
}

function renderEvidenceReport(evidence) {
  const rows = evidence.candidates
    .slice(0, 120)
    .map((candidate) => `| ${candidate.slug} | ${candidate.candidateType} | ${candidate.assetCount} | ${candidate.decision} | ${candidate.exactMatchingTerms.join(", ")} | ${candidate.nearestOverlapHub.title || ""} (${Math.round(candidate.overlapPercentage * 100)}%) |`)
    .join("\n");
  return `# Long-Tail Round 2 Candidate Evidence

| Slug | Type | Assets | Decision | Exact terms | Nearest overlap |
| --- | --- | ---: | --- | --- | --- |
${rows}
`;
}

function renderUnsupportedReport(unsupported) {
  const rows = unsupported.concepts
    .map((concept) => `| ${concept.concept} | ${concept.supported ? "yes" : "no"} | ${concept.evidenceCount} | ${concept.promotedRoute || ""} | ${concept.reason} |`)
    .join("\n");
  return `# Long-Tail Round 2 Unsupported Concepts

Anime boys was not promoted unless the data clearly supported it. In this run, anime boys was not promoted.

| Concept | Supported | Evidence Count | Promoted Route | Reason |
| --- | --- | ---: | --- | --- |
${rows}
`;
}

function renderIpRiskReport(ipRisk) {
  const rows = ipRisk.riskyCandidates
    .map((candidate) => `| ${candidate.slug} | ${candidate.title} | ${candidate.assetCount} | ${candidate.decision} |`)
    .join("\n");
  return `# Long-Tail Round 2 IP Risk Audit

| Check | Result |
| --- | --- |
| noPromotedRouteUsesFranchiseNames | ${pass(ipRisk.summary.noPromotedRouteUsesFranchiseNames)} |
| noPromotedTitleUsesFranchiseNames | ${pass(ipRisk.summary.noPromotedTitleUsesFranchiseNames)} |
| riskyCandidatesRejectedOrManualOnly | ${pass(ipRisk.summary.riskyCandidatesRejectedOrManualOnly)} |
| ipRiskBlockedCount | ${ipRisk.summary.ipRiskBlockedCount} |

| Risky Candidate | Title | Assets | Decision |
| --- | --- | ---: | --- |
${rows || "| None |  | 0 |  |"}
`;
}

function renderPromotedHubsReport(promotedHubs) {
  const rows = promotedHubs.hubs
    .map((hub) => `| ${hub.slug} | ${hub.title} | ${hub.assetCount} | ${hub.routeUrl} | ${hub.evidenceSummary.join(", ")} |`)
    .join("\n");
  return `# Long-Tail Round 2 Promoted Hubs

| Metric | Value |
| --- | ---: |
| promotedCount | ${promotedHubs.summary.promotedCount} |
| runtimeHubCountAfter | ${promotedHubs.summary.runtimeHubCountAfter} |
| sitemapLocCountAfter | ${promotedHubs.summary.sitemapLocCountAfter} |

| Slug | Title | Assets | Route | Evidence |
| --- | --- | ---: | --- | --- |
${rows}
`;
}

function renderDecisionCsv(candidates) {
  const header = ["slug", "title", "asset_count", "evidence_terms", "representative_assets", "reason_not_promoted", "owner_decision", "owner_notes"];
  const rows = candidates.map((candidate) =>
    [
      candidate.slug,
      candidate.title,
      candidate.assetCount,
      candidate.exactMatchingTerms.join("; "),
      candidate.representativeAssetIds.slice(0, 8).join("; "),
      candidate.reason,
      "",
      "",
    ].map(csvEscape).join(","),
  );
  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

function renderDecisionMd(title, candidates) {
  const rows = candidates
    .slice(0, 120)
    .map((candidate) => `| ${candidate.slug} | ${candidate.title} | ${candidate.assetCount} | ${candidate.exactMatchingTerms.join(", ")} | ${candidate.reason} |  |  |`)
    .join("\n");
  return `# Long-Tail Round 2 ${title}

| Slug | Title | Assets | Evidence Terms | Reason Not Promoted | Owner Decision | Owner Notes |
| --- | --- | ---: | --- | --- | --- | --- |
${rows}
`;
}

function renderAcceptanceReport(acceptance) {
  const rows = Object.entries(acceptance)
    .filter(([key]) => !["generatedAt", "runId", "blockers"].includes(key))
    .map(([key, value]) => `| ${key} | ${Array.isArray(value) ? value.join(", ") : String(value)} |`)
    .join("\n");
  return `# Long-Tail Round 2 Acceptance Gate

| Field | Value |
| --- | --- |
${rows}

Blockers:
${acceptance.blockers.length ? acceptance.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None"}
`;
}

async function writeGeneratedRuntimeFiles(files) {
  for (const [relativePath, value] of Object.entries(files)) {
    await writeJson(relativePath, value);
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readJsonIfExists(relativePath) {
  if (!existsSync(path.join(REPO_ROOT, relativePath))) return null;
  return readJson(relativePath);
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, value) {
  await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, value, "utf8");
}

async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const root of relativeRoots) {
    const absoluteRoot = path.join(REPO_ROOT, root);
    if (!existsSync(absoluteRoot)) continue;
    const files = await listFiles(absoluteRoot);
    for (const file of files) {
      const repoPath = normalizePath(path.relative(REPO_ROOT, file));
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(repoPath)) continue;
      if (!options.includeGenerated && repoPath.startsWith("src/generated/")) continue;
      chunks.push(await readFile(file, "utf8"));
    }
  }
  return chunks.join("\n");
}

async function listFiles(root) {
  const results = [];
  const entries = await import("node:fs/promises").then((fs) => fs.readdir(root, { withFileTypes: true }));
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...(await listFiles(absolute)));
    else results.push(absolute);
  }
  return results;
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT });
  return stdout.trim();
}

async function commitExists(commit) {
  try {
    await git(["cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function readPublicDownloads(source) {
  const match = source.match(/EXPOSED_PUBLIC_DOWNLOAD_FORMATS:[^=]+=\s*\[([^\]]+)\]/m);
  if (!match) return [];
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
}

function pass(value) {
  return value ? "pass" : "fail";
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/");
}
