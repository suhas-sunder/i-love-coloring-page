#!/usr/bin/env node

import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GENERATED_AT = new Date().toISOString();
const PUBLIC_ASSET_BASE = "https://assets.ilovecoloringpage.com/coloring-pages";
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;

const INPUTS = {
  cleanObjectKeyMap: "pipeline/manifests/round-5n-clean-upload-object-key-map.json",
  inclusionManifest: "pipeline/manifests/round-5n-clean-upload-inclusion-manifest.json",
  deferredManifest: "pipeline/manifests/round-5n-deferred-manual-review-records.json",
  finalObjectKeyMap: "pipeline/manifests/round-5l-final-svg-webp-object-key-map.json",
  items: "src/generated/coloring/items.json",
  hubs: "src/generated/coloring/hubs.json",
  hubItems: "src/generated/coloring/hub-items.json",
  routes: "src/generated/coloring/routes.json",
  searchIndex: "src/generated/coloring/search-index.json",
  hubFeaturedItems: "src/generated/coloring/hub-featured-items.json",
  hubFilterTags: "src/generated/coloring/hub-filter-tags.json",
  siteMap: "src/generated/coloring/site-map.json",
  seoPages: "src/generated/coloring/seo-pages.json",
  hubSeoContent: "src/generated/coloring/hub-seo-content.json",
  socialMetadata: "src/generated/coloring/social-metadata.json",
};

const OUTPUTS = {
  runtimeAvailableItems: "src/generated/coloring/runtime-available-items.json",
  runtimeAssetPaths: "src/generated/coloring/runtime-asset-paths.json",
  runtimeDeferredItems: "src/generated/coloring/runtime-deferred-items.json",
  runtimeHubItems: "src/generated/coloring/runtime-hub-items.json",
  runtimeHubs: "src/generated/coloring/runtime-hubs.json",
  runtimeRoutes: "src/generated/coloring/runtime-routes.json",
  runtimeSearchIndex: "src/generated/coloring/runtime-search-index.json",
  runtimeHubFeaturedItems: "src/generated/coloring/runtime-hub-featured-items.json",
  runtimeHubFilterTags: "src/generated/coloring/runtime-hub-filter-tags.json",
  runtimeSiteMap: "src/generated/coloring/runtime-site-map.json",
  runtimeSeoPages: "src/generated/coloring/runtime-seo-pages.json",
  runtimeHubSeoContent: "src/generated/coloring/runtime-hub-seo-content.json",
  runtimeSocialMetadata: "src/generated/coloring/runtime-social-metadata.json",
  projectContext: "pipeline/manifests/runtime-switch-project-context-check.json",
  workingTreeAudit: "pipeline/manifests/runtime-switch-working-tree-audit.json",
  availableItemsManifest: "pipeline/manifests/runtime-switch-available-items.json",
  deferredItemsManifest: "pipeline/manifests/runtime-switch-deferred-items.json",
  countDiff: "pipeline/manifests/runtime-switch-count-diff.json",
  readiness: "pipeline/manifests/runtime-switch-readiness.json",
};

const REPORTS = {
  projectContext: "pipeline/reports/runtime-switch-project-context-check.md",
  workingTreeAudit: "pipeline/reports/runtime-switch-working-tree-audit.md",
  dataReport: "pipeline/reports/runtime-switch-data-report.md",
  countDiff: "pipeline/reports/runtime-switch-count-diff.md",
  readiness: "pipeline/reports/runtime-switch-readiness.md",
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const input = await readInputs();
  const state = buildRuntimeState(input);
  validateState(state);

  await writeRuntimeGeneratedData(state);
  await writeRoundArtifacts(state);

  console.log(JSON.stringify({
    runId: "runtime-switch-clean-asset-data",
    availableRecords: state.availableItems.length,
    deferredRecords: state.deferredRecords.length,
    routeCount: state.runtimeRoutes.routes.length,
    emptyHubCount: state.emptyHubs.length,
    rootCount: state.runtimeRootCount,
  }, null, 2));
}

async function readInputs() {
  return {
    cleanObjectKeyMap: await readJson(INPUTS.cleanObjectKeyMap),
    inclusionManifest: await readJson(INPUTS.inclusionManifest),
    deferredManifest: await readJson(INPUTS.deferredManifest),
    finalObjectKeyMap: await readJson(INPUTS.finalObjectKeyMap),
    items: await readJson(INPUTS.items),
    hubs: await readJson(INPUTS.hubs),
    hubItems: await readJson(INPUTS.hubItems),
    routes: await readJson(INPUTS.routes),
    searchIndex: await readJson(INPUTS.searchIndex),
    hubFeaturedItems: await readJson(INPUTS.hubFeaturedItems),
    hubFilterTags: await readJson(INPUTS.hubFilterTags),
    siteMap: await readJson(INPUTS.siteMap),
    seoPages: await readJson(INPUTS.seoPages),
    hubSeoContent: await readJson(INPUTS.hubSeoContent),
    socialMetadata: await readJson(INPUTS.socialMetadata),
  };
}

