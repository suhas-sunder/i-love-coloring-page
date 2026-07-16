import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

import { applyPolicy } from "../scripts/apply-runtime-taxonomy-policy.mjs";
import { hasPromotionClusterConflict, selectClusteredHubIds } from "../lib/taxonomy-promotion-policy.mjs";

const ROOT = process.cwd();
const policy = await readJson("src/config/taxonomy-promotion-policy.json");
const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
const hubItems = await readJson("src/generated/coloring/runtime-hub-items.json");
const printables = await readJson("src/generated/coloring/runtime-printables.json");
const routes = await readJson("src/generated/coloring/runtime-routes.json");
const navigationPayload = await readJson("public/search-data/navigation.json");
const homeSource = await readText("app/page.tsx");
const gallerySource = await readText("app/coloring-pages/page.tsx");
const siteNavSource = await readText("src/lib/navigation/siteNav.ts");
const hubById = new Map(hubs.hubs.map((hub) => [hub.hubId, hub]));
const hubBySlug = new Map(hubs.hubs.map((hub) => [hub.slug, hub]));

test("taxonomy promotion policy preserves routed public inventory", () => {
  assert.equal(hubs.hubs.length, policy.preservationBaseline.publicHubCount);
  assert.equal(routes.routes.length, policy.preservationBaseline.publicHubCount);
  assert.equal(printables.records.length, policy.preservationBaseline.runtimePrintableCount);
  assert.equal(hashRouteFields(printables.records), policy.preservationBaseline.canonicalRouteFieldsSha256);
  assert.equal(hashMembership(hubs.hubs), policy.preservationBaseline.hubMembershipSha256);
  assert.equal(new Set(routes.routes.map((route) => route.path)).size, routes.routes.length);
  assert.equal(navigationPayload.c.length, policy.preservationBaseline.publicHubCount);
});

test("parent resolution applies only the approved corrections", () => {
  const expected = new Map(policy.parentOverrides.map((entry) => [entry.hubId, entry.parentHubId]));
  for (const [hubId, parentHubId] of expected) assert.equal(hubById.get(hubId)?.parentHubId, parentHubId);
  assert.equal(hubById.get("hub_buildings").childHubIds.includes("hub_bridges"), true);
  assert.equal(hubById.get("hub_buildings").childHubIds.includes("hub_world_landmarks"), true);
  assert.equal(hubById.get("hub_indoor_plants").childHubIds.includes("hub_palm"), true);
  assert.equal(hubById.get("hub_flowers").childHubIds.includes("hub_palm"), false);
  for (const hub of hubs.hubs) {
    if (hub.parentHubId) assert.ok(hubById.has(hub.parentHubId), `${hub.hubId}: ${hub.parentHubId}`);
  }
  const circularPairs = hubs.hubs.flatMap((hub) => {
    const parent = hubById.get(hub.parentHubId);
    return parent?.parentHubId === hub.hubId ? [[hub.hubId, parent.hubId].sort().join("|")] : [];
  });
  assert.deepEqual([...new Set(circularPairs)], ["hub_detailed_for_adults|hub_mandalas"]);
});

test("related-hub clusters are bounded, deterministic, and exclude exact duplicate reinforcement", async () => {
  for (const record of printables.records) {
    assert.equal(new Set(record.relatedHubIds).size, record.relatedHubIds.length, record.assetId);
    assert.equal(record.relatedHubIds.includes(record.primaryHubId), false, record.assetId);
    assert.equal(hasPromotionClusterConflict(record.relatedHubIds, policy, record.primaryHubId), false, record.assetId);
    assert.equal(record.primaryHubId === "hub_detailed_for_adults" && record.relatedHubIds.includes("hub_mandalas"), false, record.assetId);
    for (const hubId of record.relatedHubIds) assert.ok(hubById.has(hubId), `${record.assetId}: ${hubId}`);
  }
  for (const hub of hubs.hubs) {
    assert.equal(hasPromotionClusterConflict(hub.relatedHubIds, policy, hub.hubId), false, hub.hubId);
    assert.equal(hub.relatedHubIds.includes(hub.hubId), false, hub.hubId);
  }
  const fixture = ["hub_mandalas", "hub_animals", "hub_geometric", "hub_detailed_for_adults"];
  const first = selectClusteredHubIds(fixture, { policy, limit: 8 });
  const second = selectClusteredHubIds(fixture, { policy, limit: 8 });
  assert.deepEqual(first, second);
  assert.deepEqual(first, ["hub_detailed_for_adults", "hub_animals"]);
  const implementation = await readText("pipeline/scripts/build-runtime-printables.mjs");
  assert.doesNotMatch(implementation, /internal-linking\.json/);
});

