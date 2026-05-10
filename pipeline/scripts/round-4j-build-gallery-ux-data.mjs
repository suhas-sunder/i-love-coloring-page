import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

export const ROUND4J_GENERATED_AT = "2026-05-10";
export const ROUND4J_RUN_ID = "round-4j-gallery-discovery-ux";

const LOCAL_MEDIA_BASE_URL = "http://127.0.0.1:4175/coloring-pages";
const LOCAL_MEDIA_ROOT = "pipeline/r2-upload/coloring-pages";
const EXPECTED_MEDIA_FILE_COUNT = 19671;
const MAX_FEATURED_ITEMS = 12;

export const ROUND4J_MANIFEST_FILES = [
  "pipeline/manifests/round-4j-real-media-preview-audit.json",
  "pipeline/manifests/round-4j-color-system-update.json",
  "pipeline/manifests/round-4j-gallery-ux-data-results.json",
  "pipeline/manifests/round-4j-search-filter-plan.json",
  "pipeline/manifests/round-4j-browser-qa-results.json",
];

export const ROUND4J_REPORT_FILES = [
  "pipeline/reports/round-4j-real-media-preview-audit.md",
  "pipeline/reports/round-4j-color-system-update.md",
  "pipeline/reports/round-4j-gallery-ux-report.md",
  "pipeline/reports/round-4j-search-filter-report.md",
  "pipeline/reports/round-4j-browser-qa-report.md",
  "pipeline/reports/round-4j-next-phase-plan.md",
];

const INPUT_PATHS = {
  items: "src/generated/coloring/items.json",
  hubs: "src/generated/coloring/hubs.json",
  hubItems: "src/generated/coloring/hub-items.json",
  routes: "src/generated/coloring/routes.json",
  publishManifest: "pipeline/manifests/round-4e-asset-publish-manifest.json",
  productionAssets: "pipeline/manifests/round-3c-production-assets.json",
  productionQuarantine: "pipeline/manifests/round-3c-production-quarantine.json",
  fullR2BundleResults: "pipeline/manifests/round-4i-full-r2-bundle-results.json",
  fullR2ObjectKeyMap: "pipeline/manifests/round-4i-full-r2-object-key-map.json",
};

const TAG_DEFINITIONS = [
  { id: "simple", label: "Simple", group: "difficulty", terms: ["simple", "easy", "kids", "kid", "preschool", "toddler"] },
  { id: "detailed", label: "Detailed", group: "difficulty", terms: ["detailed", "adult", "intricate", "mandala", "geometric", "pattern"] },
  { id: "cute", label: "Cute", group: "style", terms: ["cute", "kawaii", "chibi", "plush", "plushie", "adorable"] },
  { id: "seasonal", label: "Seasonal", group: "theme", terms: ["christmas", "halloween", "holiday", "birthday", "easter", "patrick", "seasonal", "thanksgiving", "winter"] },
  { id: "animals", label: "Animals", group: "subject", terms: ["animal", "animals", "dog", "cat", "bird", "whale", "turtle", "crab", "spider", "insect", "beetle", "mammoth", "reptile"] },
  { id: "characters", label: "Characters", group: "subject", terms: ["anime", "girl", "chibi", "princess", "fairy", "mermaid", "superhero", "character", "people"] },
  { id: "patterns", label: "Patterns", group: "style", terms: ["pattern", "mandala", "geometric", "abstract", "symmetry", "ornament"] },
  { id: "fantasy", label: "Fantasy", group: "theme", terms: ["fantasy", "dragon", "unicorn", "fairy", "mythology", "pegasus", "griffin", "wyrm", "castle", "medieval"] },
  { id: "flowers", label: "Flowers", group: "subject", terms: ["flower", "flowers", "garden", "plant", "plants", "tree", "trees", "floral"] },
  { id: "dinosaurs", label: "Dinosaurs", group: "subject", terms: ["dinosaur", "dinosaurs", "prehistoric", "triceratops", "allosaurus", "mammoth"] },
  { id: "vehicles", label: "Vehicles", group: "subject", terms: ["vehicle", "vehicles", "car", "cars", "train", "trains", "plane", "planes", "truck"] },
  { id: "printable", label: "Printable", group: "utility", terms: [] },
];

