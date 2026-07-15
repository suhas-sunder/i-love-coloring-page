import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = process.cwd();
const siteNav = await readText("src/lib/navigation/siteNav.ts");
const siteHeader = await readText("src/components/site/SiteHeader.tsx");
const mobileNav = await readText("src/components/site/MobileNav.tsx");
const globalSearch = await readText("src/components/site/GlobalSearchDialog.tsx");
const navigationSearchData = await readText("src/lib/search/navigationSearchData.ts");
const gallerySearch = await readText("src/components/coloring/GallerySearch.tsx");
const galleryFilters = await readText("src/components/coloring/GalleryFilters.tsx");
const overlayProvider = await readText("src/components/site/SiteInteractionProvider.tsx");
const modalHook = await readText("src/hooks/useModalDialog.ts");
const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
const routes = await readJson("src/generated/coloring/runtime-routes.json");
const printables = await readJson("src/generated/coloring/runtime-printables.json");
const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
const navigationPayload = await readJson("public/search-data/navigation.json");
const ranking = await importTypeScript("src/lib/search/ranking.ts");

test("navigation model owns approved routes, labels, groups, and route relationships", () => {
  const routedHubs = new Map(hubs.hubs.map((hub) => [hub.route, hub]));
  const configuredHubs = [...siteNav.matchAll(/\w+: hub\("([^"]+)", "([^"]+)", "([^"]+)", "([^"]+)", (\d+)\)/g)]
    .map(([, id, label, href, hubId, count]) => ({ id, label, href, hubId, count: Number(count) }));
  assert.equal(configuredHubs.length, 21);
  for (const link of configuredHubs) {
    const hub = routedHubs.get(link.href);
    assert.ok(hub, link.href);
    assert.equal(hub.hubId, link.hubId, link.href);
    assert.equal(hub.assetCount, link.count, link.href);
    assert.equal(hub.indexable, true, link.href);
    assert.equal(hub.sitemap, true, link.href);
    assert.equal(hubs.backlogHubs.some((entry) => entry.slug === hub.slug), false, link.href);
    assert.equal(hubs.sectionOnlyTopics.some((entry) => entry.slug === hub.slug), false, link.href);
    assert.doesNotMatch(link.href, /[?#]|\/page\/|\.(?:svg|webp|png)$/i);
    assert.ok(link.label.trim().length > 0);
  }
  assert.deepEqual(configuredHubs.filter((link) => ["christmas", "halloween", "st-patricks-day"].includes(link.id)).map((link) => link.id), ["christmas", "halloween", "st-patricks-day"]);
  assert.match(siteNav, /label: "Popular"[\s\S]*label: "Browse by audience"[\s\S]*label: "Subjects"[\s\S]*label: "Seasonal and occasions"/);
  assert.match(siteNav, /getActivePrimaryNavigationId/);
  assert.doesNotMatch(siteNav, /includes\(.*pathname|pathname\.includes/);
});

test("desktop header follows the six-item order and disclosure contract", () => {
  assertOrder(siteNav, ['label: "Coloring Pages"', 'label: "Categories"', 'label: "For Kids"', 'label: "For Adults"', 'label: "Seasonal"', 'label: "Search"']);
  assert.match(siteHeader, /aria-expanded=\{isOpen\}/);
  assert.match(siteHeader, /aria-controls=\{panelId\}/);
  assert.match(siteHeader, /event\.key !== "Escape"/);
  assert.match(siteHeader, /pointerdown/);
  assert.match(siteHeader, /requestAnimationFrame\(\(\) => trigger\?\.focus\(\)\)/);
  assert.match(siteHeader, /aria-current=\{isExactNavigationPath/);
  assert.doesNotMatch(siteHeader, />More<|MoreHubMenu|role="menu"|PageAdSlot|AdSlot|Advertisement/);
  assert.match(siteHeader, /prefetch=\{false\}/);
});

test("mobile navigation is finite, ordered, modal, and advertisement-free", () => {
  const mobileModel = siteNav.slice(siteNav.indexOf("export const mobileDirectLinks"), siteNav.indexOf("export const viewAllCollectionsLink"));
  assertOrder(mobileModel, ['direct("home", "Home"', 'links.coloringPages', 'direct("for-kids-mobile", "For Kids"', 'direct("for-adults-mobile", "For Adults"', 'label: "Seasonal collections"', 'label: "Popular categories"', 'label: "More categories"']);
  assert.match(mobileNav, /role="dialog" aria-modal="true"/);
  assert.match(mobileNav, /initialFocusRef: closeButtonRef/);
  assert.match(mobileNav, /useModalDialog/);
  assert.match(mobileNav, /closeAndRestore/);
  assert.match(mobileNav, /<details className="mobile-nav-group"/);
  assert.match(mobileNav, /viewAllCollectionsLink/);
  assert.doesNotMatch(mobileNav, /PageAdSlot|AdSlot|Advertisement|navigation\.json|163/);
});

test("navigation search data is compact, complete, deterministic, and public-safe", async () => {
  assert.equal(navigationPayload.v, 2);
  assert.equal(navigationPayload.p.length, 6352);
  assert.equal(navigationPayload.p.length, printables.records.length);
  assert.equal(navigationPayload.c.length, routes.routes.filter((route) => route.indexable && route.sitemap).length);
  assert.equal(navigationPayload.c.length, 163);
  assert.equal(new Set(navigationPayload.p.map((record) => record[2])).size, navigationPayload.p.length);
  assert.equal(new Set(navigationPayload.c.map((record) => record[2])).size, navigationPayload.c.length);
  assert.equal(navigationPayload.p.every((record) => record.length === 6 && /^[0-9a-f]{10}$/.test(record[0]) && /^\/printables\//.test(record[2]) && /^webp\/.+\.webp$/.test(record[3])), true);
  assert.equal(navigationPayload.c.every((record) => record.length === 5 && /^\/coloring-pages(?:\/|$)/.test(record[2]) && Number.isInteger(record[3])), true);
  const text = await readText("public/search-data/navigation.json");
  assert.doesNotMatch(text, /\.svg\b|localhost|127\.0\.0\.1|[A-Za-z]:\\|r2\.dev|cloudflarestorage|amazonaws/i);
  const deferredStableIds = new Set(deferred.records.map((record) => record.assetId.split("__").at(-1)));
  assert.equal(navigationPayload.p.some((record) => deferredStableIds.has(record[0])), false);
  assert.ok((await stat(path.join(ROOT, "public/search-data/navigation.json"))).size < 2_500_000);
  const manifest = await readJson("pipeline/manifests/static-search-data-manifest.json");
  assert.equal(manifest.summary.navigationSha256, sha256(text));
});

test("shared search ranking follows documented classes and stable tie-breaking", () => {
  const records = [
    { title: "Cat", stableKey: "b" },
    { title: "Cat Garden", stableKey: "a" },
    { title: "Garden Cat", stableKey: "c" },
    { title: "Dog", stableKey: "d", searchTerms: "cat" },
  ];
  assert.deepEqual(ranking.rankSearchItems(records, "cat").map((result) => result.item.stableKey), ["b", "a", "c", "d"]);
  assert.equal(ranking.rankSearchItems([{ title: "St. Patrick’s Day", stableKey: "a" }], "st patricks-day")[0].rankClass, 1);
  assert.equal(ranking.normalizeSearchText("  Café—Mándala  "), "cafe mandala");
  assert.deepEqual(ranking.rankSearchItems([
    { title: "Blue Flower", stableKey: "b" },
    { title: "Blue Flower", stableKey: "a" },
  ], "blue flower").map((result) => result.item.stableKey), ["a", "b"]);
  assert.equal(ranking.rankSearchItems([{ title: "Animals", stableKey: "hub_animals", normalizedText: "animals coloring pages" }], "animals")[0].item.stableKey, "hub_animals");
  assert.deepEqual(ranking.rankSearchItems([{ title: "Dog", stableKey: "safe", filename: "secret-cat", assetId: "cat" }], "secret cat"), []);
});

test("global search loads after intent, caps results, and keeps canonical links", () => {
  assert.match(globalSearch, /normalizedQuery\.length >= 2/);
  assert.match(globalSearch, /loadNavigationSearchData\(\)/);
  assert.match(globalSearch, /loadState !== "idle"/);
  assert.match(navigationSearchData, /NAVIGATION_SEARCH_TIMEOUT_MS = 8_000/);
  assert.match(navigationSearchData, /AbortController/);
  assert.match(navigationSearchData, /cache: "no-store"/);
  assert.match(globalSearch, /\.slice\(0, 6\)/);
  assert.match(globalSearch, /\.slice\(0, 8\)/);
  assert.match(globalSearch, /prefetch=\{false\}/);
  assert.match(globalSearch, /result\.path/);
  assert.match(globalSearch, /Try again/);
  assert.match(siteHeader, /searchOpenerRef\.current = trigger/);
  assert.match(siteHeader, /restoreFocusAfterModalClose\(trigger\)/);
  assert.doesNotMatch(globalSearch, />Print<|>Download<|\.svg|\?q=|location\.hash|sessionStorage|PageAdSlot|Advertisement/);
});

test("gallery and hub search share ranking, scope data, and batch 48 results", async () => {
  assert.match(gallerySearch, /rankSearchItems/);
  assert.match(gallerySearch, /INTERACTIVE_RESULT_BATCH_SIZE = 48/);
  assert.match(gallerySearch, /count \+ INTERACTIVE_RESULT_BATCH_SIZE/);
  assert.match(gallerySearch, />Show more</);
  assert.match(gallerySearch, /setVisibleCount\(INTERACTIVE_RESULT_BATCH_SIZE\)/);
  assert.match(gallerySearch, /isStaticPageView && pagination/);
  assert.match(gallerySearch, /requestRef\.current\?\.abort\(\)/);
  assert.match(gallerySearch, /cache: retry \? "no-store" : "force-cache"/);
  assert.doesNotMatch(gallerySearch, /router|searchParams|location\.hash|\?q=/);
  const hubPageSource = await readText("src/components/coloring/HubPageContent.tsx");
  assert.match(hubPageSource, /searchDataPath={`\/search-data\/hubs\/\$\{hub\.slug\}\.json`}/);
  assert.match(gallerySearch, /searchDataPath/);
});

test("filters preserve authoritative dimensions and responsive semantics", () => {
  for (const label of ["Difficulty", "Style", "Subject", "Theme"]) assert.match(galleryFilters, new RegExp(`"${label}"`));
  assert.match(galleryFilters, /type="checkbox"/);
  assert.match(galleryFilters, /role="dialog" aria-modal="true"/);
  assert.match(galleryFilters, /initialFocusRef: closeButtonRef/);
  assert.match(galleryFilters, />Apply filters</);
  assert.match(galleryFilters, />Clear all</);
  assert.doesNotMatch(galleryFilters, /role="tab"|sort|PageAdSlot|Advertisement/);
  assert.match(gallerySearch, /Active filters:/);
  assert.match(gallerySearch, /No matching coloring pages/);
});

test("overlay ownership is finite and centralizes scroll and background state", () => {
  for (const kind of ["global-search", "mobile-navigation", "mobile-filters", "printable-dialog"]) assert.match(overlayProvider, new RegExp(kind));
  assert.match(overlayProvider, /document\.body\.style\.overflow = "hidden"/);
  assert.match(overlayProvider, /shell\.inert = true/);
  assert.match(overlayProvider, /setActiveModal\(surface\)/);
  assert.doesNotMatch(overlayProvider, /Map|Set|push\(/);
  assert.match(modalHook, /event\.key === "Escape"/);
  assert.match(modalHook, /event\.key !== "Tab"/);
  assert.match(modalHook, /last\.focus\(\)/);
  assert.match(modalHook, /first\.focus\(\)/);
  assert.match(modalHook, /target\?\.isConnected/);
});

test("navigation and search accessibility contracts are explicit", () => {
  assert.match(siteHeader, /aria-label="Main navigation"/);
  assert.match(siteHeader, /aria-haspopup="dialog"/);
  assert.match(mobileNav, /aria-label="Open navigation menu"/);
  assert.match(globalSearch, /role="dialog" aria-modal="true" aria-labelledby=\{titleId\}/);
  assert.match(globalSearch, /initialFocusRef: inputRef/);
  assert.match(globalSearch, /aria-live="polite" role="status"/);
  assert.match(globalSearch, />Close</);
  assert.match(globalSearch, /No matching coloring pages/);
});

test("navigation payload stays out of initial component imports", () => {
  const initialSources = `${siteHeader}\n${mobileNav}\n${overlayProvider}`;
  assert.doesNotMatch(initialSources, /navigation\.json|runtime-printables|runtime-search-index|runtime-hubs/);
  assert.match(siteHeader, /lazy\(\(\) => import\("\.\/GlobalSearchDialog"\)/);
  assert.match(globalSearch, /loadNavigationSearchData/);
});

function assertOrder(source, needles) {
  const positions = needles.map((needle) => source.indexOf(needle));
  positions.forEach((position, index) => assert.ok(position >= 0, `missing ${needles[index]}`));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function importTypeScript(relativePath) {
  const source = await readText(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}