function buildRuntimeState(input) {
  const objectKeyByAssetId = new Map(input.cleanObjectKeyMap.records.map((record) => [record.assetId, record]));
  const includedIds = new Set(input.inclusionManifest.records.map((record) => record.assetId));
  const deferredIds = new Set(input.deferredManifest.records.map((record) => record.assetId));
  const sourceItemById = new Map(input.items.items.map((item) => [item.assetId, item]));
  const sourceSearchById = new Map(input.searchIndex.entries.map((entry) => [entry.assetId, entry]));

  const availableItems = input.items.items
    .filter((item) => includedIds.has(item.assetId))
    .map((item) => buildRuntimeItem(item, objectKeyByAssetId.get(item.assetId)));

  const availableIds = new Set(availableItems.map((item) => item.assetId));
  const availableItemById = new Map(availableItems.map((item) => [item.assetId, item]));
  const deferredRecords = input.deferredManifest.records.map((record) => ({
    ...record,
    displayTitle: sourceItemById.get(record.assetId)?.title || null,
    status: "hidden_until_manual_review_upload",
  }));

  const runtimeHubItems = buildRuntimeHubItems(input.hubItems, availableIds);
  const phase1HubItemsByHubId = buildPhase1HubItemsByHubId(runtimeHubItems.items);
  const runtimeSearchIndex = buildRuntimeSearchIndex(input.searchIndex, availableIds, phase1HubItemsByHubId);
  const runtimeSearchByAssetId = new Map(runtimeSearchIndex.entries.map((entry) => [entry.assetId, entry]));
  const runtimeHubCounts = new Map(input.hubs.hubs.map((hub) => [hub.hubId, (hub.assetIds || []).filter((assetId) => availableIds.has(assetId)).length]));
  const nonEmptyHubIds = new Set([...runtimeHubCounts.entries()].filter(([, count]) => count > 0).map(([hubId]) => hubId));
  const runtimeHubs = buildRuntimeHubs(input.hubs, availableIds, nonEmptyHubIds, runtimeSearchByAssetId);
  const runtimeHubById = new Map(runtimeHubs.hubs.map((hub) => [hub.hubId, hub]));
  const runtimeRoutes = buildRuntimeRoutes(input.routes, runtimeHubById);
  const runtimeSiteMap = buildRuntimeSiteMap(input.siteMap, runtimeRoutes.routes);
  const runtimeHubFeaturedItems = buildRuntimeHubFeaturedItems(input.hubFeaturedItems, runtimeHubById);
  const runtimeHubFilterTags = buildRuntimeHubFilterTags(input.hubFilterTags, runtimeHubById, runtimeSearchByAssetId);
  const runtimeSeoPages = updateRuntimeSeoPages(input.seoPages, input.routes.routes, runtimeRoutes.routes);
  const runtimeHubSeoContent = updateRuntimeHubSeoContent(input.hubSeoContent, input.routes.routes, runtimeRoutes.routes);
  const runtimeSocialMetadata = updateRuntimeSocialMetadata(input.socialMetadata, input.routes.routes, runtimeRoutes.routes);
  const assetPathRecords = availableItems.map((item) => {
    const objectKeyRecord = objectKeyByAssetId.get(item.assetId);
    return {
      assetId: item.assetId,
      category: item.categorySlug,
      webpPreviewSubpath: item.assetSubpaths.webpPreview,
      internalSvgSubpath: item.assetSubpaths.svg,
      cleanWebpObjectKey: objectKeyRecord.cleanWebpObjectKey,
      cleanSvgObjectKey: objectKeyRecord.cleanSvgObjectKey,
      expectedPublicWebpUrl: `${PUBLIC_ASSET_BASE}/${item.assetSubpaths.webpPreview}`,
      expectedPublicSvgUrl: `${PUBLIC_ASSET_BASE}/${item.assetSubpaths.svg}`,
      status: "runtime_available",
    };
  });
  const emptyHubs = runtimeHubs.hubs.filter((hub) => hub.assetCount === 0);
  const previousRootCount = input.routes.routes.find((route) => route.path === "/coloring-pages")?.assetCount || input.items.summary.itemCount;
  const runtimeRootCount = runtimeRoutes.routes.find((route) => route.path === "/coloring-pages")?.assetCount || availableItems.length;
  const majorPathDiffs = buildCountDiffs(input.routes.routes, runtimeRoutes.routes, [
    "/",
    "/coloring-pages",
    "/coloring-pages/animals",
    "/coloring-pages/geometric",
    "/coloring-pages/anime-girls",
    "/coloring-pages/christmas",
    "/coloring-pages/plushies",
    "/coloring-pages/st-patricks-day",
  ]);
  const allPathDiffs = buildCountDiffs(input.routes.routes, runtimeRoutes.routes, input.routes.routes.map((route) => route.path));

  return {
    input,
    availableItems,
    availableIds,
    availableItemById,
    deferredIds,
    deferredRecords,
    sourceSearchById,
    runtimeHubItems,
    runtimeSearchIndex,
    runtimeHubs,
    runtimeRoutes,
    runtimeSiteMap,
    runtimeHubFeaturedItems,
    runtimeHubFilterTags,
    runtimeSeoPages,
    runtimeHubSeoContent,
    runtimeSocialMetadata,
    assetPathRecords,
    emptyHubs,
    previousRootCount,
    runtimeRootCount,
    majorPathDiffs,
    allPathDiffs,
  };
}

