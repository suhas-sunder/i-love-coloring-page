import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const hubs = JSON.parse(await read("src/generated/coloring/runtime-hubs.json"));
const printables = JSON.parse(await read("src/generated/coloring/runtime-printables.json"));
const indexation = JSON.parse(await read("src/config/indexation-manifest.json"));
const hubCounts = JSON.parse(await read("src/generated/coloring/runtime-hub-counts.json"));
const adLayoutModuleUrl = await transpileTypeScriptToDataUrl("src/lib/ads/layout.ts");
const adsConfigModuleUrl = await transpileTypeScriptToDataUrl("src/lib/ads/config.ts", { "./layout": adLayoutModuleUrl });
const eligibility = await importTypeScript("src/lib/ads/eligibility.ts", { "./config": adsConfigModuleUrl });
const assets = await importTypeScript("src/lib/coloring/assets.ts");

test("advertising uses one environment-independent real-unit and fallback path", async () => {
  const script = await read("src/components/ads/AdSenseScript.tsx");
  const slot = await read("src/components/ads/AdSlot.tsx");
  const runtime = await read("src/components/ads/AdSenseRuntime.tsx");
  const combined = `${script}\n${slot}\n${runtime}`;
  assert.doesNotMatch(combined, /process\.env|NODE_ENV|resolveAdMode|AdRuntimeEnvironment|AdMode/);
  assert.match(slot, /className="adsbygoogle ad-slot-live-unit"/);
  assert.match(slot, /data-ad-fallback-policy="page-all-or-none-v1"/);
  assert.match(slot, /data-ad-fallback="true" hidden/);
  assert.match(script, /hasValidAdSenseConfiguration/);
  assert.match(script, /<AdSenseRuntime clientId=\{ADSENSE_CLIENT_ID\}/);
});

test("live slot eligibility rejects invalid, hidden, distant, and duplicate units", () => {
  const eligibleInput = {
    slotId: "home-header-banner",
    pageFamily: "home",
    viewportWidth: 1440,
    configurationValid: true,
    actuallyVisible: true,
    nearViewport: true,
    alreadyInitialized: false,
  };
  assert.deepEqual(eligibility.evaluateAdSlotEligibility(eligibleInput), { eligible: true, reason: "eligible" });
  assert.equal(eligibility.evaluateAdSlotEligibility({ ...eligibleInput, configurationValid: false }).reason, "invalid-configuration");
  assert.equal(eligibility.evaluateAdSlotEligibility({ ...eligibleInput, actuallyVisible: false }).reason, "css-hidden");
  assert.equal(eligibility.evaluateAdSlotEligibility({ ...eligibleInput, nearViewport: false }).reason, "outside-load-range");
  assert.equal(eligibility.evaluateAdSlotEligibility({ ...eligibleInput, alreadyInitialized: true }).reason, "already-initialized");
});