test("thin-hub exposure requires direct relevance and never exceeds the approved baseline", () => {
  const thinById = new Map(hubs.hubs.filter((hub) => hub.assetCount <= policy.thinHubMaximumAssets).map((hub) => [hub.hubId, hub]));
  const exposure = new Map([...thinById].map(([hubId]) => [hubId, 0]));
  for (const record of printables.records) {
    const thinRelated = record.relatedHubIds.filter((hubId) => thinById.has(hubId));
    assert.ok(thinRelated.length <= policy.maximumThinHubsPerRelatedList, record.assetId);
    for (const hubId of thinRelated) {
      assert.equal(record.hubIds.includes(hubId), true, `${record.assetId}: ${hubId}`);
      exposure.set(hubId, exposure.get(hubId) + 1);
    }
    assert.ok(record.relatedHubIds.length > 0, record.assetId);
  }
  for (const [hubId, hub] of thinById) {
    const before = policy.thinHubExposureBaseline[hub.slug];
    assert.ok(Number.isInteger(before), hub.slug);
    assert.ok(exposure.get(hubId) <= before, `${hub.slug}: ${exposure.get(hubId)} > ${before}`);
  }
});

test("navigation deduplication keeps canonical paths unique and St. Patrick's Day discoverable", async () => {
  const nav = await importSiteNav();
  const desktopDirect = nav.desktopPrimaryItems.filter((item) => item.kind === "link").map((item) => item.href);
  const categories = nav.categoryNavigationGroups.flatMap((group) => group.links.map((link) => link.href));
  const seasonal = nav.seasonalNavigationLinks.map((link) => link.href);
  const mobile = [...nav.mobileDirectLinks, ...nav.mobileNavigationGroups.flatMap((group) => group.links)].map((link) => link.href);
  assert.equal(new Set([...desktopDirect, ...categories, ...seasonal]).size, desktopDirect.length + categories.length + seasonal.length);
  assert.equal(new Set(mobile).size, mobile.length);
  assert.equal(categories.length <= 21, true);
  assert.deepEqual(seasonal, ["/coloring-pages/christmas", "/coloring-pages/halloween"]);
  assert.equal([...desktopDirect, ...categories, ...seasonal, ...mobile].includes("/coloring-pages/st-patricks-day"), false);
  for (const href of [...desktopDirect, ...categories, ...seasonal, ...mobile]) {
    if (["/", "/coloring-pages"].includes(href)) continue;
    assert.ok(hubs.hubs.some((hub) => hub.route === href), href);
  }
  assert.ok(routes.routes.some((route) => route.path === "/coloring-pages/st-patricks-day"));
  assert.ok(navigationPayload.c.some((record) => record[2] === "/coloring-pages/st-patricks-day"));
});

test("homepage promotion is differentiated and route-valid", () => {
  const primary = parseStringArray(homeSource, "PRIMARY_COLLECTION_SLUGS");
  const discovery = parseStringArray(homeSource, "DISCOVERY_COLLECTION_SLUGS");
  assert.deepEqual(primary, ["animals", "christmas", "for-kids", "detailed-for-adults", "dogs", "plushies"]);
  assert.equal(primary.includes("mandalas"), false);
  assert.equal(primary.includes("geometric"), false);
  assert.equal(primary.includes("easy"), false);
  assert.equal(discovery.includes("easy"), true);
  assert.deepEqual(primary.filter((slug) => discovery.includes(slug)), []);
  const promoted = primary.map((slug) => hubBySlug.get(slug));
  assert.equal(promoted.every((hub) => hub?.route && hub.indexable && hub.sitemap && hub.assetCount >= policy.homepageMinimumAssets), true);
  for (let left = 0; left < promoted.length; left += 1) {
    for (let right = left + 1; right < promoted.length; right += 1) {
      assert.ok(jaccard(promoted[left].assetIds, promoted[right].assetIds) < 0.9, `${promoted[left].slug}/${promoted[right].slug}`);
    }
  }
  const supporting = parseStringArray(gallerySource, "SUPPORTING_HUB_SLUGS");
  assert.equal(supporting.includes("mandalas") && supporting.includes("detailed-for-adults"), false);
});

test("route preservation keeps hub membership and reverse mappings identical", () => {
  const reverse = new Map(hubs.hubs.map((hub) => [hub.hubId, []]));
  for (const entry of hubItems.items) for (const hubId of entry.hubIds) reverse.get(hubId)?.push(entry.assetId);
  for (const hub of hubs.hubs) {
    assert.deepEqual([...new Set(reverse.get(hub.hubId) || [])].sort(), [...hub.assetIds].sort(), hub.hubId);
  }
  assert.equal(hashRouteFields(printables.records), policy.preservationBaseline.canonicalRouteFieldsSha256);
});

test("taxonomy determinism produces identical policy output on repeated application", () => {
  const first = applyPolicy(hubs, policy);
  const second = applyPolicy(first, policy);
  assert.deepEqual(second, first);
});

function hashRouteFields(records) {
  return sha256(records.map(({ assetId, stableId, canonicalSlug, primaryHubId, primaryCategorySlug, slugAndId, canonicalPath }) => ({ assetId, stableId, canonicalSlug, primaryHubId, primaryCategorySlug, slugAndId, canonicalPath })));
}

function hashMembership(records) {
  return sha256(records.map(({ hubId, assetIds }) => ({ hubId, assetIds })));
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((value) => b.has(value)).length;
  return intersection / (a.size + b.size - intersection);
}

function parseStringArray(source, name) {
  const match = new RegExp(`const ${name} = \\[([^\\]]+)\\]`).exec(source);
  assert.ok(match, name);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

async function importSiteNav() {
  const source = siteNavSource.replace(/import \{ footerTrustLinks \}[^;]+;/, "const footerTrustLinks = [];");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}
