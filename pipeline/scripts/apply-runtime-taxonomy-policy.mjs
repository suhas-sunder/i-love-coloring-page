#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { selectClusteredHubIds } from "../lib/taxonomy-promotion-policy.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..", "..");
export const TAXONOMY_POLICY_PATH = "src/config/taxonomy-promotion-policy.json";
export const RUNTIME_HUBS_PATH = "src/generated/coloring/runtime-hubs.json";
const GENERATED_PATHS = {
  hubItems: "src/generated/coloring/runtime-hub-items.json",
  searchIndex: "src/generated/coloring/runtime-search-index.json",
  routes: "src/generated/coloring/runtime-routes.json",
  siteMap: "src/generated/coloring/runtime-site-map.json",
  featured: "src/generated/coloring/runtime-hub-featured-items.json",
  filters: "src/generated/coloring/runtime-hub-filter-tags.json",
  indexation: "src/config/indexation-manifest.json",
};

export async function applyRuntimeTaxonomyPolicy({ repoRoot = DEFAULT_ROOT, write = true } = {}) {
  const policy = await readJson(repoRoot, TAXONOMY_POLICY_PATH);
  const inputs = {
    hubs: await readJson(repoRoot, RUNTIME_HUBS_PATH),
    hubItems: await readJson(repoRoot, GENERATED_PATHS.hubItems),
    searchIndex: await readJson(repoRoot, GENERATED_PATHS.searchIndex),
    routes: await readJson(repoRoot, GENERATED_PATHS.routes),
    siteMap: await readJson(repoRoot, GENERATED_PATHS.siteMap),
    featured: await readJson(repoRoot, GENERATED_PATHS.featured),
    filters: await readJson(repoRoot, GENERATED_PATHS.filters),
    indexation: await readJson(repoRoot, GENERATED_PATHS.indexation),
  };
  const output = applyPolicy(inputs.hubs, policy);
  const derived = rebuildDerivedManifests(inputs, output, policy);
  if (write) {
    await Promise.all([
      writeJson(repoRoot, RUNTIME_HUBS_PATH, output),
      ...Object.entries(derived).map(([key, value]) => writeJson(repoRoot, GENERATED_PATHS[key], value)),
    ]);
  }
  return { policy, output, derived };
}

export function applyPolicy(source, policy) {
  const output = structuredClone(source);
  const hubById = new Map(output.hubs.map((hub) => [hub.hubId, hub]));
  applyMembershipCorrections(hubById);
  applyParentOverrides(output.hubs, hubById, policy.parentOverrides);
  applyIndexationDecisions(hubById, policy.indexationDecisions || []);
  rebuildChildrenAndBreadcrumbs(output.hubs, hubById);

  const publicHubIds = new Set(output.hubs.filter((hub) => hub.indexable && hub.sitemap).map((hub) => hub.hubId));
  for (const hub of output.hubs) {
    const family = [hub.parentHubId, ...(hub.childHubIds || [])].filter((hubId) => publicHubIds.has(hubId));
    const candidates = [...family, ...(hub.relatedHubIds || []), ...(hub.internalLinkingTargets || [])]
      .filter((hubId) => publicHubIds.has(hubId) && hubId !== hub.hubId);
    hub.relatedHubIds = selectClusteredHubIds(candidates, { currentHubId: hub.hubId, limit: 8, policy });
    hub.internalLinkingTargets = [...hub.relatedHubIds];
    hub.assetCount = new Set(hub.assetIds).size;
    hub.featuredAssetIds = fillDeterministicIds(hub.featuredAssetIds, hub.assetIds, 12);
    const previewLimit = hub.route === "/coloring-pages" ? Math.max(hub.galleryPageSize, 48) : hub.galleryPageSize;
    hub.previewAssetIds = fillDeterministicIds(hub.previewAssetIds, hub.assetIds, previewLimit);
  }

  validateGraph(output.hubs);
  const membershipHash = hashMembership(output.hubs);
  if (membershipHash !== policy.preservationBaseline.hubMembershipSha256) {
    throw new Error(`Hub membership does not match approved policy v${policy.version}: ${membershipHash}`);
  }
  output.summary = {
    ...output.summary,
    taxonomyPromotionPolicyVersion: policy.version,
    taxonomyPromotionPolicy: TAXONOMY_POLICY_PATH,
    parentOverrideCount: policy.parentOverrides.length,
    membershipCorrectionCount: policy.membershipCorrections.length,
    activeIndexationDecisionCount: policy.indexationDecisions.length,
    indexableHubCount: output.hubs.filter((hub) => hub.indexable).length,
    sitemapHubCount: output.hubs.filter((hub) => hub.sitemap).length,
  };
  return output;
}