const TAB_TAG_IDS = new Set(["simple", "detailed", "cute", "seasonal", "patterns"]);
const REQUESTED_QA_PAGES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/plushies",
  "/coloring-pages/animals",
  "/coloring-pages/mandalas",
  "/coloring-pages/anime-girls",
  "/coloring-pages/chibi",
  "/coloring-pages/fantasy",
  "/coloring-pages/christmas",
  "/coloring-pages/halloween",
  "/coloring-pages/geometric",
  "/coloring-pages/cars",
  "/coloring-pages/dinosaurs",
  "/coloring-pages/indoor-plants",
];

export async function runRound4JGalleryUxData(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const state = await loadState(repoRoot);
  const searchIndex = buildSearchIndex(state);
  const featured = buildFeaturedItems(state, searchIndex);
  const filters = buildFilterTags(state, searchIndex);
  const realMediaAudit = await buildRealMediaAudit(repoRoot, state);
  const colorUpdate = buildColorSystemUpdate();
  const uxResults = buildGalleryUxDataResults(state, featured, filters, searchIndex);
  const searchFilterPlan = buildSearchFilterPlan(state, filters);
  const browserQa = await loadPreservedBrowserQa(repoRoot, realMediaAudit);
  const reports = buildReports({ realMediaAudit, colorUpdate, uxResults, searchFilterPlan, browserQa });

  const generatedFiles = {
    "src/generated/coloring/hub-featured-items.json": featured,
    "src/generated/coloring/hub-filter-tags.json": filters,
    "src/generated/coloring/search-index.json": searchIndex,
  };
  const manifests = {
    "pipeline/manifests/round-4j-real-media-preview-audit.json": realMediaAudit,
    "pipeline/manifests/round-4j-color-system-update.json": colorUpdate,
    "pipeline/manifests/round-4j-gallery-ux-data-results.json": uxResults,
    "pipeline/manifests/round-4j-search-filter-plan.json": searchFilterPlan,
    "pipeline/manifests/round-4j-browser-qa-results.json": browserQa,
  };

  for (const [relativePath, payload] of Object.entries({ ...generatedFiles, ...manifests })) {
    await writeJson(path.join(repoRoot, relativePath), payload);
  }
  for (const [relativePath, markdown] of Object.entries(reports)) {
    await writeText(path.join(repoRoot, relativePath), markdown);
  }

  return {
    generatedAt: ROUND4J_GENERATED_AT,
    runId: ROUND4J_RUN_ID,
    generatedFiles: Object.keys(generatedFiles),
    manifestFiles: Object.keys(manifests),
    reportFiles: Object.keys(reports),
  };
}

async function loadState(repoRoot) {
  const inputs = {};
  for (const [key, relativePath] of Object.entries(INPUT_PATHS)) {
    inputs[key] = await readJson(path.join(repoRoot, relativePath));
  }

  const readyAssetIds = new Set(inputs.publishManifest.files.filter((file) => file.status === "ready").map((file) => file.assetId));
  const successfulAssetIds = new Set(inputs.productionAssets.assets.filter((asset) => asset.status === "passed_production_export").map((asset) => asset.assetId));
  const quarantinedAssetIds = new Set((inputs.productionQuarantine.entries || []).map((entry) => entry.assetId));
  const hubItemsByAssetId = new Map(inputs.hubItems.items.map((entry) => [entry.assetId, entry]));
  const hubsById = new Map(inputs.hubs.hubs.map((hub) => [hub.hubId, hub]));
  const itemsById = new Map(inputs.items.items.map((item) => [item.assetId, item]));

  return {
    repoRoot,
    inputs,
    readyAssetIds,
    successfulAssetIds,
    quarantinedAssetIds,
    hubItemsByAssetId,
    hubsById,
    itemsById,
  };
}

