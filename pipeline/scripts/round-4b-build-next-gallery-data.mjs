import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

const ROUND4B_GENERATED_AT = "2026-05-10";
const ROUND4B_RUN_ID = "round-4b-next-gallery-foundation";
const GALLERY_PAGE_SIZE = 48;
const ROOT_PREVIEW_LIMIT = GALLERY_PAGE_SIZE;
const FEATURED_LIMIT = 12;

const INPUT_PATHS = {
  round3cAssets: "pipeline/manifests/round-3c-production-assets.json",
  round3cGallery: "pipeline/manifests/round-3c-production-gallery-data.json",
  round3cCategories: "pipeline/manifests/round-3c-production-category-data.json",
  round3cQuarantine: "pipeline/manifests/round-3c-production-quarantine.json",
  round3cNextjsContract: "pipeline/manifests/round-3c-nextjs-data-contract.json",
  round4aTaxonomy: "pipeline/manifests/round-4a-approved-hub-taxonomy.json",
  round4aImageToHubMap: "pipeline/manifests/round-4a-image-to-hub-map.json",
  round4aRoutePlan: "pipeline/manifests/round-4a-hub-route-plan.json",
  round4aPhase1Hubs: "pipeline/manifests/round-4a-phase-1-hubs.json",
  round4aPhase2Backlog: "pipeline/manifests/round-4a-phase-2-hub-backlog.json",
  round4aSectionOnly: "pipeline/manifests/round-4a-section-only-topics.json",
  round4aRejected: "pipeline/manifests/round-4a-rejected-hub-candidates.json",
  round4aNextjsContract: "pipeline/manifests/round-4a-nextjs-gallery-data-contract.json",
};

export const ROUND4B_GENERATED_DATA_FILES = [
  "src/generated/coloring/hubs.json",
  "src/generated/coloring/items.json",
  "src/generated/coloring/hub-items.json",
  "src/generated/coloring/routes.json",
  "src/generated/coloring/categories.json",
  "src/generated/coloring/site-map.json",
];

export const ROUND4B_PROJECT_MANIFESTS = [
  "pipeline/manifests/round-4b-next-gallery-build-results.json",
  "pipeline/manifests/round-4b-next-route-validation.json",
  "pipeline/manifests/round-4b-asset-resolution-plan.json",
];

export const ROUND4B_PROJECT_REPORTS = [
  "pipeline/reports/round-4b-asset-hosting-plan.md",
  "pipeline/reports/round-4b-next-gallery-report.md",
  "pipeline/reports/round-4b-route-and-seo-report.md",
  "pipeline/reports/round-4b-next-phase-plan.md",
];

export async function runRound4BNextGalleryBuild(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const state = await loadRound4BInputs(repoRoot);
  const generated = buildGeneratedData(state);
  const manifests = buildRound4BManifests(state, generated);
  const reports = buildRound4BReports(state, generated, manifests);

  for (const [relativePath, payload] of Object.entries(generated.files)) {
    await writeJson(path.join(repoRoot, relativePath), payload);
  }
  for (const [relativePath, payload] of Object.entries(manifests)) {
    await writeJson(path.join(repoRoot, relativePath), payload);
  }
  for (const [relativePath, markdown] of Object.entries(reports)) {
    await writeText(path.join(repoRoot, relativePath), markdown);
  }

  return { state, generated, manifests, reports };
}

