import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";

import { countTokenOverlap, getDiscoveryTokenProfile } from "../lib/gallery-discovery-quality.mjs";

const ROOT = process.cwd();
const runtime = json("src/generated/coloring/runtime-printables.json");
const hubs = json("src/generated/coloring/runtime-hubs.json");
const indexation = json("src/config/indexation-manifest.json");
const hubById = new Map(hubs.hubs.map((hub) => [hub.hubId, hub]));
const recordById = new Map(runtime.records.map((record) => [record.assetId, record]));

test("all printable attributes are provenance-backed and omit unapproved audience or detail claims", () => {
  assert.equal(runtime.records.length, 6352);
  for (const record of runtime.records) {
    const attributes = record.attributes;
    assert.ok(attributes);
    assert.equal(attributes.audienceClassification, null);
    assert.equal(attributes.detailClassification, null);
    assert.ok(attributes.provenance.orientation);
    assert.ok(attributes.provenance.primaryCollection);
    assert.equal(attributes.principalImageRole, "public-webp-preview");
    assert.deepEqual(attributes.serverAvailableFormats, ["PNG"]);
    assert.deepEqual(attributes.browserConditionalFormats, ["JPG", "WebP"]);
    for (const field of ["primarySubject", "narrowSubjectCategory", "styles", "seasonalClassifications", "summary"]) {
      const value = attributes[field];
      if (value && (!Array.isArray(value) || value.length)) assert.ok(attributes.provenance[field], `${record.assetId} ${field}`);
    }
  }
});

test("printable text removes the global format paragraph and forbids promotional claims", () => {
  const titleSource = text("src/lib/coloring/printableTitles.ts");
  const pageSource = text("src/components/coloring/PrintableDetailPage.tsx");
  const footerSource = text("src/components/site/SiteFooter.tsx");
  const seoPages = json("src/generated/coloring/runtime-seo-pages.json");
  assert.doesNotMatch(titleSource, /Print \$\{displayTitle\} or download this coloring page as PNG, JPG, or WebP/);
  assert.doesNotMatch(pageSource, /<dt>Formats<\/dt>|PNG, JPG, WebP|perfect for|spark your creativity|great for classrooms/i);
  assert.doesNotMatch(footerSource, /PNG, JPG|JPG, or WebP/i);
  assert.doesNotMatch(seoPages.pages.find((page) => page.path === "/").metaDescription, /PNG|JPG|WebP/i);
  assert.match(pageSource, /data-printable-details/);
  assert.match(pageSource, /summary \? <p>/);
  const forbidden = /enjoy|perfect for|great for|spark your creativity|relax|beautiful|therapy|educational|all ages|kids and adults/i;
  for (const record of runtime.records) {
    if (!record.attributes.summary) continue;
    assert.doesNotMatch(record.attributes.summary, forbidden);
    assert.notEqual(normalize(record.attributes.summary), normalize(record.displayTitle));
  }
});

test("Easy and For Kids are distinct decisions without invented per-record classifications", () => {
  const easy = indexation.hubs.find((entry) => entry.hubId === "hub_easy");
  const kids = indexation.hubs.find((entry) => entry.hubId === "hub_for_kids");
  assert.deepEqual([easy.recommendation, easy.activated, easy.proposedSitemapInclusion], ["retain publicly but noindex", true, false]);
  assert.deepEqual([kids.recommendation, kids.activated, kids.proposedSitemapInclusion], ["retain and index", true, true]);
  const easyHub = hubById.get("hub_easy");
  const kidsHub = hubById.get("hub_for_kids");
  assert.equal(easyHub.indexable, false);
  assert.equal(easyHub.sitemap, false);
  assert.equal(kidsHub.indexable, true);
  assert.equal(kidsHub.sitemap, true);
  assert.equal(easyHub.assetIds.every((assetId) => kidsHub.assetIds.includes(assetId)), true);
  assert.equal(kidsHub.assetIds.length - easyHub.assetIds.length, 35);
  assert.equal(runtime.records.some((record) => record.attributes.audienceClassification || record.attributes.detailClassification), false);
});