function applyMembershipCorrections(hubById) {
  const adults = required(hubById.get("hub_detailed_for_adults"), "Missing Detailed for Adults hub");
  const descriptiveSlug = (assetId) => (assetId.split("__")[1] || "").replace(/^mandala-geometry-patterns-/, "");
  const selections = new Map([
    ["hub_detailed_for_adults", [...adults.assetIds]],
    ["hub_mandalas", adults.assetIds.filter((assetId) => /mandala/.test(descriptiveSlug(assetId)))],
    ["hub_geometric", adults.assetIds.filter((assetId) => /(?:geometric|geometry|pattern|abstract|kaleidoscope|fractal|spiral|celtic-knot)/.test(descriptiveSlug(assetId)))],
  ]);
  for (const [hubId, assetIds] of selections) {
    const hub = required(hubById.get(hubId), `Missing membership-correction hub: ${hubId}`);
    hub.assetIds = [...new Set(assetIds)];
    hub.assetCount = hub.assetIds.length;
  }
}

function applyParentOverrides(hubs, hubById, overrides) {
  for (const override of overrides) {
    const hub = required(hubById.get(override.hubId), `Missing parent-override hub: ${override.hubId}`);
    required(hubById.get(override.parentHubId), `Missing replacement parent: ${override.parentHubId}`);
    hub.parentHubId = override.parentHubId;
  }
  const root = required(hubs.find((hub) => hub.route === "/coloring-pages"), "Missing root hub");
  root.parentHubId = null;
}

function applyIndexationDecisions(hubById, decisions) {
  for (const decision of decisions) {
    const hub = required(hubById.get(decision.hubId), `Missing indexation-decision hub: ${decision.hubId}`);
    hub.indexable = decision.indexable;
    hub.sitemap = decision.sitemap;
    hub.consolidationTargetHubId = decision.consolidationTargetHubId;
  }
}

function rebuildChildrenAndBreadcrumbs(hubs, hubById) {
  for (const hub of hubs) hub.childHubIds = [];
  for (const hub of hubs) {
    if (!hub.parentHubId) continue;
    const parent = required(hubById.get(hub.parentHubId), `Unresolved parent: ${hub.hubId} -> ${hub.parentHubId}`);
    parent.childHubIds.push(hub.hubId);
  }
  for (const hub of hubs) {
    const ancestors = [];
    const visited = new Set([hub.hubId]);
    let current = hub;
    while (current.parentHubId) {
      if (visited.has(current.parentHubId)) throw new Error(`Collection-parent cycle: ${[...visited, current.parentHubId].join(" -> ")}`);
      visited.add(current.parentHubId);
      current = required(hubById.get(current.parentHubId), `Unresolved parent: ${current.parentHubId}`);
      ancestors.unshift(current);
    }
    hub.breadcrumbPath = [
      ...ancestors.map((ancestor) => ({ label: collectionLabel(ancestor.title), route: ancestor.route })),
      { label: collectionLabel(hub.title), route: "" },
    ].filter((entry, index, entries) => index === 0 || entry.route !== entries[index - 1].route);
  }
}