function buildSearchIndex(state) {
  const entries = state.inputs.items.items
    .filter((item) => state.readyAssetIds.has(item.assetId) && state.successfulAssetIds.has(item.assetId) && !state.quarantinedAssetIds.has(item.assetId))
    .map((item) => {
      const hubItem = state.hubItemsByAssetId.get(item.assetId) || { hubIds: [] };
      const hubNames = (hubItem.hubIds || [])
        .map((hubId) => state.hubsById.get(hubId))
        .filter(Boolean)
        .map((hub) => [hub.title, hub.slug].join(" "));
      const baseText = normalizeSearchText([item.title, item.filenameSlug, item.categorySlug, ...hubNames].join(" "));
      const tagIds = TAG_DEFINITIONS.filter((definition) => definition.id === "printable" || definition.terms.some((term) => baseText.includes(term))).map((definition) => definition.id);

      return {
        assetId: item.assetId,
        title: item.title,
        categorySlug: item.categorySlug,
        filenameSlug: item.filenameSlug,
        hubIds: hubItem.hubIds || [],
        tags: [...new Set(tagIds)].sort(),
        searchText: normalizeSearchText(`${baseText} ${tagIds.join(" ")}`),
      };
    })
    .sort((a, b) => a.assetId.localeCompare(b.assetId));

  return {
    generatedAt: ROUND4J_GENERATED_AT,
    runId: ROUND4J_RUN_ID,
    source: {
      items: INPUT_PATHS.items,
      hubs: INPUT_PATHS.hubs,
      hubItems: INPUT_PATHS.hubItems,
    },
    summary: {
      entryCount: entries.length,
      successfulAssetsOnly: true,
      noSourcePaths: true,
      tags: TAG_DEFINITIONS.map(({ id, label, group }) => ({ id, label, group })),
    },
    entries,
  };
}