function buildRuntimeItem(item, objectKeyRecord) {
  if (!objectKeyRecord) throw new Error(`Missing clean object key map record for ${item.assetId}`);
  const svgSubpath = stripColoringPagesPrefix(objectKeyRecord.cleanSvgObjectKey);
  const webpSubpath = stripColoringPagesPrefix(objectKeyRecord.cleanWebpObjectKey);
  assertRuntimeSubpath(svgSubpath, "svg");
  assertRuntimeSubpath(webpSubpath, "webp");
  return {
    ...item,
    assetSubpaths: {
      svg: svgSubpath,
      pngPreview: null,
      webpPreview: webpSubpath,
      thumbnail: null,
    },
    dimensions: {
      ...item.dimensions,
      pngPreview: null,
      thumbnail: null,
    },
    runtimeAssetStatus: "uploaded_clean_svg_webp",
  };
}

function buildRuntimeHubItems(hubItems, availableIds) {
  const items = hubItems.items
    .filter((entry) => availableIds.has(entry.assetId))
    .map((entry) => ({ ...entry }));
  return {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-hub-items",
    source: INPUTS.hubItems,
    summary: {
      assetCount: items.length,
      originalAssetCount: hubItems.summary.assetCount,
      deferredRecordsHidden: hubItems.summary.assetCount - items.length,
      oneImageMayBelongToMultipleHubs: true,
      phase1HubAssignments: items.reduce((sum, item) => sum + item.hubIds.length, 0),
      phase2AssignmentsRetainedAsBacklogOnly: items.reduce((sum, item) => sum + item.phase2HubIds.length, 0),
      sectionOnlyAssignmentsRetainedAsInternalOnly: items.reduce((sum, item) => sum + item.sectionOnlyTopicIds.length, 0),
    },
    items,
  };
}

function buildPhase1HubItemsByHubId(hubItems) {
  const map = new Map();
  for (const entry of hubItems) {
    for (const hubId of entry.hubIds) {
      if (!map.has(hubId)) map.set(hubId, []);
      map.get(hubId).push(entry.assetId);
    }
  }
  for (const assetIds of map.values()) assetIds.sort();
  return map;
}

function buildRuntimeSearchIndex(searchIndex, availableIds, phase1HubItemsByHubId) {
  const runtimeHubIds = new Set(phase1HubItemsByHubId.keys());
  const entries = searchIndex.entries
    .filter((entry) => availableIds.has(entry.assetId))
    .map((entry) => ({
      ...entry,
      hubIds: entry.hubIds.filter((hubId) => runtimeHubIds.has(hubId)),
    }));
  return {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-search-index",
    source: INPUTS.searchIndex,
    summary: {
      entryCount: entries.length,
      originalEntryCount: searchIndex.summary.entryCount,
      deferredRecordsHidden: searchIndex.summary.entryCount - entries.length,
      successfulAssetsOnly: true,
      noSourcePaths: true,
      tags: searchIndex.summary.tags,
    },
    entries,
  };
}

function buildRuntimeHubs(hubs, availableIds, nonEmptyHubIds, runtimeSearchByAssetId) {
  const originalHubById = new Map(hubs.hubs.map((hub) => [hub.hubId, hub]));
  const runtimeHubRecords = hubs.hubs.map((hub) => {
    const assetIds = (hub.assetIds || []).filter((assetId) => availableIds.has(assetId));
    const featuredAssetIds = fillDeterministicIds((hub.featuredAssetIds || []).filter((assetId) => availableIds.has(assetId)), assetIds, 12);
    const previewLimit = hub.route === "/coloring-pages" ? Math.max(hub.galleryPageSize, 48) : hub.galleryPageSize;
    const previewAssetIds = fillDeterministicIds((hub.previewAssetIds || []).filter((assetId) => availableIds.has(assetId)), assetIds, previewLimit);
    return {
      ...hub,
      assetCount: assetIds.length,
      assetIds,
      featuredAssetIds,
      previewAssetIds,
      sectionGroupings: updateSectionGroupings(hub.sectionGroupings || [], assetIds, runtimeSearchByAssetId),
      relatedHubIds: (hub.relatedHubIds || []).filter((hubId) => nonEmptyHubIds.has(hubId)),
      childHubIds: (hub.childHubIds || []).filter((hubId) => nonEmptyHubIds.has(hubId)),
      internalLinkingTargets: (hub.internalLinkingTargets || []).filter((hubId) => nonEmptyHubIds.has(hubId) || originalHubById.has(hubId)),
    };
  });
  return {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-hubs",
    source: INPUTS.hubs,
    summary: {
      hubCount: runtimeHubRecords.length,
      phase1Only: true,
      phase2BacklogHubCount: hubs.summary.phase2BacklogHubCount,
      sectionOnlyTopicCount: hubs.summary.sectionOnlyTopicCount,
      rejectedCandidateCount: hubs.summary.rejectedCandidateCount,
      galleryPageSize: hubs.summary.galleryPageSize,
      noPerImageRoutes: true,
      runtimeAvailableRecords: [...availableIds].length,
      deferredRecordsHidden: EXPECTED_DEFERRED_RECORDS,
    },
    backlogHubs: hubs.backlogHubs,
    sectionOnlyTopics: hubs.sectionOnlyTopics,
    hubs: runtimeHubRecords,
  };
}