function rebuildDerivedManifests(inputs, hubsManifest, policy) {
  const hubById = new Map(hubsManifest.hubs.map((hub) => [hub.hubId, hub]));
  const orderedHubIds = hubsManifest.hubs.map((hub) => hub.hubId);
  const membership = new Map(hubsManifest.hubs.map((hub) => [hub.hubId, new Set(hub.assetIds)]));
  const rewriteIds = (entry) => orderedHubIds.filter((hubId) => membership.get(hubId)?.has(entry.assetId));
  const hubItems = {
    ...inputs.hubItems,
    runId: "runtime-hub-architecture-v2",
    summary: {
      ...inputs.hubItems.summary,
      phase1HubAssignments: inputs.hubItems.items.reduce((sum, entry) => sum + rewriteIds(entry).length, 0),
      taxonomyPromotionPolicyVersion: policy.version,
    },
    items: inputs.hubItems.items.map((entry) => ({ ...entry, hubIds: rewriteIds(entry) })),
  };
  const hubIdsByAsset = new Map(hubItems.items.map((entry) => [entry.assetId, entry.hubIds]));
  const searchIndex = {
    ...inputs.searchIndex,
    runId: "runtime-search-index-hub-architecture-v2",
    entries: inputs.searchIndex.entries.map((entry) => ({ ...entry, hubIds: hubIdsByAsset.get(entry.assetId) || [] })),
  };
  const routes = {
    ...inputs.routes,
    runId: "runtime-routes-hub-architecture-v2",
    routes: inputs.routes.routes.map((route) => {
      const hub = required(hubById.get(route.hubId), `Missing route hub: ${route.hubId}`);
      return { ...route, indexable: hub.indexable, sitemap: hub.sitemap, assetCount: hub.assetCount };
    }),
  };
  const sitemapPaths = new Set(routes.routes.filter((route) => route.sitemap).map((route) => route.path));
  const siteMap = {
    ...inputs.siteMap,
    runId: "runtime-site-map-hub-architecture-v2",
    entries: inputs.siteMap.entries.filter((entry) => !entry.path.startsWith("/coloring-pages/") || sitemapPaths.has(entry.path)),
    summary: { ...inputs.siteMap.summary, activeHubEntryCount: sitemapPaths.size },
  };
  const featured = {
    ...inputs.featured,
    runId: "runtime-featured-hub-architecture-v2",
    hubs: inputs.featured.hubs.map((entry) => {
      const hub = required(hubById.get(entry.hubId), `Missing featured hub: ${entry.hubId}`);
      return { ...entry, assetCount: hub.assetCount, assetIds: fillDeterministicIds(entry.assetIds, hub.assetIds, 12) };
    }),
  };
  const searchById = new Map(searchIndex.entries.map((entry) => [entry.assetId, entry]));
  const filters = {
    ...inputs.filters,
    runId: "runtime-filters-hub-architecture-v2",
    hubs: inputs.filters.hubs.map((entry) => {
      const hub = required(hubById.get(entry.hubId), `Missing filter hub: ${entry.hubId}`);
      const tags = entry.tags
        .map((tag) => ({ ...tag, assetCount: hub.assetIds.filter((assetId) => searchById.get(assetId)?.tags?.includes(tag.id)).length }))
        .filter((tag) => tag.assetCount > 0);
      const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
      return {
        ...entry,
        assetCount: hub.assetCount,
        tags,
        tabs: entry.tabs.filter((tab) => tagsById.has(tab.id)).map((tab) => ({ ...tab, assetCount: tagsById.get(tab.id).assetCount })),
      };
    }),
  };
  const unresolvedManualIds = new Set();
  const correctionIds = new Set((policy.membershipCorrections || []).map((entry) => entry.hubId));
  const decisionById = new Map((policy.indexationDecisions || []).map((entry) => [entry.hubId, entry]));
  const resolutionById = new Map((policy.manualReviewResolutions || []).map((entry) => [entry.hubId, entry]));
  const previousById = new Map(inputs.indexation.hubs.map((entry) => [entry.hubId, entry]));
  const indexation = {
    ...inputs.indexation,
    schemaVersion: 2,
    reviewedOn: "2026-07-18",
    activated: true,
    note: "Runtime taxonomy policy v2 consumes resolved decisions. Easy remains public but noindex pending reviewed complexity evidence; For Kids remains indexable without per-record age, safety, or difficulty claims.",
    hubs: hubsManifest.hubs.map((hub) => {
      const previous = previousById.get(hub.hubId) || {};
      const decision = decisionById.get(hub.hubId);
      const resolution = resolutionById.get(hub.hubId);
      const unresolved = unresolvedManualIds.has(hub.hubId);
      return {
        ...previous,
        hubId: hub.hubId,
        route: hub.route,
        currentIndexable: hub.indexable,
        currentSitemapInclusion: hub.sitemap,
        recommendation: decision ? "retain publicly but noindex" : unresolved ? "manual editorial review" : "retain and index",
        consolidationTarget: decision?.consolidationTargetHubId || null,
        redirectTarget: null,
        proposedSitemapInclusion: hub.sitemap,
        rationale: decision?.rationale || resolution?.rationale || (correctionIds.has(hub.hubId) ? "Corrected membership now represents a distinct, evidence-backed browsing intent." : previous.rationale),
        dateReviewed: "2026-07-18",
        activated: !unresolved,
      };
    }),
  };
  return { hubItems, searchIndex, routes, siteMap, featured, filters, indexation };
}

export function validateGraph(hubs) {
  const hubById = new Map(hubs.map((hub) => [hub.hubId, hub]));
  for (const hub of hubs) {
    const visited = new Set([hub.hubId]);
    let current = hub;
    while (current.parentHubId) {
      if (visited.has(current.parentHubId)) throw new Error(`Collection-parent cycle includes ${hub.hubId}`);
      visited.add(current.parentHubId);
      current = required(hubById.get(current.parentHubId), `Unresolved parent: ${current.parentHubId}`);
    }
    for (const childId of hub.childHubIds || []) {
      const child = required(hubById.get(childId), `Unresolved child: ${childId}`);
      if (child.parentHubId !== hub.hubId) throw new Error(`Parent/child mismatch: ${hub.hubId} -> ${childId}`);
    }
  }
}

function fillDeterministicIds(preferred, available, limit) {
  const allowed = new Set(available);
  return [...new Set([...(preferred || []).filter((assetId) => allowed.has(assetId)), ...available])].slice(0, limit);
}

function hashMembership(hubs) {
  return createHash("sha256").update(JSON.stringify(hubs.map((hub) => ({ hubId: hub.hubId, assetIds: hub.assetIds })))).digest("hex");
}

function collectionLabel(title) {
  return title.replace(/ Coloring Pages$/i, "");
}

function required(value, message) {
  if (value == null) throw new Error(message);
  return value;
}

async function readJson(repoRoot, relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function writeJson(repoRoot, relativePath, value) {
  await writeFile(path.join(repoRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

if (path.resolve(process.argv[1] || "") === SCRIPT_PATH) {
  applyRuntimeTaxonomyPolicy()
    .then(({ output }) => console.log(JSON.stringify(output.summary, null, 2)))
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