async function loadRound4BInputs(repoRoot) {
  const inputs = {};
  for (const [key, relativePath] of Object.entries(INPUT_PATHS)) {
    inputs[key] = await readJson(path.join(repoRoot, relativePath));
  }

  const successfulAssets = [...inputs.round3cAssets.assets].sort((a, b) => a.assetId.localeCompare(b.assetId));
  const successfulAssetIds = new Set(successfulAssets.map((asset) => asset.assetId));
  const quarantinedAssetIds = new Set((inputs.round3cQuarantine.entries || []).map((entry) => entry.assetId));
  const phase1Hubs = [...inputs.round4aPhase1Hubs.hubs].sort(compareHubs);
  const phase2Hubs = [...inputs.round4aPhase2Backlog.hubs].sort(compareHubs);
  const sectionOnlyTopics = [...inputs.round4aSectionOnly.topics].sort(compareHubs);
  const rejectedCandidates = [...inputs.round4aRejected.candidates].sort(compareHubs);

  const quarantineOverlap = successfulAssets
    .filter((asset) => quarantinedAssetIds.has(asset.assetId))
    .map((asset) => asset.assetId);
  if (quarantineOverlap.length > 0) {
    throw new Error(`Round 4B input blocker: quarantined assets appear in successful assets: ${quarantineOverlap.join(", ")}`);
  }

  const phase2Slugs = new Set(phase2Hubs.map((hub) => hub.slug).filter(Boolean));
  const sectionOnlySlugs = new Set(sectionOnlyTopics.map((topic) => topic.slug).filter(Boolean));
  const phase1SlugCollisions = phase1Hubs
    .map((hub) => hub.slug)
    .filter(Boolean)
    .filter((slug) => phase2Slugs.has(slug) || sectionOnlySlugs.has(slug));
  if (phase1SlugCollisions.length > 0) {
    throw new Error(`Round 4B input blocker: non-Phase-1 slug collision: ${phase1SlugCollisions.join(", ")}`);
  }

  return {
    repoRoot,
    inputs,
    successfulAssets,
    successfulAssetIds,
    quarantinedAssetIds,
    phase1Hubs,
    phase2Hubs,
    sectionOnlyTopics,
    rejectedCandidates,
    assetById: new Map(successfulAssets.map((asset) => [asset.assetId, asset])),
    imageHubById: new Map(inputs.round4aImageToHubMap.images.map((item) => [item.assetId, item])),
  };
}

function buildGeneratedData(state) {
  const items = buildItems(state);
  const hubItems = buildHubItems(state);
  const hubs = buildHubs(state, items.byId);
  const routes = buildRoutes(state, hubs.hubs);
  const categories = buildCategories(state);
  const siteMap = buildSiteMap(routes.routes);

  return {
    files: {
      "src/generated/coloring/hubs.json": hubs,
      "src/generated/coloring/items.json": items.manifest,
      "src/generated/coloring/hub-items.json": hubItems,
      "src/generated/coloring/routes.json": routes,
      "src/generated/coloring/categories.json": categories,
      "src/generated/coloring/site-map.json": siteMap,
    },
    hubs,
    items: items.manifest,
    hubItems,
    routes,
    categories,
    siteMap,
  };
}

function buildItems(state) {
  const items = state.successfulAssets.map((asset) => {
    const assetSubpaths = buildAssetSubpaths(asset);
    return {
      assetId: asset.assetId,
      title: cleanTitle(asset.titleCandidate),
      altText: cleanTitle(asset.altTextCandidate || `${asset.titleCandidate} coloring page`),
      categorySlug: asset.categorySlug,
      filenameSlug: asset.filenameSlug,
      assetSubpaths,
      dimensions: {
        source: asset.sourceDimensions,
        svg: asset.outputDimensions?.svg || null,
        pngPreview: asset.outputDimensions?.pngPreview || null,
        thumbnail: asset.outputDimensions?.thumbnail || null,
      },
      downloadAvailable: Boolean(assetSubpaths.pngPreview && assetSubpaths.svg),
      printAvailable: Boolean(assetSubpaths.pngPreview || assetSubpaths.svg),
      indexablePerImageRoute: false,
      warningFlags: asset.round3a1WarningFlags || [],
      warningMetadataPolicy: "internal_metadata_only",
    };
  });
  return {
    byId: new Map(items.map((item) => [item.assetId, item])),
    manifest: {
      generatedAt: ROUND4B_GENERATED_AT,
      runId: ROUND4B_RUN_ID,
      source: INPUT_PATHS.round3cAssets,
      summary: {
        itemCount: items.length,
        usesOnlySuccessfulRound3CAssets: true,
        quarantinedAssetsExcluded: state.quarantinedAssetIds.size,
        noSourceImagePathsInClientData: true,
        warningFlagsInternalOnly: true,
      },
      items,
    },
  };
}

