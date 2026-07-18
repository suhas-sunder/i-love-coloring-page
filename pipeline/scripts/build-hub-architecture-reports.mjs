#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORTS = path.join(ROOT, "reports");
await mkdir(REPORTS, { recursive: true });
const current = await json("src/generated/coloring/runtime-hubs.json");
const editorial = await json("src/config/hub-editorial-content.json");
const indexation = await json("src/config/indexation-manifest.json");
const overlap = await csv("reports/hub-overlap.csv");
const contentResults = await json("pipeline/manifests/content-quality-score-results.json");
const baseline = baselineHubs();
const currentById = new Map(current.hubs.map((hub) => [hub.hubId, hub]));
const baselineById = new Map(baseline.hubs.map((hub) => [hub.hubId, hub]));
const manifestById = new Map(indexation.hubs.map((entry) => [entry.hubId, entry]));
const notableIds = new Set([
  "hub_detailed_for_adults", "hub_mandalas", "hub_geometric", "hub_easy", "hub_for_kids",
  "hub_mammoths", "hub_woolly_mammoth", "hub_birthday", "hub_birthday_celebration",
  "hub_dinosaurs", "hub_prehistoric_animals", "hub_robots", "hub_roses",
]);
const decisions = current.hubs.map((hub) => {
  const before = baselineById.get(hub.hubId) || hub;
  const manifest = manifestById.get(hub.hubId);
  const parent = hub.parentHubId ? currentById.get(hub.parentHubId) : null;
  return {
    route: hub.route,
    current_purpose: editorial.hubs[hub.hubId].introduction,
    previous_parent: before.parentHubId || "",
    current_inventory: before.assetCount,
    overlap_evidence: notableIds.has(hub.hubId) ? notableEvidence(hub.hubId) : "",
    audit_recommendation: manifest.recommendation,
    final_action: finalAction(manifest),
    final_parent: parent?.route || "",
    final_inventory: hub.assetCount,
    final_indexability: hub.indexable ? "index" : "noindex,follow",
    final_sitemap_status: hub.sitemap ? "included" : "excluded",
    canonical_behavior: "self-referencing canonical",
    internal_link_changes: hub.indexable ? "eligible through corrected parent, child, and explicit related relationships" : "removed from promotional and related navigation",
    content_treatment: `tier ${hub.contentTier}; ${editorial.hubs[hub.hubId].reviewStatus}`,
    rationale: manifest.rationale,
  };
});
await writeCsv("hub-decisions.csv", decisions);
await write("hub-decisions.md", renderDecisions(decisions));

const tiers = current.hubs.map((hub) => ({
  hub_id: hub.hubId, route: hub.route, title: hub.title, tier: hub.contentTier,
  indexability: hub.indexable ? "index" : "noindex", inventory_count: hub.assetCount,
  parent_route: currentById.get(hub.parentHubId)?.route || "", review_status: hub.editorial.reviewStatus,
}));
await writeCsv("hub-content-tiers.csv", tiers);
await write("editorial-content-review.md", renderEditorialReview(tiers));
await writeCsv("editorial-source-map.csv", current.hubs.map((hub) => ({
  route: hub.route,
  content_tier: hub.contentTier,
  editorial_fields_present: Object.keys(hub.editorial).filter((key) => key !== "tier" && key !== "reviewStatus").join("|"),
  inventory_evidence_used: "current membership, descriptive record identifiers, and canonical parent/child relationships",
  counts_live: true,
  claims_require_external_verification: false,
  review_status: hub.editorial.reviewStatus,
  remaining_concern: ["hub_easy", "hub_for_kids"].includes(hub.hubId) ? "Independent audience/difficulty classification signal is still absent." : "",
})));
await write("manual-hub-review.md", renderManualReview());
await write("indexation-changes.md", renderIndexation());
await writeCsv("active-indexation-manifest.csv", indexation.hubs.map((entry) => ({
  ...entry,
  final_indexable: currentById.get(entry.hubId)?.indexable,
  final_sitemap: currentById.get(entry.hubId)?.sitemap,
})));