function buildRuntimeRoutes(routes, runtimeHubById) {
  const runtimeRoutes = routes.routes
    .filter((route) => runtimeHubById.has(route.hubId))
    .map((route) => {
      const hub = runtimeHubById.get(route.hubId);
      return { ...route, assetCount: hub.assetCount };
    });
  return {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-routes",
    source: INPUTS.routes,
    routePattern: routes.routePattern,
    rootRoute: routes.rootRoute,
    noPerImageRoutes: true,
    phase2RoutesExcluded: true,
    sectionOnlyRoutesExcluded: true,
    rejectedRoutesExcluded: true,
    routes: runtimeRoutes,
  };
}

function buildRuntimeSiteMap(siteMap, runtimeRoutes) {
  const runtimePaths = new Set(runtimeRoutes.filter((route) => route.sitemap).map((route) => route.path));
  const staticPaths = new Set(["/", "/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"]);
  const entries = siteMap.entries.filter((entry) => runtimePaths.has(entry.path) || staticPaths.has(entry.path));
  return {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-site-map",
    source: INPUTS.siteMap,
    entries,
  };
}

function buildRuntimeHubFeaturedItems(hubFeaturedItems, runtimeHubById) {
  const hubs = hubFeaturedItems.hubs
    .filter((entry) => runtimeHubById.has(entry.hubId))
    .map((entry) => {
      const hub = runtimeHubById.get(entry.hubId);
      return {
        ...entry,
        assetCount: hub.assetCount,
        assetIds: fillDeterministicIds((entry.assetIds || []).filter((assetId) => hub.assetIds.includes(assetId)), hub.assetIds, 12),
      };
    });
  return {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-hub-featured-items",
    summary: {
      hubCount: hubs.length,
      maxFeaturedItemsPerHub: hubFeaturedItems.summary.maxFeaturedItemsPerHub,
      successfulAssetsOnly: true,
      deferredRecordsHidden: true,
      deterministic: true,
    },
    hubs,
  };
}

function buildRuntimeHubFilterTags(hubFilterTags, runtimeHubById, runtimeSearchByAssetId) {
  const hubs = hubFilterTags.hubs
    .filter((entry) => runtimeHubById.has(entry.hubId))
    .map((entry) => {
      const hub = runtimeHubById.get(entry.hubId);
      const tags = (entry.tags || [])
        .map((tag) => ({ ...tag, assetCount: countAssetsWithTag(hub.assetIds, runtimeSearchByAssetId, tag.id) }))
        .filter((tag) => tag.assetCount > 0);
      const tagById = new Map(tags.map((tag) => [tag.id, tag]));
      const tabs = (entry.tabs || [])
        .map((tab) => {
          const tag = tagById.get(tab.id);
          return tag ? { id: tab.id, label: tab.label, assetCount: tag.assetCount } : null;
        })
        .filter(Boolean);
      return {
        ...entry,
        assetCount: hub.assetCount,
        tags,
        tabs,
      };
    });
  return {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-hub-filter-tags",
    summary: {
      hubCount: hubs.length,
      deferredRecordsHidden: true,
      noUnavailableAssetCounts: true,
    },
    hubs,
  };
}

function updateRuntimeSeoPages(seoPages, oldRoutes, runtimeRoutes) {
  return {
    ...seoPages,
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-seo-pages",
    pages: seoPages.pages.map((page) => updateCountsDeep(page, oldRoutes, runtimeRoutes)),
  };
}

function updateRuntimeHubSeoContent(hubSeoContent, oldRoutes, runtimeRoutes) {
  return {
    ...hubSeoContent,
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-hub-seo-content",
    hubs: hubSeoContent.hubs.map((hub) => updateCountsDeep(hub, oldRoutes, runtimeRoutes)),
  };
}

function updateRuntimeSocialMetadata(socialMetadata, oldRoutes, runtimeRoutes) {
  return {
    ...socialMetadata,
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-social-metadata",
    pages: socialMetadata.pages.map((page) => updateCountsDeep(page, oldRoutes, runtimeRoutes)),
  };
}

function updateCountsDeep(value, oldRoutes, runtimeRoutes) {
  if (typeof value === "string") return updatePublicCopyString(value, oldRoutes, runtimeRoutes);
  if (Array.isArray(value)) return value.map((item) => updateCountsDeep(item, oldRoutes, runtimeRoutes));
  if (!value || typeof value !== "object") return value;
  const updated = {};
  for (const [key, entryValue] of Object.entries(value)) {
    updated[key] = updateCountsDeep(entryValue, oldRoutes, runtimeRoutes);
  }
  if (typeof updated.href === "string" && typeof updated.assetCount === "number") {
    const route = runtimeRoutes.find((candidate) => candidate.path === updated.href);
    if (route) updated.assetCount = route.assetCount;
  }
  return updated;
}