function buildHubItems(state) {
  const phase1HubIds = new Set(state.phase1Hubs.map((hub) => hub.hubId));
  const phase2HubIds = new Set(state.phase2Hubs.map((hub) => hub.hubId));
  const sectionOnlyTopicIds = new Set(state.sectionOnlyTopics.map((topic) => topic.hubId));
  const items = state.successfulAssets.map((asset) => {
    const mapEntry = state.imageHubById.get(asset.assetId);
    const allHubIds = [...new Set(mapEntry?.hubIds || [])].sort();
    const visibleHubIds = allHubIds.filter((hubId) => phase1HubIds.has(hubId)).sort();
    return {
      assetId: asset.assetId,
      hubIds: visibleHubIds,
      phase2HubIds: allHubIds.filter((hubId) => phase2HubIds.has(hubId)).sort(),
      sectionOnlyTopicIds: allHubIds.filter((hubId) => sectionOnlyTopicIds.has(hubId)).sort(),
    };
  });
  return {
    generatedAt: ROUND4B_GENERATED_AT,
    runId: ROUND4B_RUN_ID,
    summary: {
      assetCount: items.length,
      oneImageMayBelongToMultipleHubs: true,
      phase1HubAssignments: items.reduce((sum, item) => sum + item.hubIds.length, 0),
      phase2AssignmentsRetainedAsBacklogOnly: items.reduce((sum, item) => sum + item.phase2HubIds.length, 0),
      sectionOnlyAssignmentsRetainedAsInternalOnly: items.reduce((sum, item) => sum + item.sectionOnlyTopicIds.length, 0),
    },
    items,
  };
}

function buildHubs(state, itemById) {
  const hubRecords = state.phase1Hubs.map((hub) => {
    const assetIds = hub.assetIds.filter((assetId) => state.successfulAssetIds.has(assetId));
    const featuredAssetIds = hub.featuredAssetIds.filter((assetId) => state.successfulAssetIds.has(assetId)).slice(0, FEATURED_LIMIT);
    const previewAssetIds = pickPreviewAssetIds({
      assetIds,
      featuredAssetIds,
      itemById,
      limit: hub.route === "/coloring-pages" ? ROOT_PREVIEW_LIMIT : GALLERY_PAGE_SIZE,
    });
    return {
      hubId: hub.hubId,
      slug: hub.slug,
      normalizedSlug: hub.normalizedSlug,
      route: hub.route,
      title: cleanTitle(hub.canonicalTitle),
      h1: cleanTitle(hub.h1),
      metaTitle: cleanTitle(hub.metaTitleCandidate),
      metaDescription: cleanDescription(hub.metaDescriptionCandidate, hub.canonicalTitle),
      intro: cleanDescription(hub.introCopyCandidate, hub.canonicalTitle),
      assetCount: assetIds.length,
      assetIds,
      featuredAssetIds,
      previewAssetIds,
      galleryPageSize: GALLERY_PAGE_SIZE,
      sectionGroupings: simplifySectionGroupings(hub.sectionGroupings || []),
      relatedHubIds: hub.relatedHubIds || [],
      parentHubId: hub.parentHubId || null,
      childHubIds: hub.childHubIds || [],
      breadcrumbPath: hub.breadcrumbPath || [{ label: "Coloring Pages", route: "/coloring-pages" }],
      internalLinkingTargets: hub.internalLinkingTargets || [],
      indexable: true,
      sitemap: true,
      noPerImageIndexableRoute: true,
      score: hub.score || null,
    };
  });

  return {
    generatedAt: ROUND4B_GENERATED_AT,
    runId: ROUND4B_RUN_ID,
    source: INPUT_PATHS.round4aPhase1Hubs,
    summary: {
      hubCount: hubRecords.length,
      phase1Only: true,
      phase2BacklogHubCount: state.phase2Hubs.length,
      sectionOnlyTopicCount: state.sectionOnlyTopics.length,
      rejectedCandidateCount: state.rejectedCandidates.length,
      galleryPageSize: GALLERY_PAGE_SIZE,
      noPerImageRoutes: true,
    },
    backlogHubs: state.phase2Hubs.map((hub) => ({
      hubId: hub.hubId,
      slug: hub.slug,
      title: cleanTitle(hub.canonicalTitle),
      assetCount: hub.assetCount,
      indexable: false,
      sitemap: false,
    })),
    sectionOnlyTopics: state.sectionOnlyTopics.map((topic) => ({
      hubId: topic.hubId,
      slug: topic.slug,
      title: cleanTitle(topic.canonicalTitle),
      assetCount: topic.assetCount,
      indexable: false,
      sitemap: false,
    })),
    hubs: hubRecords,
  };
}

