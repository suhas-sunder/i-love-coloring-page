import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
const routes = await readJson("src/generated/coloring/runtime-routes.json");
const sitemap = await readJson("src/generated/coloring/runtime-site-map.json");
const editorial = await readJson("src/config/hub-editorial-content.json");
const indexation = await readJson("src/config/indexation-manifest.json");
const hubItems = await readJson("src/generated/coloring/runtime-hub-items.json");
const byId = new Map(hubs.hubs.map((hub) => [hub.hubId, hub]));

test("the complete collection graph is acyclic and bidirectionally consistent", () => {
  for (const hub of hubs.hubs) {
    const seen = new Set([hub.hubId]);
    let current = hub;
    while (current.parentHubId) {
      assert.equal(seen.has(current.parentHubId), false, `cycle from ${hub.hubId}`);
      seen.add(current.parentHubId);
      current = byId.get(current.parentHubId);
      assert.ok(current, `missing parent for ${hub.hubId}`);
    }
    for (const childId of hub.childHubIds) assert.equal(byId.get(childId)?.parentHubId, hub.hubId);
  }
  assert.equal(byId.get("hub_detailed_for_adults").parentHubId, "hub_coloring_pages");
  assert.equal(byId.get("hub_mandalas").parentHubId, "hub_detailed_for_adults");
  assert.equal(byId.get("hub_geometric").parentHubId, "hub_detailed_for_adults");
});

test("adult, mandala, and geometric memberships follow descriptive source evidence", () => {
  const adults = byId.get("hub_detailed_for_adults");
  const mandalas = byId.get("hub_mandalas");
  const geometric = byId.get("hub_geometric");
  assert.equal(adults.assetCount, 1459);
  assert.equal(mandalas.assetCount, 23);
  assert.equal(geometric.assetCount, 55);
  assert.equal(mandalas.assetIds.every((id) => id.split("__")[1].includes("mandala")), true);
  assert.equal(geometric.assetIds.every((id) => /(?:geometric|geometry|pattern|abstract|kaleidoscope|fractal|spiral|celtic-knot)/.test(id.split("__")[1])), true);
  assert.notDeepEqual(mandalas.assetIds, adults.assetIds);
  assert.notDeepEqual(geometric.assetIds, adults.assetIds);
});

test("hub memberships and reverse mappings agree after source corrections", () => {
  const reverse = new Map(hubs.hubs.map((hub) => [hub.hubId, []]));
  for (const entry of hubItems.items) for (const hubId of entry.hubIds) reverse.get(hubId)?.push(entry.assetId);
  for (const hub of hubs.hubs) {
    assert.deepEqual([...new Set(reverse.get(hub.hubId) || [])].sort(), [...hub.assetIds].sort(), hub.hubId);
    assert.equal(hub.assetCount, new Set(hub.assetIds).size);
  }
});

test("consolidated variants remain self-canonical public routes but leave index and sitemap", () => {
  const sitemapPaths = new Set(sitemap.entries.map((entry) => entry.path));
  for (const [hubId, target] of [["hub_birthday_celebration", "hub_birthday"], ["hub_woolly_mammoth", "hub_mammoths"]]) {
    const hub = byId.get(hubId);
    const route = routes.routes.find((entry) => entry.hubId === hubId);
    const manifest = indexation.hubs.find((entry) => entry.hubId === hubId);
    assert.equal(hub.indexable, false);
    assert.equal(hub.sitemap, false);
    assert.equal(route.indexable, false);
    assert.equal(route.sitemap, false);
    assert.equal(sitemapPaths.has(hub.route), false);
    assert.equal(manifest.consolidationTarget, target);
    assert.equal(manifest.redirectTarget, null);
    assert.equal(manifest.activated, true);
  }
});

test("every retained hub has explicit tier-appropriate editorial content", () => {
  assert.equal(Object.keys(editorial.hubs).length, hubs.hubs.length);
  const introductions = [];
  for (const hub of hubs.hubs) {
    const record = editorial.hubs[hub.hubId];
    assert.ok(record?.introduction, hub.hubId);
    assert.equal(record.tier, hub.contentTier);
    assert.equal(hub.intro, record.introduction);
    if (hub.indexable) introductions.push(record.introduction.toLowerCase().replace(/\s+/g, " ").trim());
    if (record.tier === "A") {
      assert.ok(record.scope, hub.hubId);
      assert.ok(record.distinction, hub.hubId);
      assert.ok(record.selectionGuidance, hub.hubId);
    }
  }
  assert.equal(new Set(introductions).size, introductions.length);
});

test("navigation is unified, count-backed, and excludes obsolete catch-all and consolidated routes", async () => {
  const nav = await readText("src/lib/navigation/siteNav.ts");
  const header = await readText("src/components/site/SiteHeader.tsx");
  const mobile = await readText("src/components/site/MobileNav.tsx");
  assert.doesNotMatch(`${nav}\n${header}\n${mobile}`, /viewAllCollectionsLink|View all collections/);
  assert.match(nav, /mobileNavigationGroups[\s\S]+categoryNavigationGroups\.map/);
  assert.doesNotMatch(nav, /birthday-celebration|woolly-mammoth/);
  assert.match(nav, /getCollectionCountById/);
});

test("hub metadata uses self canonicals and explicit noindex directives", async () => {
  const metadata = await readText("src/lib/coloring/metadata.ts");
  const hubPage = await readText("app/coloring-pages/[hubSlug]/page.tsx");
  assert.match(metadata, /indexable === false \? \{ index: false, follow: true \}/);
  assert.match(hubPage, /indexable: hub\.indexable/);
  assert.doesNotMatch(metadata, /consolidationTarget|redirect/);
});

test("hub metadata titles are route-specific and receive the site suffix only once", () => {
  assert.equal(byId.get("hub_coloring_pages").metaTitle, "Printable Coloring Pages");
  assert.equal(byId.get("hub_detailed_for_adults").metaTitle, "Detailed Coloring Pages for Adults");
  assert.equal(byId.get("hub_for_kids").metaTitle, "Coloring Pages for Kids");
  assert.equal(byId.get("hub_mandalas").metaTitle, "Mandalas Coloring Pages");
  for (const hub of hubs.hubs) {
    assert.doesNotMatch(hub.metaTitle, /\|\s*I Love Coloring Page/i, hub.route);
    assert.doesNotMatch(hub.metaTitle, /Coloring Pages for Adults Coloring Pages/i, hub.route);
  }
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