function updatePublicCopyString(value, oldRoutes, runtimeRoutes) {
  let output = value;
  const routePairs = oldRoutes
    .map((oldRoute) => ({ oldRoute, runtimeRoute: runtimeRoutes.find((route) => route.path === oldRoute.path) }))
    .filter((pair) => pair.runtimeRoute);
  for (const { oldRoute, runtimeRoute } of routePairs) {
    output = output.replaceAll(formatCount(oldRoute.assetCount), formatCount(runtimeRoute.assetCount));
  }
  output = output
    .replaceAll("download PNG files", "download PNG, JPG, or WebP files")
    .replaceAll("download PNG pages", "download PNG, JPG, or WebP pages")
    .replaceAll("PNG downloads", "PNG, JPG, or WebP downloads")
    .replaceAll("PNG files", "PNG, JPG, or WebP files");
  return output;
}

function updateSectionGroupings(sections, assetIds, runtimeSearchByAssetId) {
  return sections.map((section) => ({
    ...section,
    items: (section.items || [])
      .map((item) => {
        const count = countAssetsMatchingTerm(assetIds, runtimeSearchByAssetId, item.term);
        return {
          ...item,
          assetCount: count > 0 ? count : Math.min(item.assetCount, assetIds.length),
        };
      })
      .filter((item) => item.assetCount > 0),
  })).filter((section) => section.items.length > 0);
}

function countAssetsMatchingTerm(assetIds, runtimeSearchByAssetId, term) {
  const normalizedTerm = normalizeSearchTerm(term);
  if (!normalizedTerm) return 0;
  return assetIds.filter((assetId) => {
    const entry = runtimeSearchByAssetId.get(assetId);
    return entry?.searchText?.includes(normalizedTerm) || entry?.tags?.includes(normalizedTerm);
  }).length;
}

function countAssetsWithTag(assetIds, runtimeSearchByAssetId, tagId) {
  return assetIds.filter((assetId) => runtimeSearchByAssetId.get(assetId)?.tags?.includes(tagId)).length;
}

function fillDeterministicIds(preferredIds, fallbackIds, limit) {
  const seen = new Set();
  const merged = [];
  for (const assetId of [...preferredIds, ...fallbackIds]) {
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    merged.push(assetId);
    if (merged.length >= limit) break;
  }
  return merged;
}

async function writeRuntimeGeneratedData(state) {
  await writeJson(OUTPUTS.runtimeAvailableItems, {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-available-items",
    source: {
      items: INPUTS.items,
      cleanObjectKeyMap: INPUTS.cleanObjectKeyMap,
      inclusionManifest: INPUTS.inclusionManifest,
    },
    summary: {
      itemCount: state.availableItems.length,
      previousItemCount: state.input.items.summary.itemCount,
      deferredRecordsHidden: state.deferredRecords.length,
      cleanWebpPreviews: true,
      internalSvgConversionPaths: true,
      pngPreviewPrimary: false,
      thumbsPrimary: false,
      noSourceImagePathsInClientData: true,
    },
    items: state.availableItems,
  });
  await writeJson(OUTPUTS.runtimeAssetPaths, {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-asset-paths",
    publicAssetBase: PUBLIC_ASSET_BASE,
    summary: {
      recordCount: state.assetPathRecords.length,
      webpPreviewCount: state.assetPathRecords.length,
      internalSvgCount: state.assetPathRecords.length,
      pngPrimaryCount: 0,
      thumbsPrimaryCount: 0,
    },
    records: state.assetPathRecords,
  });
  await writeJson(OUTPUTS.runtimeDeferredItems, {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-deferred-items",
    source: INPUTS.deferredManifest,
    summary: {
      deferredRecordCount: state.deferredRecords.length,
      expectedDeferredRecordCount: EXPECTED_DEFERRED_RECORDS,
      hiddenFromPublicRuntime: true,
      notDeleted: true,
      canBeUploadedLater: true,
    },
    records: state.deferredRecords,
  });
  await writeJson(OUTPUTS.runtimeHubItems, state.runtimeHubItems);
  await writeJson(OUTPUTS.runtimeHubs, state.runtimeHubs);
  await writeJson(OUTPUTS.runtimeRoutes, state.runtimeRoutes);
  await writeJson(OUTPUTS.runtimeSearchIndex, state.runtimeSearchIndex);
  await writeJson(OUTPUTS.runtimeHubFeaturedItems, state.runtimeHubFeaturedItems);
  await writeJson(OUTPUTS.runtimeHubFilterTags, state.runtimeHubFilterTags);
  await writeJson(OUTPUTS.runtimeSiteMap, state.runtimeSiteMap);
  await writeJson(OUTPUTS.runtimeSeoPages, state.runtimeSeoPages);
  await writeJson(OUTPUTS.runtimeHubSeoContent, state.runtimeHubSeoContent);
  await writeJson(OUTPUTS.runtimeSocialMetadata, state.runtimeSocialMetadata);
}