test("related printable sets are valid, relevant, deterministic, and varied", () => {
  const setHashes = new Set();
  for (const record of runtime.records) {
    assert.ok(record.relatedAssetIds.length >= 8, record.assetId);
    assert.equal(new Set(record.relatedAssetIds).size, record.relatedAssetIds.length);
    assert.equal(record.relatedAssetIds.includes(record.assetId), false);
    let verifiedMatches = 0;
    for (const assetId of record.relatedAssetIds) {
      const candidate = recordById.get(assetId);
      assert.ok(candidate, `${record.assetId} -> ${assetId}`);
      if (sharesVerifiedContext(record, candidate)) verifiedMatches += 1;
    }
    assert.ok(verifiedMatches > 0, `No verified related signal for ${record.assetId}`);
    setHashes.add(createHash("sha256").update(record.relatedAssetIds.join("|")).digest("hex"));
  }
  assert.ok(setHashes.size > runtime.records.length / 2, `${setHashes.size} unique sets`);
});

test("trust copy describes gated advertising and the approved printable-use terms", () => {
  const privacy = text("app/privacy/page.tsx");
  const terms = text("app/terms/page.tsx");
  assert.match(privacy, /AdSense requests remain disabled unless the live-ad setting/);
  assert.match(privacy, /Google-certified consent\s+management platform or another reliable regional exclusion/);
  assert.doesNotMatch(privacy, /Advertisement areas are inert layout placeholders/);
  assert.match(terms, /Created and published by I Love Coloring Page/);
  assert.match(terms, /personal use, family and household use,\s*classroom use, homeschool use, and nonprofit educational use/);
  assert.match(terms, /Sell, resell, redistribute, republish, re-upload, or sublicense/);
  assert.match(terms, /own completed colored artwork/);
  assert.doesNotMatch(terms, /A final public-use license is under review|governed by the laws|COPPA compliant/i);
});

test("indexable hub inventories remain distinct and the hierarchy remains acyclic", () => {
  const indexable = hubs.hubs.filter((hub) => hub.indexable && hub.sitemap);
  const inventories = new Map();
  for (const hub of indexable) {
    const fingerprint = [...hub.assetIds].sort().join("|");
    const existing = inventories.get(fingerprint);
    assert.equal(existing, undefined, `${hub.hubId} duplicates ${existing}`);
    inventories.set(fingerprint, hub.hubId);
  }
  for (const start of hubs.hubs) {
    const seen = new Set();
    let current = start;
    while (current?.parentHubId) {
      assert.equal(seen.has(current.hubId), false, `cycle from ${start.hubId}`);
      seen.add(current.hubId);
      current = hubById.get(current.parentHubId);
    }
  }
});

function sharesVerifiedContext(left, right) {
  if (left.attributes.narrowSubjectCategory && left.attributes.narrowSubjectCategory === right.attributes.narrowSubjectCategory) return true;
  if (left.attributes.primarySubject && left.attributes.primarySubject === right.attributes.primarySubject) return true;
  if (left.attributes.styles.some((style) => right.attributes.styles.includes(style))) return true;
  if (left.attributes.seasonalClassifications.some((season) => right.attributes.seasonalClassifications.includes(season))) return true;
  if (left.attributes.patternFocused && right.attributes.patternFocused) return true;
  if (countTokenOverlap(getDiscoveryTokenProfile(left.publicTitle), getDiscoveryTokenProfile(right.publicTitle)).strong > 0) return true;
  return left.hubIds.some((hubId) => hubId !== "hub_coloring_pages" && right.hubIds.includes(hubId));
}

function json(relative) {
  return JSON.parse(text(relative));
}

function text(relative) {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

function normalize(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