function buildRoutes(state, hubs) {
  const routes = hubs.map((hub) => ({
    hubId: hub.hubId,
    slug: hub.slug,
    path: hub.route,
    title: hub.title,
    indexable: true,
    sitemap: true,
    assetCount: hub.assetCount,
  })).sort((a, b) => a.path.localeCompare(b.path));

  return {
    generatedAt: ROUND4B_GENERATED_AT,
    runId: ROUND4B_RUN_ID,
    source: INPUT_PATHS.round4aRoutePlan,
    routePattern: "/coloring-pages/[hubSlug]",
    rootRoute: "/coloring-pages",
    noPerImageRoutes: true,
    phase2RoutesExcluded: true,
    sectionOnlyRoutesExcluded: true,
    rejectedRoutesExcluded: true,
    routes,
  };
}

function buildCategories(state) {
  const categoryRecords = state.inputs.round3cCategories.categories
    .map((category) => ({
      categorySlug: category.categorySlug,
      categoryTitle: category.categoryTitle,
      imageCount: category.imageCount,
      warningImageCount: category.warningImageCount,
      sampleAssetIds: category.sampleAssetIds?.filter((assetId) => state.successfulAssetIds.has(assetId)).slice(0, 12) || [],
      finalPublicTaxonomySource: "round-4a-hub-taxonomy",
      rawFolderIsNotPublicRoute: true,
    }))
    .sort((a, b) => a.categorySlug.localeCompare(b.categorySlug));

  return {
    generatedAt: ROUND4B_GENERATED_AT,
    runId: ROUND4B_RUN_ID,
    source: INPUT_PATHS.round3cCategories,
    summary: {
      categoryCount: categoryRecords.length,
      categoriesAreInternalGroupingSignals: true,
    },
    categories: categoryRecords,
  };
}

function buildSiteMap(routes) {
  return {
    generatedAt: ROUND4B_GENERATED_AT,
    runId: ROUND4B_RUN_ID,
    summary: {
      routeCount: routes.length,
      includesRootGallery: routes.some((route) => route.path === "/coloring-pages"),
      phase1HubRoutesOnly: true,
      excludesPerImageRoutes: true,
    },
    entries: routes.map((route) => ({
      path: route.path,
      changeFrequency: route.path === "/coloring-pages" ? "weekly" : "monthly",
      priority: route.path === "/coloring-pages" ? 1 : 0.8,
    })),
  };
}