async function writeRoundArtifacts(state) {
  const projectContext = await buildProjectContext();
  const workingTreeAudit = buildWorkingTreeAudit();
  const availableManifest = {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-available-items",
    summary: {
      availableRecordCount: state.availableItems.length,
      expectedAvailableRecordCount: EXPECTED_AVAILABLE_RECORDS,
      cleanWebpPreviewPaths: true,
      cleanInternalSvgPaths: true,
      deferredRecordsHidden: state.deferredRecords.length,
      pngAndThumbsExcludedAsPrimaryRuntimeSources: true,
    },
    sampleRecords: state.assetPathRecords.slice(0, 25),
  };
  const deferredManifest = {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-deferred-items",
    summary: {
      deferredRecordCount: state.deferredRecords.length,
      expectedDeferredRecordCount: EXPECTED_DEFERRED_RECORDS,
      hiddenFromPublicGalleries: true,
      notDeleted: true,
      canBeUploadedLater: true,
    },
    records: state.deferredRecords,
  };
  const countDiff = {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-count-diff",
    summary: {
      previousRootCount: state.previousRootCount,
      runtimeRootCount: state.runtimeRootCount,
      availableRecords: state.availableItems.length,
      deferredRecordsHidden: state.deferredRecords.length,
      emptyHubCount: state.emptyHubs.length,
      routeCountBefore: state.input.routes.routes.length,
      routeCountAfter: state.runtimeRoutes.routes.length,
    },
    majorPages: state.majorPathDiffs,
    allRoutes: state.allPathDiffs,
    emptyHubs: state.emptyHubs.map((hub) => ({ hubId: hub.hubId, slug: hub.slug, route: hub.route })),
  };
  const readiness = {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-readiness",
    runtime_paths_switched: true,
    available_records: state.availableItems.length,
    deferred_records: state.deferredRecords.length,
    webp_gallery_passed: false,
    svg_conversion_passed: false,
    downloads_passed: false,
    print_passed: false,
    sampled_url_checks_passed: false,
    ready_for_image_sitemap: false,
    ready_for_og_images: false,
    ready_for_live_ads: false,
    blockers: ["Browser QA has not run yet.", "Sampled public URL checks have not run yet."],
  };

  await writeJson(OUTPUTS.projectContext, projectContext);
  await writeText(REPORTS.projectContext, renderProjectContextReport(projectContext));
  await writeJson(OUTPUTS.workingTreeAudit, workingTreeAudit);
  await writeText(REPORTS.workingTreeAudit, renderWorkingTreeAuditReport(workingTreeAudit));
  await writeJson(OUTPUTS.availableItemsManifest, availableManifest);
  await writeJson(OUTPUTS.deferredItemsManifest, deferredManifest);
  await writeText(REPORTS.dataReport, renderDataReport(state));
  await writeJson(OUTPUTS.countDiff, countDiff);
  await writeText(REPORTS.countDiff, renderCountDiffReport(countDiff));
  await writeJson(OUTPUTS.readiness, readiness);
  await writeText(REPORTS.readiness, renderReadinessReport(readiness));
}

async function buildProjectContext() {
  const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
  const repoName = path.basename(repoRoot);
  const branch = git(["branch", "--show-current"]).trim();
  const nextConfig = await readText("next.config.mjs");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const adsConfig = await readText("src/lib/ads/config.ts");
  const sourceText = await readProjectText(["app", "src", "package.json", "next.config.mjs"]);
  return {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-project-context-check",
    summary: {
      correctRepository: repoName === "i-love-coloring-page",
      repoName,
      branch,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*["']export["']/.test(nextConfig),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      cleanUploadObjectKeyMapExists: existsSync(path.join(REPO_ROOT, INPUTS.cleanObjectKeyMap)),
      cleanUploadInclusionManifestExists: existsSync(path.join(REPO_ROOT, INPUTS.inclusionManifest)),
      deferredManifestExists: existsSync(path.join(REPO_ROOT, INPUTS.deferredManifest)),
      cleanBundleExists: existsSync(path.join(REPO_ROOT, "pipeline/r2-upload-clean/coloring-pages")),
      optimizedBundleExists: existsSync(path.join(REPO_ROOT, "pipeline/r2-upload-optimized/coloring-pages")),
      publicContainsGeneratedProductionMedia: publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)),
      imagesStatusClean: git(["status", "--short", "--", "images"]).trim() === "",
      ilovesvgStatusClean: git(["status", "--short", "--", "ilovesvg"]).trim() === "",
      svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(`${browserDownloads}\n${downloadMenu}`),
      publicDownloadsPngJpgWebp: /label: "PNG"/.test(downloadMenu) && /label: "JPG"/.test(downloadMenu) && /label: "WebP"/.test(downloadMenu),
      adWellsVisibleByDefault: /Advertisement/.test(adsConfig),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
      imageSitemapPresent: /image-sitemap|ImageSitemap/i.test(sourceText),
      openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(sourceText),
      wrongContextIndicatorsPresent: /image-to-favicon-generator|routeManifestClientAssets|routeMetaBytes|createManifestMeta|SVG wrapper route|Vite-specific output/i.test(sourceText),
    },
  };
}