test("AdSense initialization is idempotent per element and permits a new route element", async () => {
  const source = await read("src/components/ads/AdSenseRuntime.tsx");
  assert.match(source, /dataset\.adInitialized === "true"/);
  assert.match(source, /dataset\.adInitialized = "true"/);
  assert.match(source, /new MutationObserver\(\(\) => \{[\s\S]*observeUnits\(\)/);
  assert.match(source, /new IntersectionObserver/);
  assert.match(source, /evaluateAdSlotEligibility/);
});

test("invalid centralized configuration fails closed without introducing an advertising mode", async () => {
  const script = await read("src/components/ads/AdSenseScript.tsx");
  const slot = await read("src/components/ads/AdSlot.tsx");
  assert.match(script, /if \(!hasValidAdSenseConfiguration\(\)\) return null/);
  assert.match(slot, /if \(!hasValidAdSenseConfiguration\(\) \|\| !externalSlotId\) return null/);
  assert.doesNotMatch(`${script}\n${slot}`, /placeholder mode|development mode|production mode|data-ad-mode/i);
});

test("collection membership is the authoritative count snapshot for every hub", () => {
  for (const hub of hubs.hubs) {
    assert.equal(new Set(hub.assetIds).size, hub.assetCount, hub.hubId);
    if (hub.hubId in hubCounts.counts) {
      assert.equal(hubCounts.counts[hub.hubId], new Set(hub.assetIds).size, hub.hubId);
    }
    assert.ok(hub.galleryPageSize > 0, hub.hubId);
  }
  assert.equal(Object.keys(hubCounts.counts).length, hubCounts.navigationHubCount);
  assert.ok(Object.keys(hubCounts.counts).every((hubId) => hubs.hubs.some((hub) => hub.hubId === hubId && hub.indexable && hub.sitemap)));
});

test("asset source contract preserves physical dimensions for portrait, landscape, and square previews", () => {
  for (const [name, width, height] of [["portrait", 341, 512], ["landscape", 512, 341], ["square", 512, 512]]) {
    const sources = assets.resolvePrintableAssetSources({
      assetId: name,
      webpPath: `webp/test/${name}.webp`,
      svgPath: `svg/test/${name}.svg`,
      previewWidth: width,
      previewHeight: height,
      artworkWidth: width * 2,
      artworkHeight: height * 2,
    });
    assert.equal(sources.principalPreview.width, width);
    assert.equal(sources.principalPreview.height, height);
    assert.equal(sources.principalPreview.mayUpscale, false);
    assert.equal(sources.fullResolutionArtwork.kind, "internal-svg-artwork");
    assert.deepEqual(Object.keys(sources.downloadableFormats).sort(), ["jpg", "png", "webp"]);
  }
});

test("every printable has truthful generated preview/artwork dimensions and a server-renderable source", () => {
  assert.equal(printables.records.length, 6352);
  for (const printable of printables.records) {
    assert.ok(printable.webpPath.startsWith("webp/"), printable.assetId);
    assert.ok(printable.svgPath.startsWith("svg/"), printable.assetId);
    assert.ok(printable.previewWidth > 0 && printable.previewHeight > 0, printable.assetId);
    assert.ok(printable.artworkWidth > 0 && printable.artworkHeight > 0, printable.assetId);
    assert.ok(printable.altText.length > 0, printable.assetId);
  }
});

test("indexation policy is explicit, complete, versioned, and activates only resolved decisions", () => {
  assert.equal(indexation.schemaVersion, 2);
  assert.equal(indexation.activated, true);
  assert.equal(indexation.hubs.length, hubs.hubs.length);
  assert.deepEqual(indexation.hubs.filter((entry) => !entry.activated).map((entry) => entry.hubId).sort(), []);
  assert.equal(indexation.hubs.filter((entry) => entry.recommendation === "retain publicly but noindex" && entry.activated).length, 3);
  assert.equal(indexation.hubs.find((entry) => entry.hubId === "hub_easy")?.proposedSitemapInclusion, false);
  assert.equal(indexation.hubs.find((entry) => entry.hubId === "hub_for_kids")?.recommendation, "retain and index");
  assert.ok(indexation.hubs.every((entry) => indexation.allowedRecommendations.includes(entry.recommendation)));
});

test("all required audit reports exist", async () => {
  const required = [
    "hub-inventory.csv", "hub-inventory.json", "hub-overlap.csv", "hub-content-fingerprints.csv", "hub-audit.md",
    "repeated-content.md", "repeated-content-groups.csv", "internal-wording.csv", "printable-assets.csv",
    "printable-metadata.csv", "printable-rendering.md", "asset-errors.csv", "server-client-differences.md",
    "production-differences.md", "cache-deployment-audit.md", "navigation-audit.md", "navigation-destinations.csv",
    "search-responsive-audit.md", "thumbnail-layout-audit.md", "card-layout-audit.md", "ad-audit.md",
    "ad-placement-map.csv", "site-quality-audit.md", "indexation-plan.csv", "indexation-summary.md",
    "implementation-priorities.md",
  ];
  for (const report of required) assert.ok((await read(`reports/${report}`)).length > 0, report);
});

async function read(relative) {
  return readFile(path.join(root, relative), "utf8");
}

async function importTypeScript(relative, replacements = {}) {
  let output = await transpileTypeScript(relative);
  for (const [specifier, replacement] of Object.entries(replacements)) {
    output = output.replace(`from "${specifier}"`, `from "${replacement}"`);
  }
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}#${encodeURIComponent(relative)}`);
}

async function transpileTypeScriptToDataUrl(relative, replacements = {}) {
  let output = await transpileTypeScript(relative);
  for (const [specifier, replacement] of Object.entries(replacements)) {
    output = output.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}#${encodeURIComponent(relative)}`;
}

async function transpileTypeScript(relative) {
  const source = await read(relative);
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
}