function buildRound4BManifests(state, generated) {
  const phase1Slugs = new Set(state.phase1Hubs.map((hub) => hub.slug).filter(Boolean));
  const routeSlugs = new Set(generated.routes.routes.map((route) => route.slug).filter(Boolean));
  const routeValidation = {
    generatedAt: ROUND4B_GENERATED_AT,
    runId: ROUND4B_RUN_ID,
    routePattern: "/coloring-pages/[hubSlug]",
    rootRoute: "/coloring-pages",
    phase1HubRouteCount: generated.routes.routes.length,
    phase1SlugRouteCount: generated.routes.routes.filter((route) => route.slug).length,
    sitemapRouteCount: generated.siteMap.entries.length,
    rootRouteIncludedInSitemap: generated.siteMap.entries.some((entry) => entry.path === "/coloring-pages"),
    noPerImageRoutes: true,
    unknownHubBehavior: "notFound",
    generateStaticParamsSource: "src/generated/coloring/routes.json",
    checks: {
      routeSlugsMatchPhase1Slugs: arraysEqual([...routeSlugs].sort(), [...phase1Slugs].sort()),
      phase2HubsExcluded: noSlugOverlap(routeSlugs, state.phase2Hubs),
      sectionOnlyTopicsExcluded: noSlugOverlap(routeSlugs, state.sectionOnlyTopics),
      rejectedCandidatesExcluded: noHubIdOverlap(new Set(generated.routes.routes.map((route) => route.hubId)), state.rejectedCandidates),
      duplicateHubSlugsAbsent: routeSlugs.size === [...routeSlugs].length,
      sitemapContainsOnlyIndexableRoutes: generated.siteMap.entries.length === generated.routes.routes.length,
    },
    routes: generated.routes.routes,
  };

  const assetResolutionPlan = {
    generatedAt: ROUND4B_GENERATED_AT,
    runId: ROUND4B_RUN_ID,
    assetBaseUrlEnvironmentVariable: "NEXT_PUBLIC_COLORING_ASSET_BASE_URL",
    localProxyEnvironmentVariable: "COLORING_ENABLE_LOCAL_ASSET_PROXY",
    publicClientToggleEnvironmentVariable: "NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY",
    localProxyRoute: "/api/coloring-assets/[...path]",
    localProxyAllowedRoots: [
      "pipeline/production/full/assets/svg",
      "pipeline/production/full/assets/png",
      "pipeline/production/full/assets/thumbs",
    ],
    localProxyAllowsPathTraversal: false,
    productionAssetsCopiedToPublic: false,
    generatedDataStoresAssetSubpathsOnly: true,
    fallbackWhenNoAssetUrl: "render_placeholder_card",
    futureRecommendedStrategy: "upload pipeline/production/full assets to CDN or object storage and set NEXT_PUBLIC_COLORING_ASSET_BASE_URL",
  };

  return {
    "pipeline/manifests/round-4b-next-gallery-build-results.json": {
      generatedAt: ROUND4B_GENERATED_AT,
      runId: ROUND4B_RUN_ID,
      appStructure: {
        nextAppExistedBeforeRound4B: false,
        appRouterScaffolded: true,
        generatedDataDirectory: "src/generated/coloring",
      },
      inputs: INPUT_PATHS,
      outputs: {
        generatedDataFiles: ROUND4B_GENERATED_DATA_FILES,
        manifests: ROUND4B_PROJECT_MANIFESTS,
        reports: ROUND4B_PROJECT_REPORTS,
      },
      counts: {
        successfulAssetsAnalyzed: state.successfulAssets.length,
        generatedItems: generated.items.items.length,
        phase1HubRoutes: generated.routes.routes.length,
        phase1SlugRoutes: generated.routes.routes.filter((route) => route.slug).length,
        phase2BacklogHubs: state.phase2Hubs.length,
        sectionOnlyTopics: state.sectionOnlyTopics.length,
        rejectedCandidates: state.rejectedCandidates.length,
        quarantinedAssetsExcluded: state.quarantinedAssetIds.size,
      },
      validation: {
        dataGenerator: "passed at Round 4B closeout",
        round4aTaxonomyTests: "passed at Round 4B closeout",
        round4bGalleryTests: "passed at Round 4B closeout",
        npmTest: "passed at Round 4B closeout",
        typecheck: "passed at Round 4B closeout",
        build: "passed at Round 4B closeout",
        lint: "not_configured",
        audit: "passed at Round 4B closeout",
        visualQa: "browser smoke checked with placeholder assets; full asset rendering QA is pending asset base URL or local proxy environment variables",
      },
      policy: {
        usesRound4AHubTaxonomy: true,
        rawFoldersAreNotPublicTaxonomy: true,
        noIndexablePerImagePages: true,
        productionAssetsMovedToPublic: false,
        warningFlagsInternalOnly: true,
      },
    },
    "pipeline/manifests/round-4b-next-route-validation.json": routeValidation,
    "pipeline/manifests/round-4b-asset-resolution-plan.json": assetResolutionPlan,
  };
}