function buildWorkingTreeAudit() {
  const statusShort = git(["status", "--short"]);
  const diffStat = git(["diff", "--stat"]);
  const diffNameOnly = git(["diff", "--name-only"]);
  const entries = statusShort.split(/\r?\n/).filter(Boolean).map((raw) => {
    const pathName = raw.slice(3).trim();
    return { raw, path: pathName, classification: classifyWorkingTreePath(pathName) };
  });
  return {
    generatedAt: GENERATED_AT,
    runId: "runtime-switch-working-tree-audit",
    summary: {
      statusEntryCount: entries.length,
      intendedRuntimeSwitchCount: entries.filter((entry) => entry.classification === "intended_runtime_switch_artifact").length,
      generatedUploadDriftCount: entries.filter((entry) => entry.classification === "generated_upload_verifier_drift").length,
      localArtifactDriftCount: entries.filter((entry) => entry.classification === "local_artifact_drift").length,
      riskyUnrelatedDriftCount: entries.filter((entry) => entry.classification === "risky_unrelated_drift").length,
      safeToProceed: entries.every((entry) => entry.classification !== "risky_unrelated_drift"),
    },
    commands: {
      statusShort: "git status --short",
      diffStat: "git diff --stat",
      diffNameOnly: "git diff --name-only",
    },
    statusShort,
    diffStat,
    diffNameOnly,
    entries,
  };
}