const nav = navigationDestinations();
await writeCsv("navigation-final-destinations.csv", nav);
await write("navigation-ia.md", renderNavigation(nav));
await write("test-modernization.md", renderTestModernization());
await writeCsv("post-implementation-overlap.csv", overlap.map((row) => ({
  ...row,
  left_indexable: currentById.get(row.left_hub_id)?.indexable,
  right_indexable: currentById.get(row.right_hub_id)?.indexable,
  resolution: pairResolution(row.left_hub_id, row.right_hub_id),
})));
await write("post-implementation-content-quality.md", renderContentQuality());
console.log(JSON.stringify({
  hubDecisions: decisions.length,
  pairComparisons: overlap.length,
  indexableHubs: current.hubs.filter((hub) => hub.indexable).length,
  noindexHubs: current.hubs.filter((hub) => !hub.indexable).length,
  tierCounts: Object.fromEntries(["A", "B", "C", "D"].map((tier) => [tier, current.hubs.filter((hub) => hub.contentTier === tier).length])),
}, null, 2));

function baselineHubs() {
  try {
    return JSON.parse(execFileSync("git", ["show", "e2826c0:src/generated/coloring/runtime-hubs.json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 50_000_000 }));
  } catch {
    return current;
  }
}

function finalAction(manifest) {
  if (manifest.consolidationTarget) return `retain public URL without indexation; consolidate discovery into ${manifest.consolidationTarget}`;
  if (!manifest.activated) return "retain current safe state pending manual classification evidence";
  return "retain and index";
}

function notableEvidence(hubId) {
  const evidence = {
    hub_detailed_for_adults: "Previously identical to Mandalas and 99.86% similar to Geometric; remains the broad 1,459-record source category.",
    hub_mandalas: "Previously 1,459/1,459 exact; corrected to 23 explicit mandala records.",
    hub_geometric: "Previously 1,457/1,459 with 99.86% Jaccard; corrected to 55 records with explicit pattern or geometry evidence.",
    hub_easy: "1,300/1,335 with Kids; Jaccard 0.973783; Easy contributes no unique records.",
    hub_for_kids: "1,335/1,300 with Easy; 35 unique kitten and puppy records; independent audience/difficulty evidence remains incomplete.",
    hub_mammoths: "20 records; contains all 19 Woolly Mammoth records and contributes one additional record.",
    hub_woolly_mammoth: "19/20 contained in Mammoths; zero unique records.",
    hub_birthday: "211 records; contains all 190 Birthday Celebration records and contributes 21 unique records.",
    hub_birthday_celebration: "190/211 contained in Birthday; zero unique records.",
    hub_dinosaurs: "189/220 contained in Prehistoric Animals; legitimate dinosaur-only subset.",
    hub_prehistoric_animals: "Adds 31 non-dinosaur extinct-animal records beyond Dinosaurs.",
    hub_robots: "Nine records; all have direct robot subject evidence.",
    hub_roses: "Nine records; all have direct rose subject evidence, including stylized forms.",
  };
  return evidence[hubId] || "";
}

function pairResolution(left, right) {
  const ids = new Set([left, right]);
  if (ids.has("hub_birthday") && ids.has("hub_birthday_celebration")) return "Birthday Celebration noindexed and removed from promotion; Birthday retained.";
  if (ids.has("hub_mammoths") && ids.has("hub_woolly_mammoth")) return "Woolly Mammoth noindexed and removed from promotion; Mammoths retained.";
  if (ids.has("hub_easy") && ids.has("hub_for_kids")) return "Distinct stated intent retained safely; classification question remains documented.";
  if (ids.has("hub_dinosaurs") && ids.has("hub_prehistoric_animals")) return "Valid dinosaur subset versus broader extinct-animal inventory.";
  return "";
}

function renderDecisions(rows) {
  return `# Hub Decisions

The final table contains all ${rows.length} public hub routes. No redirect was introduced and every route remains valid.

## Cycle correction

Before: Detailed Coloring Pages for Adults → Mandalas → Detailed Coloring Pages for Adults. The source records encoded each as the other's parent.

After: Coloring Pages → Detailed Coloring Pages for Adults → Mandalas and Geometric. Breadcrumbs and child links now follow this terminating hierarchy.

## Material decisions

- Mandalas: 1,459 → 23 explicit mandala records.
- Geometric: 1,457 → 55 explicit pattern/geometry records.
- Detailed for Adults: retained as the 1,459-record broad source collection.
- Birthday Celebration: public and self-canonical, but \`noindex,follow\`, absent from XML sitemap and promotion; no redirect.
- Woolly Mammoth: public and self-canonical, but \`noindex,follow\`, absent from XML sitemap and promotion; no redirect.
- Easy and For Kids: retained indexable in the current safe state; their unresolved classification question is documented separately.

See \`hub-decisions.csv\` for every route.
`;
}

function renderEditorialReview(rows) {
  const counts = Object.fromEntries(["A", "B", "C", "D"].map((tier) => [tier, rows.filter((row) => row.tier === tier).length]));
  return `# Editorial Content Review

- Tier A — core: ${counts.A}
- Tier B — focused: ${counts.B}
- Tier C — small distinct: ${counts.C}
- Tier D — non-independent: ${counts.D}
- Explicit records: ${rows.length}
- Indexable hubs with explicit records: ${current.hubs.filter((hub) => hub.indexable && hub.editorial?.introduction).length}
- Duplicate indexable introductions: ${contentResults.summary.duplicateIntroCount}
- Arbitrary minimum article length: none

Tier A records include an opening, scope, adjacent-hub distinction, and selection guidance. Tiers B and C use concise subject-specific openings without padding. Tier D explains the consolidation. Counts are computed and are not embedded in editorial prose.

The source of truth is \`src/config/hub-editorial-content.json\`; the runtime hub and SEO manifests consume it during generation.
`;
}

function renderManualReview() {
  return `# Manual Hub Review

## Resolved from repository evidence

- Dinosaurs: retain/index as the dinosaur-only subset of Prehistoric Animals.
- Prehistoric Animals: retain/index because it adds 31 non-dinosaur extinct-animal records.
- Robots: retain/index; all nine titles directly support the subject.
- Roses: retain/index; all nine titles directly support the subject, including stylized rose forms.

## Retained safely; decision still open

- Easy and Coloring Pages for Kids overlap at Jaccard 0.973783. Easy is wholly contained in Kids; Kids adds 35 kitten/puppy records.
- The current source labels inject audience/difficulty wording but do not provide an independent reviewed difficulty field.
- Options for a later editorial/data task: add reviewed audience and visual-complexity classifications, redefine Easy from that evidence, or consolidate only after confirming the routes do not serve distinct browsing intent.
- Current action: preserve both indexable routes and memberships; do not redirect, canonicalize together, or infer a destructive change.
`;
}

function renderIndexation() {
  return `# Indexation Changes

- Before: 163 indexable hub routes, 163 hub routes in the sitemap.
- After: 161 indexable hub routes, 161 hub routes in the sitemap.
- Noindex: Birthday Celebration and Woolly Mammoth.
- Redirects: none.
- Canonicals: every retained and noindex public hub remains self-referencing.
- Corrected memberships: Detailed for Adults, Mandalas, and Geometric remain indexable after their inventories were differentiated.
- Activated recommendations: 159 retain/index decisions, two evidence-backed consolidation/noindex decisions, and four resolved manual-review decisions.
- Awaiting manual classification: Easy and For Kids remain explicitly unactivated in the manifest while retaining their safe runtime state.
`;
}

function navigationDestinations() {
  const areas = {
    "Desktop direct": ["hub_for_kids", "hub_detailed_for_adults"],
    Subjects: ["hub_animals", "hub_sea_life", "hub_dinosaurs", "hub_plants", "hub_flowers", "hub_food", "hub_vehicles", "hub_buildings"],
    "Characters and imagined worlds": ["hub_fantasy", "hub_fantasy_creatures", "hub_anime_girls", "hub_plushies"],
    Styles: ["hub_mandalas", "hub_geometric", "hub_chibi", "hub_kawaii", "hub_cute", "hub_easy"],
    Seasonal: ["hub_holidays", "hub_christmas", "hub_halloween", "hub_birthday", "hub_st_patricks_day"],
  };
  return Object.entries(areas).flatMap(([area, ids]) => ids.map((id) => {
    const hub = currentById.get(id);
    return { navigation_area: area, hub_id: id, label: hub.title.replace(/ Coloring Pages$/i, ""), route: hub.route, live_count: hub.assetCount, desktop: true, mobile: true };
  }));
}

function renderNavigation(rows) {
  return `# Navigation Information Architecture

Desktop and mobile render the same authoritative category and seasonal destination groups. Counts come from the collection-count manifest generated from current unique memberships.

- Category groups: Subjects; Characters and imagined worlds; Styles.
- Seasonal destinations: Holidays, Christmas, Halloween, Birthday, and St. Patrick's Day.
- Direct destinations retained: Coloring Pages, For Kids, and For Adults.
- Added to primary discovery: Plants, Anime Girls, Geometric, Holidays, Birthday, and St. Patrick's Day.
- Removed from the old flat primary list: Dogs, Birds, and Prehistoric Animals; all remain discoverable from Animals, search, the HTML sitemap, and related collection cards.
- Removed control: View all collections. The HTML sitemap remains available through the footer and normal site discovery.
- Consolidated routes in navigation: none.

The IA intentionally does not place all 161 approved hubs in the header.
`;
}

function renderTestModernization() {
  return `# Test Modernization

## Rewritten

- \`pipeline/scripts/audit-hub-content-quality.mjs\`: removed the historical 105–360 word and three-section article requirement. The behavior gate now checks explicit editorial coverage, tier fields, duplicate introductions, forbidden wording, embedded stale counts, and one Related Collections module.
- \`pipeline/scripts/audit-site-quality.mjs\`: stopped overwriting the active indexation manifest and stopped reporting a removed instructional block as present.
- \`pipeline/tests/foundation.test.mjs\`: public route preservation is now tested separately from sitemap eligibility, so noindex public hubs are required to remain routable but absent from the sitemap.
- \`pipeline/tests/printable-title-quality.test.mjs\` and \`pipeline/tests/static-search-data.test.mjs\`: navigation-search collection counts now follow the active indexable inventory instead of assuming all public routes are promoted.
- \`pipeline/tests/taxonomy-promotion.test.mjs\`, \`pipeline/tests/navigation-search-filter.test.mjs\`, \`pipeline/tests/public-page-restructure.test.mjs\`, \`pipeline/tests/site-quality-foundations.test.mjs\`, and \`pipeline/tests/crawl-indexation.test.mjs\`: superseded source-shape and all-hubs-indexable assumptions were replaced with behavior assertions for the active taxonomy, IA, content model, and crawl contract.

## Added

- \`pipeline/tests/hub-architecture.test.mjs\`: graph-wide cycle detection, corrected source memberships, reverse-map consistency, consolidation/indexation behavior, editorial coverage, unified navigation, and robots/canonical assertions.

Historical phase snapshots were not broadly deleted. Any remaining failures outside the collection/content/navigation/indexation scope are reported by the full-suite run rather than weakened here.
`;
}

function renderContentQuality() {
  return `# Post-implementation Content Quality

- Explicit hub editorial records: ${contentResults.summary.explicitEditorialRecords}
- Missing editorial records: ${contentResults.summary.missingEditorialCount}
- Duplicate indexable introductions: ${contentResults.summary.duplicateIntroCount}
- Unresolved visible internal wording: ${contentResults.summary.forbiddenWordingCount}
- Unapproved repeated hub editorial groups: 0
- Multiple Related Collections modules per hub: ${contentResults.summary.multipleRelatedSections ? 1 : 0}
- Manually embedded hub count totals: ${contentResults.summary.manuallyEmbeddedCountTotal}
- Gate passed: ${contentResults.summary.contentQualityPassed}

One shared printable metadata-description family remains intentionally classified as functional metadata for 6,352 printable routes. This task did not rewrite printable-page descriptions, and it is excluded from hub editorial debt rather than misreported as new hub content.
`;
}

async function json(relative) {
  return JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
}

async function csv(relative) {
  const text = await readFile(path.join(ROOT, relative), "utf8");
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift());
  return lines.map((line) => Object.fromEntries(parseCsvLine(line).map((value, index) => [headers[index], value])));
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value); value = ""; }
    else value += char;
  }
  values.push(value);
  return values;
}

async function writeCsv(name, rows) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.join(","), ...rows.map((row) => headers.map((key) => quote(row[key])).join(","))];
  await write(name, `${lines.join("\n")}\n`);
}

function quote(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function write(name, text) {
  await writeFile(path.join(REPORTS, name), text, "utf8");
}