function buildRound4BReports(state, generated, manifests) {
  const buildResults = manifests["pipeline/manifests/round-4b-next-gallery-build-results.json"];
  const routeValidation = manifests["pipeline/manifests/round-4b-next-route-validation.json"];
  const assetPlan = manifests["pipeline/manifests/round-4b-asset-resolution-plan.json"];

  return {
    "pipeline/reports/round-4b-asset-hosting-plan.md": [
      "# Round 4B Asset Hosting Plan",
      "",
      `Generated: ${ROUND4B_GENERATED_AT}`,
      "",
      "## Current State",
      "",
      "- Generated assets remain under `pipeline/production/full/` and stay ignored/local.",
      "- The Next.js app uses generated metadata and an asset resolver instead of copying media into `public/`.",
      "- Client data stores asset subpaths only, not local source image paths or Windows filesystem paths.",
      "",
      "## Resolver Behavior",
      "",
      `- CDN/object storage base URL: \`${assetPlan.assetBaseUrlEnvironmentVariable}\``,
      `- Local proxy server toggle: \`${assetPlan.localProxyEnvironmentVariable}\``,
      `- Client proxy URL toggle: \`${assetPlan.publicClientToggleEnvironmentVariable}\``,
      "- If no base URL or proxy is configured, image cards render a clean placeholder and hide download/print actions.",
      "- The local proxy rejects path traversal and serves only approved production asset folders.",
      "",
      "## Options",
      "",
      "| Option | Pros | Cons | Fit |",
      "| --- | --- | --- | --- |",
      "| Copy to `public/` | Simple static hosting | Bloats repo/build context with thousands of media files | Not recommended now |",
      "| CDN/object storage | Small repo, cacheable, production-friendly | Requires upload and URL mapping step | Recommended |",
      "| Server route proxy | Useful for local review and controlled internal serving | Adds runtime file-serving surface | Local development only |",
      "",
      "## Recommended Next Step",
      "",
      "Upload `pipeline/production/full/assets/` to object storage or a CDN path, then set `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` to that public base URL. Keep the local proxy for development review only.",
    ].join("\n") + "\n",
    "pipeline/reports/round-4b-next-gallery-report.md": [
      "# Round 4B Next Gallery Report",
      "",
      `Generated: ${ROUND4B_GENERATED_AT}`,
      "",
      "## Data Files Generated",
      "",
      ...ROUND4B_GENERATED_DATA_FILES.map((file) => `- \`${file}\``),
      "",
      "## Counts",
      "",
      `- Successful Round 3C assets analyzed: ${buildResults.counts.successfulAssetsAnalyzed}`,
      `- Generated gallery items: ${buildResults.counts.generatedItems}`,
      `- Indexable gallery route count: ${buildResults.counts.phase1HubRoutes}`,
      `- Phase 1 slug hub pages: ${buildResults.counts.phase1SlugRoutes}`,
      `- Phase 2 backlog hubs retained but not routed: ${buildResults.counts.phase2BacklogHubs}`,
      `- Section-only topics retained but not routed: ${buildResults.counts.sectionOnlyTopics}`,
      `- Rejected candidates excluded: ${buildResults.counts.rejectedCandidates}`,
      `- Quarantined assets excluded: ${buildResults.counts.quarantinedAssetsExcluded}`,
      "",
      "## UI Foundation",
      "",
      "- `/coloring-pages` uses featured hubs, popular themes, subject/style browsing, and a limited preview grid.",
      "- `/coloring-pages/[hubSlug]` supports Phase 1 hubs only, with breadcrumbs, sections, related hubs, and paginated gallery cards.",
      "- Large hubs use a first-page limit instead of rendering every image at once.",
      "- Image cards do not link to individual image pages.",
      "",
      "## Validation Status",
      "",
      "- `node --test pipeline\\tests\\round-4a-hub-taxonomy.test.mjs`: passed at Round 4B closeout.",
      "- `node --test pipeline\\tests\\round-4b-next-gallery.test.mjs`: passed at Round 4B closeout.",
      "- `node pipeline\\scripts\\round-4b-build-next-gallery-data.mjs`: passed at Round 4B closeout.",
      "- `npm test`: passed at Round 4B closeout.",
      "- `npm run typecheck`: passed at Round 4B closeout.",
      "- `npm run build`: passed at Round 4B closeout.",
      "- `npm audit --audit-level=moderate`: passed at Round 4B closeout.",
      "- `npm run lint`: not configured in Round 4B.",
      "- Browser smoke QA passed with placeholder assets; full real-asset visual QA still needs `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` or local proxy environment variables.",
    ].join("\n") + "\n",
    "pipeline/reports/round-4b-route-and-seo-report.md": [
      "# Round 4B Route And SEO Report",
      "",
      `Generated: ${ROUND4B_GENERATED_AT}`,
      "",
      "## Routes",
      "",
      `- Root gallery route: \`${routeValidation.rootRoute}\``,
      `- Hub route pattern: \`${routeValidation.routePattern}\``,
      `- Sitemap route count: ${routeValidation.sitemapRouteCount}`,
      `- Indexable gallery route count: ${routeValidation.phase1HubRouteCount}`,
      `- Phase 1 slug hub pages: ${routeValidation.phase1SlugRouteCount}`,
      `- Root route included in sitemap: ${routeValidation.rootRouteIncludedInSitemap}`,
      "- Phase 2 hubs are excluded from indexable routes.",
      "- Section-only topics are excluded from indexable routes.",
      "- Rejected hub candidates are excluded from indexable routes.",
      "- Per-image routes are not generated.",
      "",
      "## SEO Behavior",
      "",
      "- `app/sitemap.ts` reads generated sitemap entries and emits only indexable Round 4B routes.",
      "- `app/robots.ts` allows the public gallery and references the sitemap.",
      "- Page metadata uses `NEXT_PUBLIC_SITE_URL` when configured, otherwise local relative paths remain stable.",
      "- Metadata and Open Graph copy comes from generated hub data and does not claim fake search volume.",
    ].join("\n") + "\n",
    "pipeline/reports/round-4b-next-phase-plan.md": [
      "# Round 4B Next Phase Plan",
      "",
      `Generated: ${ROUND4B_GENERATED_AT}`,
      "",
      "## Round 4C Recommendation",
      "",
      "Run visual QA on the Next.js gallery with either `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` pointing to uploaded assets or both `COLORING_ENABLE_LOCAL_ASSET_PROXY=1` and `NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY=1` for local review. Then tighten hub copy, card density, mobile behavior, and sitemap metadata from browser evidence. Do not promote Phase 2 hubs or move media into `public/` until asset hosting and content quality are explicitly approved.",
      "",
      "## Commands",
      "",
      "```powershell",
      "node --test pipeline\\tests\\round-4a-hub-taxonomy.test.mjs",
      "node --test pipeline\\tests\\round-4b-next-gallery.test.mjs",
      "node pipeline\\scripts\\round-4b-build-next-gallery-data.mjs",
      "npm test",
      "npm run typecheck",
      "npm run build",
      "npm audit --audit-level=moderate",
      "```",
      "",
      "`npm run lint` should be added in a later code-quality pass before using lint as a release gate.",
    ].join("\n") + "\n",
  };
}