function classifyWorkingTreePath(pathName) {
  if (!pathName) return "unknown";
  if (pathName === "AGENTS.md" || pathName === "package.json") return "intended_runtime_switch_artifact";
  if (/^src\/(?:generated\/coloring\/runtime-|lib\/coloring\/(?:data|assets|types)\.ts)/.test(pathName)) return "intended_runtime_switch_artifact";
  if (/^pipeline\/(?:scripts|tests|manifests|reports)\/runtime-switch/.test(pathName)) return "intended_runtime_switch_artifact";
  if (pathName === "pipeline/scripts/build-runtime-clean-asset-data.mjs") return "intended_runtime_switch_artifact";
  if (pathName === "pipeline/tests/runtime-clean-asset-switch.test.mjs") return "intended_runtime_switch_artifact";
  if (pathName === "pipeline/tests/round-4f-frontend-deployment.test.mjs") return "intended_runtime_switch_artifact";
  if (/^pipeline\/(?:manifests|reports)\/round-5[oq]-/.test(pathName)) return "generated_upload_verifier_drift";
  if (/^pipeline\/review\/runtime-switch\//.test(pathName)) return "local_artifact_drift";
  return "risky_unrelated_drift";
}

function validateState(state) {
  if (state.availableItems.length !== EXPECTED_AVAILABLE_RECORDS) {
    throw new Error(`Expected ${EXPECTED_AVAILABLE_RECORDS} available records, found ${state.availableItems.length}.`);
  }
  if (state.deferredRecords.length !== EXPECTED_DEFERRED_RECORDS) {
    throw new Error(`Expected ${EXPECTED_DEFERRED_RECORDS} deferred records, found ${state.deferredRecords.length}.`);
  }
  if (state.input.cleanObjectKeyMap.summary.recordCount !== EXPECTED_AVAILABLE_RECORDS) {
    throw new Error("Clean object key map record count changed.");
  }
  if (state.input.inclusionManifest.summary.includedRecordCount !== EXPECTED_AVAILABLE_RECORDS) {
    throw new Error("Clean upload inclusion count changed.");
  }
  if (!state.input.inclusionManifest.summary.pngExcluded || !state.input.inclusionManifest.summary.thumbsExcluded) {
    throw new Error("Clean upload inclusion manifest no longer excludes PNG/thumbs.");
  }
  if (state.emptyHubs.length > 0) {
    throw new Error(`Runtime switch would create empty hubs: ${state.emptyHubs.map((hub) => hub.slug).join(", ")}`);
  }
  const duplicateIds = duplicateValues(state.availableItems.map((item) => item.assetId));
  if (duplicateIds.length) throw new Error(`Duplicate available asset IDs: ${duplicateIds.slice(0, 5).join(", ")}`);
  const overlap = state.availableItems.filter((item) => state.deferredIds.has(item.assetId));
  if (overlap.length) throw new Error(`Deferred records leaked into runtime: ${overlap.slice(0, 5).map((item) => item.assetId).join(", ")}`);
}

function buildCountDiffs(oldRoutes, runtimeRoutes, paths) {
  const oldByPath = new Map(oldRoutes.map((route) => [route.path, route]));
  const runtimeByPath = new Map(runtimeRoutes.map((route) => [route.path, route]));
  return paths.map((pathName) => {
    const oldCount = pathName === "/" ? oldByPath.get("/coloring-pages")?.assetCount || 0 : oldByPath.get(pathName)?.assetCount || 0;
    const runtimeCount = pathName === "/" ? runtimeByPath.get("/coloring-pages")?.assetCount || 0 : runtimeByPath.get(pathName)?.assetCount || 0;
    return {
      path: pathName,
      previousCount: oldCount,
      runtimeCount,
      hiddenDeferredCount: oldCount - runtimeCount,
    };
  });
}

function renderProjectContextReport(payload) {
  return `# Runtime Switch Project Context Check

- Repository: ${payload.summary.repoName}
- Branch: ${payload.summary.branch}
- Static export configured: ${payload.summary.staticExportConfigured}
- app/api present: ${payload.summary.appApiRoutePresent}
- Clean upload object-key map exists: ${payload.summary.cleanUploadObjectKeyMapExists}
- Inclusion manifest exists: ${payload.summary.cleanUploadInclusionManifestExists}
- Deferred manifest exists: ${payload.summary.deferredManifestExists}
- Clean bundle exists: ${payload.summary.cleanBundleExists}
- Optimized bundle exists: ${payload.summary.optimizedBundleExists}
- SVG internal-only: ${payload.summary.svgInternalOnly}
- Public downloads PNG/JPG/WebP: ${payload.summary.publicDownloadsPngJpgWebp}
- Live AdSense present: ${payload.summary.liveAdSenseCodePresent}
- Image sitemap present: ${payload.summary.imageSitemapPresent}
- Open Graph image generation present: ${payload.summary.openGraphImageGenerationPresent}
- Wrong context indicators present: ${payload.summary.wrongContextIndicatorsPresent}
`;
}

function renderWorkingTreeAuditReport(payload) {
  return `# Runtime Switch Working Tree Audit

- Status entries: ${payload.summary.statusEntryCount}
- Intended runtime-switch entries: ${payload.summary.intendedRuntimeSwitchCount}
- Generated upload/verifier drift: ${payload.summary.generatedUploadDriftCount}
- Local artifact drift: ${payload.summary.localArtifactDriftCount}
- Risky unrelated drift: ${payload.summary.riskyUnrelatedDriftCount}
- Safe to proceed: ${payload.summary.safeToProceed}

${payload.entries.map((entry) => `- ${entry.raw}: ${entry.classification}`).join("\n") || "- none"}
`;
}

function renderDataReport(state) {
  return `# Runtime Switch Data Report

- Available records: ${state.availableItems.length}
- Deferred records hidden: ${state.deferredRecords.length}
- Previous root count: ${state.previousRootCount}
- Runtime root count: ${state.runtimeRootCount}
- Runtime WebP previews: ${state.assetPathRecords.length}
- Runtime internal SVG paths: ${state.assetPathRecords.length}
- PNG previews as primary runtime source: 0
- Thumbnails as primary runtime source: 0
- Empty hubs: ${state.emptyHubs.length}

The runtime manifests use clean uploaded object keys while leaving the original generated media and source files unchanged.
`;
}

function renderCountDiffReport(payload) {
  return `# Runtime Switch Count Diff

- Previous root count: ${payload.summary.previousRootCount}
- Runtime root count: ${payload.summary.runtimeRootCount}
- Deferred records hidden: ${payload.summary.deferredRecordsHidden}
- Empty hubs: ${payload.summary.emptyHubCount}

## Major Pages

${payload.majorPages.map((entry) => `- ${entry.path}: ${entry.previousCount} -> ${entry.runtimeCount} (${entry.hiddenDeferredCount} hidden)`).join("\n")}
`;
}

function renderReadinessReport(payload) {
  return `# Runtime Switch Readiness

- Runtime paths switched: ${payload.runtime_paths_switched}
- Available records: ${payload.available_records}
- Deferred records: ${payload.deferred_records}
- WebP gallery passed: ${payload.webp_gallery_passed}
- SVG conversion passed: ${payload.svg_conversion_passed}
- Downloads passed: ${payload.downloads_passed}
- Print passed: ${payload.print_passed}
- Sampled URL checks passed: ${payload.sampled_url_checks_passed}
- Ready for image sitemap: ${payload.ready_for_image_sitemap}
- Ready for OG images: ${payload.ready_for_og_images}
- Ready for live ads: ${payload.ready_for_live_ads}

Blockers:

${payload.blockers.map((blocker) => `- ${blocker}`).join("\n") || "- none"}
`;
}

function stripColoringPagesPrefix(objectKey) {
  if (!objectKey?.startsWith("coloring-pages/")) throw new Error(`Invalid object key: ${objectKey}`);
  return objectKey.slice("coloring-pages/".length);
}

function assertRuntimeSubpath(subpath, kind) {
  if (!subpath.startsWith(`${kind}/`)) throw new Error(`Invalid ${kind} runtime subpath: ${subpath}`);
  if (subpath.includes("coloring-pages/coloring-pages")) throw new Error(`Duplicate prefix in runtime subpath: ${subpath}`);
  if (subpath.includes("coloring/test-v1")) throw new Error(`Old test prefix in runtime subpath: ${subpath}`);
  if (/\/(?:png|thumbs)\//i.test(subpath)) throw new Error(`PNG/thumb path is not allowed: ${subpath}`);
}

function normalizeSearchTerm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, value) {
  await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, String(value).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"), "utf8");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const rootStat = statSync(root);
  if (rootStat.isFile()) return [slash(path.relative(REPO_ROOT, root))];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(slash(path.relative(REPO_ROOT, absolute)));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(file)) continue;
      if (file.startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

function git(commandArgs) {
  try {
    return execFileSync("git", commandArgs, { cwd: REPO_ROOT, encoding: "utf8" });
  } catch {
    return "";
  }
}

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}