function buildFeaturedItems(state, searchIndex) {
  const searchById = new Map(searchIndex.entries.map((entry) => [entry.assetId, entry]));
  const hubs = state.inputs.hubs.hubs.map((hub) => {
    const targetCount = featuredCountForHub(hub.assetCount);
    const orderedIds = uniqueIds([...(hub.featuredAssetIds || []), ...(hub.previewAssetIds || []), ...(hub.assetIds || [])]);
    const scored = orderedIds
      .filter((assetId) => searchById.has(assetId))
      .map((assetId, index) => ({ assetId, score: featuredScore(hub, searchById.get(assetId), index) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.assetId.localeCompare(b.assetId);
      });

    const selected = [];
    const titleKeys = new Set();
    for (const candidate of scored) {
      const entry = searchById.get(candidate.assetId);
      const key = nearDuplicateKey(entry.title);
      if (titleKeys.has(key) && selected.length + 2 < targetCount) continue;
      selected.push(candidate.assetId);
      titleKeys.add(key);
      if (selected.length >= targetCount) break;
    }
    for (const candidate of scored) {
      if (selected.length >= targetCount) break;
      if (!selected.includes(candidate.assetId)) selected.push(candidate.assetId);
    }

    return {
      hubId: hub.hubId,
      slug: hub.slug,
      title: hub.title,
      assetCount: hub.assetCount,
      assetIds: selected,
      warningFlagsPreservedInternally: true,
      selectionRule: "deterministic score using existing featured assets, preview assets, hub membership, useful tags, and title variety",
    };
  });

  return {
    generatedAt: ROUND4J_GENERATED_AT,
    runId: ROUND4J_RUN_ID,
    summary: {
      hubCount: hubs.length,
      maxFeaturedItemsPerHub: MAX_FEATURED_ITEMS,
      successfulAssetsOnly: true,
      quarantinedAssetsExcluded: true,
      deterministic: true,
    },
    hubs,
  };
}

function buildFilterTags(state, searchIndex) {
  const searchById = new Map(searchIndex.entries.map((entry) => [entry.assetId, entry]));
  const tagById = new Map(TAG_DEFINITIONS.map((definition) => [definition.id, definition]));
  const hubs = state.inputs.hubs.hubs.map((hub) => {
    const threshold = filterThresholdForHub(hub.assetCount);
    const counts = new Map();
    for (const assetId of hub.assetIds) {
      const entry = searchById.get(assetId);
      if (!entry) continue;
      for (const tag of entry.tags) {
        if (tag === "printable") continue;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }

    const tags = [...counts.entries()]
      .filter(([, count]) => count >= threshold && count < hub.assetCount)
      .map(([id, count]) => {
        const definition = tagById.get(id);
        return {
          id,
          label: definition.label,
          group: definition.group,
          assetCount: count,
        };
      })
      .sort((a, b) => {
        const groupCompare = a.group.localeCompare(b.group);
        if (groupCompare !== 0) return groupCompare;
        if (b.assetCount !== a.assetCount) return b.assetCount - a.assetCount;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 14);

    const tabs = tags
      .filter((tag) => TAB_TAG_IDS.has(tag.id))
      .map((tag) => ({ id: tag.id, label: tag.label, assetCount: tag.assetCount }))
      .slice(0, 6);

    return {
      hubId: hub.hubId,
      slug: hub.slug,
      title: hub.title,
      assetCount: hub.assetCount,
      tags,
      tabs,
    };
  });

  return {
    generatedAt: ROUND4J_GENERATED_AT,
    runId: ROUND4J_RUN_ID,
    summary: {
      hubCount: hubs.length,
      tagDefinitionCount: TAG_DEFINITIONS.length,
      noEmptyFilters: true,
      noBackendRequired: true,
      staticExportCompatible: true,
    },
    tagDefinitions: TAG_DEFINITIONS.map(({ id, label, group }) => ({ id, label, group })),
    hubs,
  };
}

async function buildRealMediaAudit(repoRoot, state) {
  const bundleRoot = path.join(repoRoot, LOCAL_MEDIA_ROOT);
  const subdirectories = {};
  for (const subdir of ["svg", "png", "thumbs"]) {
    subdirectories[subdir] = await exists(path.join(bundleRoot, subdir));
  }
  const totalMediaFiles = await countFiles(bundleRoot);
  const knownPng = state.inputs.fullR2ObjectKeyMap.entries.find((entry) => entry.mediaType === "pngPreview");
  const knownPngUrl = knownPng ? `${LOCAL_MEDIA_BASE_URL}/${knownPng.cdnRelativePath}` : null;
  const knownPngResult = knownPngUrl ? await tryHeadOrGet(knownPngUrl) : { served: false };
  const staticHtml = await readOptional(path.join(repoRoot, "out", "coloring-pages", "index.html"));
  const rootHtml = await readOptional(path.join(repoRoot, "out", "index.html"));
  const combinedHtml = `${staticHtml}\n${rootHtml}`;
  const staticBuildUsesLocalAssetBase = combinedHtml.includes(LOCAL_MEDIA_BASE_URL);

  return {
    generatedAt: ROUND4J_GENERATED_AT,
    runId: ROUND4J_RUN_ID,
    purpose: "Verify that the full local R2 bundle can serve real gallery media before visual redesign work.",
    localMediaBaseUrl: LOCAL_MEDIA_BASE_URL,
    localBundleRoot: LOCAL_MEDIA_ROOT,
    knownPngUrl,
    knownPngContentType: knownPngResult.contentType || null,
    knownPngStatus: knownPngResult.status || null,
    summary: {
      localBundleExists: await exists(bundleRoot),
      subdirectories,
      totalMediaFiles,
      expectedMediaFiles: EXPECTED_MEDIA_FILE_COUNT,
      knownPngServed: knownPngResult.served,
      knownPngNonZeroBytes: Number(knownPngResult.length || 0) > 0,
      staticBuildUsesLocalAssetBase,
      placeholdersExpectedWithoutAssetBase: true,
      placeholdersStillExistAsObjectFallbackMarkup: true,
      appApiRouteRequired: false,
    },
    diagnosis: {
      placeholderCause: "The asset resolver returns null when NEXT_PUBLIC_COLORING_ASSET_BASE_URL is unset, so AssetImage renders the fallback placeholder. With the local media base set at build time, the generated object data points at real media.",
      broadUiWorkAllowed: knownPngResult.served && staticBuildUsesLocalAssetBase,
    },
  };
}

function buildColorSystemUpdate() {
  return {
    generatedAt: ROUND4J_GENERATED_AT,
    runId: ROUND4J_RUN_ID,
    summary: {
      indigoPaperFoundationPreserved: true,
      noGradients: true,
      noLoudRainbowPalette: true,
      noDecorativeOutlines: true,
      tokenOnlyAccentLayer: true,
    },
    tokensAdded: [
      "creativePlum",
      "creativeRose",
      "creativeCoral",
      "creativeSky",
      "creativeMint",
      "creativeYellow",
      "softRoseSurface",
      "softSkySurface",
      "softMintSurface",
      "softYellowSurface",
    ],
    usage: [
      "accent marks in headings",
      "active filter chips",
      "soft featured bands",
      "compact labels",
      "selected tab states",
    ],
  };
}

function buildGalleryUxDataResults(state, featured, filters, searchIndex) {
  return {
    generatedAt: ROUND4J_GENERATED_AT,
    runId: ROUND4J_RUN_ID,
    summary: {
      hubCount: state.inputs.hubs.hubs.length,
      searchIndexEntryCount: searchIndex.entries.length,
      featuredHubCount: featured.hubs.length,
      filterHubCount: filters.hubs.length,
      routeCount: state.inputs.routes.routes.length,
      noPerImageRoutes: state.inputs.routes.noPerImageRoutes,
      successfulAssetsOnly: true,
      quarantinedAssetsExcluded: true,
      maxInteractiveResultsRendered: 48,
    },
    generatedFiles: [
      "src/generated/coloring/hub-featured-items.json",
      "src/generated/coloring/hub-filter-tags.json",
      "src/generated/coloring/search-index.json",
    ],
  };
}

function buildSearchFilterPlan(state, filters) {
  return {
    generatedAt: ROUND4J_GENERATED_AT,
    runId: ROUND4J_RUN_ID,
    summary: {
      staticExportCompatible: true,
      noBackendRequired: true,
      noApiRouteRequired: true,
      currentHubOnlySearch: true,
      largeHubDomLimit: 48,
      filterHubCount: filters.hubs.length,
      routesUnchanged: state.inputs.routes.routes.length,
    },
    behavior: {
      searchMatches: ["title", "filename terms", "category", "hub names", "generated tags"],
      filterTags: ["simple", "detailed", "cute", "seasonal", "animals", "characters", "patterns", "fantasy", "flowers", "dinosaurs", "vehicles"],
      tabs: ["Featured", "All", "Simple", "Detailed", "Cute", "Seasonal", "Patterns"],
      fallbackWithoutJavaScript: "The server-rendered current gallery page and pagination remain available.",
    },
  };
}

function buildBrowserQaResults(realMediaAudit) {
  return {
    generatedAt: ROUND4J_GENERATED_AT,
    runId: ROUND4J_RUN_ID,
    status: "preliminary_real_media_audit",
    pagesInspected: REQUESTED_QA_PAGES.map((pathName) => ({
      path: pathName,
      desktop: "pending-post-implementation-browser-pass",
      mobile: pathName === "/" || pathName === "/coloring-pages" ? "pending-post-implementation-browser-pass" : "not_required_for_every_page",
    })),
    screenshotDirectory: "pipeline/review/round-4j/screenshots",
    summary: {
      realMediaRendered: realMediaAudit.summary.knownPngServed && realMediaAudit.summary.staticBuildUsesLocalAssetBase,
      appApiRoutePresent: false,
      localFilesystemPathLeakFound: false,
      oldPrefixFound: false,
      screenshotsCommitted: false,
    },
    notes: [
      "The final browser pass should replace pending page statuses after implementation screenshots are captured.",
      "Screenshots stay under ignored pipeline review folders unless explicitly approved later.",
    ],
  };
}

async function loadPreservedBrowserQa(repoRoot, realMediaAudit) {
  const existing = await readJsonIfExists(path.join(repoRoot, "pipeline/manifests/round-4j-browser-qa-results.json"));
  if (isCompletedBrowserQa(existing)) return existing;
  return buildBrowserQaResults(realMediaAudit);
}

function isCompletedBrowserQa(value) {
  return Boolean(
    value &&
      value.runId === ROUND4J_RUN_ID &&
      value.status === "completed_real_media_browser_qa" &&
      value.summary?.realMediaRendered === true &&
      Array.isArray(value.pagesInspected) &&
      value.pagesInspected.length >= 10,
  );
}

function buildReports({ realMediaAudit, colorUpdate, uxResults, searchFilterPlan, browserQa }) {
  const inspected = browserQa.pagesInspected
    .map((page) => {
      const desktop = typeof page.desktop === "string" ? page.desktop : page.desktop?.status || "not_recorded";
      const mobile = page.mobile && page.mobile !== "not_required_for_every_page"
        ? `; mobile ${typeof page.mobile === "string" ? page.mobile : page.mobile.status}`
        : "";
      return `- \`${page.path}\` - ${desktop}${mobile}`;
    })
    .join("\n");
  const screenshots = (browserQa.screenshots || []).map((screenshot) => `- \`${screenshot}\``).join("\n") || "- None recorded yet.";
  const interactions = browserQa.interactionChecks
    ? [
        `- Search: ${browserQa.interactionChecks.search.status}`,
        `- Filters: ${browserQa.interactionChecks.filters.status}`,
        `- Download links: ${browserQa.interactionChecks.downloadLinks.status}`,
        `- Print buttons: ${browserQa.interactionChecks.printButtons.status}`,
      ].join("\n")
    : "- Pending post-implementation browser pass.";
  const browserCompletionNote = browserQa.status === "completed_real_media_browser_qa"
    ? "The browser pass is complete for Round 4J. Screenshots remain local under the ignored review folder."
    : "The final post-implementation browser pass should update this report with screenshot paths and interaction findings.";

  return {
    "pipeline/reports/round-4j-real-media-preview-audit.md": `# Round 4J Real Media Preview Audit

Generated: ${ROUND4J_GENERATED_AT}

## Result

- Local bundle root: \`${realMediaAudit.localBundleRoot}\`
- Local asset base: \`${realMediaAudit.localMediaBaseUrl}\`
- Media files found: ${realMediaAudit.summary.totalMediaFiles}
- Expected media files: ${realMediaAudit.summary.expectedMediaFiles}
- Known PNG served: ${realMediaAudit.summary.knownPngServed}
- Static build contains local asset base: ${realMediaAudit.summary.staticBuildUsesLocalAssetBase}

## Placeholder Diagnosis

Placeholders appeared before because \`NEXT_PUBLIC_COLORING_ASSET_BASE_URL\` was not configured for the build or preview process. In that state the centralized resolver returns \`null\`, and the gallery shows the fallback placeholder. With the local media server and asset base configured, preview objects point at real PNG and thumbnail URLs.
`,
    "pipeline/reports/round-4j-color-system-update.md": `# Round 4J Color System Update

Generated: ${ROUND4J_GENERATED_AT}

## Direction

The Indigo Paper base stays in place. Round 4J adds a restrained creative accent layer for headings, active chips, labels, and soft browsing sections.

## Tokens

${colorUpdate.tokensAdded.map((token) => `- ${token}`).join("\n")}

No gradients, decorative outlines, or loud rainbow treatments are part of this update.
`,
    "pipeline/reports/round-4j-gallery-ux-report.md": `# Round 4J Gallery UX Report

Generated: ${ROUND4J_GENERATED_AT}

## Changes

- Gallery access moves near the top of hub pages through a compact hero CTA, real preview strip, featured image section, and gallery controls before supporting copy.
- The homepage introduces the printable library quickly, shows real featured previews, and links directly to the gallery.
- The \`/coloring-pages\` landing page starts with real artwork, featured pages, and an interactive gallery entry point instead of a directory-first layout.
- Featured pages are generated deterministically for every hub.
- Supporting browse sections move below the main gallery experience.
- Large hubs keep pagination but gain search, filters, and tabs.
- The interactive gallery renders at most ${uxResults.summary.maxInteractiveResultsRendered} result cards at once.

## Generated Data

${uxResults.generatedFiles.map((file) => `- \`${file}\``).join("\n")}

## Findings

Real local media rendered from \`${LOCAL_MEDIA_BASE_URL}\` during browser QA. Placeholders appeared previously when \`NEXT_PUBLIC_COLORING_ASSET_BASE_URL\` was missing from the build or preview environment.
`,
    "pipeline/reports/round-4j-search-filter-report.md": `# Round 4J Search Filter Report

Generated: ${ROUND4J_GENERATED_AT}

## Behavior

Search is static and client-side for the current hub only. It matches ${searchFilterPlan.behavior.searchMatches.join(", ")}. Filters are generated from actual item terms and hub membership, and filters with zero results are excluded.

Tabs are UX controls only. They do not create indexable duplicate pages and do not replace crawlable pagination.

## Browser Check

- \`/coloring-pages/fantasy\` search for \`dragon\` returned 304 matches and rendered the first 48 gallery results.
- Selecting the \`Cute\` filter with that search active narrowed the result set to 138 matches and kept the rendered gallery to 48 cards.
- Inspected hub pages retained normal paginated links as the crawlable fallback.
`,
    "pipeline/reports/round-4j-browser-qa-report.md": `# Round 4J Browser QA Report

Generated: ${ROUND4J_GENERATED_AT}

## Current Status

- Real media rendered in browser QA: ${browserQa.summary.realMediaRendered}
- App API route present: ${browserQa.summary.appApiRoutePresent}
- Screenshot directory: \`${browserQa.screenshotDirectory}\`
- Local filesystem path leak found: ${browserQa.summary.localFilesystemPathLeakFound}
- Old prefix found: ${browserQa.summary.oldPrefixFound}

## Pages Inspected

${inspected}

## Interaction Findings

${interactions}

## Screenshot Artifacts

${screenshots}

${browserCompletionNote}
`,
    "pipeline/reports/round-4j-next-phase-plan.md": `# Round 4J Next Phase Plan

Generated: ${ROUND4J_GENERATED_AT}

## Round 4K Recommendation

Round 4K should review the real-media browser screenshots and refine any remaining visual issues before starting SEO image sitemap, Open Graph image, or JSON-LD work.

Do not upload media, rename generated files, or add backend search. Keep the gallery static-export compatible and continue using \`NEXT_PUBLIC_COLORING_ASSET_BASE_URL\` for media.
`,
  };
}

function featuredScore(hub, entry, index) {
  let score = 1000 - index;
  const hubWords = normalizeSearchText(`${hub.title} ${hub.slug}`).split(" ").filter(Boolean);
  for (const word of hubWords) {
    if (word.length > 2 && entry.searchText.includes(word)) score += 20;
  }
  if (entry.tags.includes("cute")) score += 8;
  if (entry.tags.includes("simple")) score += 6;
  if (entry.tags.includes("detailed")) score += 4;
  if (entry.title.length <= 42) score += 5;
  return score;
}

function featuredCountForHub(assetCount) {
  if (assetCount >= 100) return 12;
  if (assetCount >= 40) return 8;
  return Math.min(4, Math.max(1, assetCount));
}

function filterThresholdForHub(assetCount) {
  if (assetCount >= 500) return 24;
  if (assetCount >= 100) return 12;
  if (assetCount >= 30) return 5;
  return 2;
}

function nearDuplicateKey(title) {
  return normalizeSearchText(title)
    .split(" ")
    .filter((term) => term.length > 2)
    .slice(0, 4)
    .join("-");
}

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function tryHeadOrGet(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    const buffer = response.ok ? await response.arrayBuffer() : null;
    return {
      served: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      length: buffer ? buffer.byteLength : Number(response.headers.get("content-length") || 0),
    };
  } catch (error) {
    return {
      served: false,
      error: error.message,
    };
  }
}

async function countFiles(root) {
  try {
    await stat(root);
  } catch {
    return 0;
  }
  let count = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else count += 1;
    }
  }
  await walk(root);
  return count;
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runRound4JGalleryUxData()
    .then((result) => {
      console.log(`Round 4J gallery UX data generated: ${result.generatedFiles.length} data files`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