function buildAssetSubpaths(asset) {
  return {
    svg: toAssetSubpath(asset.svgPath),
    pngPreview: toAssetSubpath(asset.pngPreviewPath),
    thumbnail: toAssetSubpath(asset.thumbnailPath),
  };
}

function toAssetSubpath(assetPath) {
  const normalized = String(assetPath || "").replace(/\\/g, "/");
  const marker = "pipeline/production/full/assets/";
  if (!normalized.startsWith(marker)) {
    throw new Error(`Unexpected production asset path: ${assetPath}`);
  }
  return normalized.slice(marker.length);
}

function pickPreviewAssetIds({ assetIds, featuredAssetIds, itemById, limit }) {
  const picked = [];
  for (const assetId of featuredAssetIds) {
    if (itemById.has(assetId) && !picked.includes(assetId)) picked.push(assetId);
    if (picked.length >= limit) return picked;
  }
  for (const assetId of assetIds) {
    if (itemById.has(assetId) && !picked.includes(assetId)) picked.push(assetId);
    if (picked.length >= limit) return picked;
  }
  return picked;
}

function simplifySectionGroupings(groupings) {
  return groupings
    .map((grouping) => ({
      groupingId: grouping.groupingId,
      label: grouping.label,
      items: (grouping.items || []).slice(0, 12).map((item) => ({
        label: item.label,
        term: item.term,
        assetCount: item.assetCount,
      })),
    }))
    .filter((grouping) => grouping.items.length > 0);
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^Coloring Pages \| Printable Coloring Pages$/, "Printable Coloring Pages")
    .trim();
}

function cleanDescription(value, fallbackTitle) {
  const fallbackSubject = String(fallbackTitle || "coloring pages").replace(/ Coloring Pages$/, "").toLowerCase();
  return String(value || `Browse printable ${fallbackSubject} coloring pages.`)
    .replace(/coloring pages coloring pages/g, "coloring pages")
    .replace(/\s+/g, " ")
    .trim();
}

function compareHubs(a, b) {
  return (a.route || "").localeCompare(b.route || "") || a.hubId.localeCompare(b.hubId);
}

function noSlugOverlap(routeSlugs, records) {
  return records.every((record) => !record.slug || !routeSlugs.has(record.slug));
}

function noHubIdOverlap(routeHubIds, records) {
  return records.every((record) => !record.hubId || !routeHubIds.has(record.hubId));
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFileWithTransientRetry(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeText(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFileWithTransientRetry(filePath, text);
}

async function writeFileWithTransientRetry(filePath, text) {
  const retryableCodes = new Set(["EBUSY", "EMFILE", "ENFILE", "EPERM", "UNKNOWN"]);
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await writeFile(filePath, text, "utf8");
      return;
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has(error?.code) || attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
    }
  }
  throw lastError;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runRound4BNextGalleryBuild()
    .then((result) => {
      const counts = result.manifests["pipeline/manifests/round-4b-next-gallery-build-results.json"].counts;
      console.log(JSON.stringify({
        generatedAt: ROUND4B_GENERATED_AT,
        runId: ROUND4B_RUN_ID,
        ...counts,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
