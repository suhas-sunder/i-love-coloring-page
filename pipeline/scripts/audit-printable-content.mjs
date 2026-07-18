#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DATE = "2026-07-18";
const runtime = await readJson("src/generated/coloring/runtime-printables.json");
const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
const hubById = new Map(hubs.hubs.map((hub) => [hub.hubId, hub]));
const recordById = new Map(runtime.records.map((record) => [record.assetId, record]));
const records = runtime.records;

const oldTemplate = (await readText("src/lib/coloring/printableTitles.ts")).match(/Print \$\{displayTitle\} or download this coloring page as PNG, JPG, or WebP/);
const summaries = records.filter((record) => record.attributes.summary);
const structuredOnly = records.filter((record) => !record.attributes.summary);
const reviewRecords = records.filter((record) => record.attributes.editorialReviewStatus === "metadata-review-required");

const fieldDefinitions = [
  field("printable_id", records.length, 0, 0, "runtime printable contract", true, true, true),
  field("public_title", records.length, 0, 0, "reviewed runtime title model", true, true, true),
  coverage("primary_subject", (record) => record.attributes.primarySubject, 0, "explicit collection assignment + approved taxonomy rule", true, true, true),
  coverage("secondary_subjects", (record) => record.attributes.secondarySubjects.length, 0, "explicit collection assignments + approved taxonomy rule", true, true, true),
  coverage("narrow_subject_category", (record) => record.attributes.narrowSubjectCategory, 0, "leaf collection assignment + approved taxonomy rule", true, true, true),
  coverage("style_classification", (record) => record.attributes.styles.length, 0, "explicit style collection assignment + approved taxonomy rule", true, true, true),
  coverage("pattern_focused_status", (record) => record.attributes.patternFocused === true, 0, "explicit Mandalas/Geometric assignment", true, true, true),
  field("character_focused_status", 0, 0, records.length, "no verified source", false, false, false),
  field("scene_focused_status", 0, 0, records.length, "no verified source", false, false, false),
  coverage("seasonal_classification", (record) => record.attributes.seasonalClassifications.length, 0, "explicit seasonal collection assignment + approved taxonomy rule", true, true, true),
  coverage("holiday_classification", (record) => record.attributes.seasonalClassifications.length, 0, "explicit seasonal collection assignment + approved taxonomy rule", true, true, true),
  coverage("orientation", (record) => record.attributes.orientation, 0, "computed source dimensions", true, true, true),
  coverage("source_dimensions", (record) => record.attributes.sourceDimensions, 0, "verified production asset dimensions", true, false, true),
  coverage("print_layout_dimensions", (record) => record.attributes.printLayout, 0, "verified shared print composition", true, false, false),
  field("detail_or_complexity_classification", 0, count((record) => record.attributes.unapprovedDetailCandidates.length), records.length - count((record) => record.attributes.unapprovedDetailCandidates.length), "legacy collection candidates; not independently reviewed", false, false, false),
  field("audience_classification", 0, count((record) => record.attributes.unapprovedAudienceCandidates.length), records.length - count((record) => record.attributes.unapprovedAudienceCandidates.length), "legacy collection candidates; not independently reviewed", false, false, false),
  coverage("primary_collection", (record) => record.attributes.primaryCollection, 0, "explicit collection assignment", true, true, true),
  coverage("additional_collection_memberships", (record) => record.attributes.additionalCollections.length, 0, "explicit collection assignment", true, true, false),
  coverage("available_formats", (record) => record.attributes.serverAvailableFormats.length, 0, "verified asset and browser capability model", true, false, false),
  coverage("principal_image_role", (record) => record.attributes.principalImageRole, 0, "verified asset resolver role", true, false, true),
  coverage("related_printable_signals", (record) => record.relatedAssetIds.length, 0, "verified attribute and collection scoring", false, true, false),
  coverage("editorial_review_status", (record) => record.attributes.editorialReviewStatus, 0, "attribute validation result", false, false, false),
];

const summaryGroups = duplicateGroups(records, (record) => record.attributes.summary);
const metadataGroups = duplicateGroups(records, metadataDescription);
const altGroups = duplicateGroups(records, (record) => record.altText);
const summaryUnrelatedGroups = summaryGroups.filter((group) => !group.records.every((record) => sharesSummaryContext(group.records[0], record)));
const altIssues = records.filter((record) => !record.altText || /\b(?:download|png|jpe?g|webp|printable download|image of)\b/i.test(record.altText) || /coloring page.*coloring page/i.test(record.altText));
const forbiddenSummary = /enjoy|perfect for|great for|spark your creativity|relax|beautiful|classroom|therapy|educational|all ages|kids and adults/i;
const summaryIssues = summaries.filter((record) => forbiddenSummary.test(record.attributes.summary) || !record.attributes.provenance.summary);

const relatedMetrics = records.map((record) => relatedMetric(record));
const setHashes = new Map();
for (const metric of relatedMetrics) {
  const list = setHashes.get(metric.setHash) || [];
  list.push(metric.assetId);
  setHashes.set(metric.setHash, list);
}
const identicalRelatedSetGroups = [...setHashes.values()].filter((group) => group.length > 1);
const relatedWithVerifiedSignal = relatedMetrics.filter((metric) => metric.verifiedSignalCount > 0).length;
const minimumRelatedCount = Math.min(...relatedMetrics.map((metric) => metric.relatedCount));
const maximumIdenticalSetSize = Math.max(1, ...identicalRelatedSetGroups.map((group) => group.length));

await writeCsv("reports/printable-attribute-coverage.csv", fieldDefinitions);
await writeCsv("reports/printable-metadata-gaps.csv", records
  .filter((record) => !record.attributes.summary || record.attributes.editorialReviewStatus === "metadata-review-required")
  .map((record) => ({
    printable_id: record.assetId,
    route: record.canonicalPath,
    prose_summary: record.attributes.summary ? "present" : "omitted",
    missing_verified_fields: missingFields(record).join("|"),
    unapproved_candidates: [...record.attributes.unapprovedAudienceCandidates, ...record.attributes.unapprovedDetailCandidates].join("|"),
    review_reason: record.attributes.editorialReviewStatus === "metadata-review-required" ? "audience/detail candidate lacks independent review" : "verified structured details are available but do not support additional prose",
  })));
await writeCsv("reports/printable-text-field-audit.csv", records.map((record) => ({
  printable_id: record.assetId,
  route: record.canonicalPath,
  visible_h1: record.displayTitle,
  document_title: record.metadataTitle,
  meta_description: metadataDescription(record),
  principal_image_alt: record.altText,
  visible_caption: "",
  open_graph_title: record.metadataTitle,
  open_graph_description: metadataDescription(record),
  structured_data_name: record.displayTitle,
  structured_data_description: metadataDescription(record),
  summary: record.attributes.summary || "",
  alt_issue: altIssues.includes(record),
  unsupported_claim_issue: summaryIssues.includes(record),
  provenance_complete: Boolean(record.attributes.provenance.orientation && record.attributes.provenance.primaryCollection && (!record.attributes.summary || record.attributes.provenance.summary)),
})));
await writeCsv("reports/printable-duplicate-metadata.csv", [
  ...summaryGroups.map((group) => duplicateRow("visible_summary", group, summaryUnrelatedGroups.includes(group) ? "review unrelated records" : "retained standard terminology among records sharing verified context")),
  ...metadataGroups.map((group) => duplicateRow("meta_description", group, "review")),
  ...altGroups.map((group) => duplicateRow("alt_text", group, "review duplicate title group")),
]);
await writeCsv("reports/related-printable-samples.csv", buildSamples());

await writeText("reports/printable-content-findings.md", `# Printable content findings\n\n## Pre-implementation finding\n\nThe single repeated template was \`Print {display title} or download this coloring page as PNG, JPG, or WebP.\` It originated in \`src/lib/coloring/printableTitles.ts\` and was reused as visible header copy, the meta description, Open Graph/Twitter description, and WebPage JSON-LD description across all 6,352 routes. It accurately named controls but added no artwork-specific context and claimed browser-conditional formats in server metadata.\n\n## Implemented state\n\n- Repeated generic printable template occurrences: ${oldTemplate ? records.length : 0}\n- Printable routes using provenance-backed concise summaries: ${summaries.length.toLocaleString("en-US")}\n- Routes using structured details without a prose summary: ${structuredOnly.length.toLocaleString("en-US")}\n- Routes with unapproved audience/detail candidates requiring metadata review: ${reviewRecords.length.toLocaleString("en-US")}\n- Summary groups shared across unrelated records: ${summaryUnrelatedGroups.length}\n- Forbidden or unproven summary claims: ${summaryIssues.length}\n- Alt-text issues: ${altIssues.length}\n\nThe implementation does not synthesize articles, age claims, educational claims, therapeutic claims, safety claims, licensing claims, or random wording.\n`);

await writeText("reports/printable-attribute-schema.md", `# Printable attribute schema\n\nThe authoritative model is \`RuntimePrintable.attributes\`, generated with each canonical printable record by \`pipeline/scripts/build-runtime-printables.mjs\`. It is not a separate editorial database.\n\n## Provenance rules\n\n- Subjects, styles, patterns, and seasonal values require both an explicit runtime collection assignment and an approved taxonomy-dimension rule.\n- Orientation and source dimensions are computed from verified production dimensions.\n- Artwork dimensions, print layout, image role, and format capability come from verified asset/configuration records.\n- Titles, filenames, route slugs, broad parent hubs, and image-density scores do not independently establish displayed attributes.\n- Easy, For Kids, and Detailed for Adults memberships are retained only as unapproved audience/detail candidates. They are never displayed as per-page audience or complexity facts.\n- Missing fields remain null or empty and are omitted from visible markup.\n\nThe model supports subject, style, pattern, season/holiday, orientation, source/artwork/print dimensions, collection context, truthful format capability, principal-image role, related signals, review status, and field-level provenance. Character-focused, scene-focused, verified detail, and verified audience values remain unsupported until reviewed evidence exists.\n`);

await writeText("reports/related-printable-quality.md", `# Related printable quality\n\n- Printable routes evaluated: ${records.length.toLocaleString("en-US")}\n- Minimum related results per route: ${minimumRelatedCount}\n- Routes with at least one verified shared subject/style/season/pattern signal: ${relatedWithVerifiedSignal.toLocaleString("en-US")}\n- Unique related-set hashes: ${setHashes.size.toLocaleString("en-US")}\n- Identical related-set groups: ${identicalRelatedSetGroups.length.toLocaleString("en-US")}\n- Largest identical related-set group: ${maximumIdenticalSetSize}\n- Self references: ${relatedMetrics.reduce((total, metric) => total + metric.selfReferences, 0)}\n- Invalid or unavailable targets: ${relatedMetrics.reduce((total, metric) => total + metric.invalidTargets, 0)}\n\nNarrow verified subjects rank above style, season, pattern, broader collection, and orientation signals. Orientation is only a weak secondary signal. Stable pair hashing breaks otherwise equal scores without randomness, upload order, or route order. Unique titles are selected before duplicate-title designs.\n`);

console.log(JSON.stringify({
  printableRoutes: records.length,
  repeatedTemplateOccurrences: oldTemplate ? records.length : 0,
  conciseSummaries: summaries.length,
  structuredOnly: structuredOnly.length,
  metadataReviewRequired: reviewRecords.length,
  duplicateSummaryGroups: summaryGroups.length,
  unrelatedDuplicateSummaryGroups: summaryUnrelatedGroups.length,
  duplicateMetaDescriptionGroups: metadataGroups.length,
  altIssues: altIssues.length,
  uniqueRelatedSets: setHashes.size,
  maximumIdenticalRelatedSetSize: maximumIdenticalSetSize,
}, null, 2));

function metadataDescription(record) {
  if (record.attributes.summary) return `${record.displayTitle}. ${record.attributes.summary}`;
  const orientation = record.attributes.orientation ? `${record.attributes.orientation} ` : "";
  return `${record.displayTitle} is a ${orientation}printable in the ${record.attributes.primaryCollection.title} collection.`;
}

function coverage(name, predicate, inferred, source, display, related, metadata) {
  const verified = count((record) => Boolean(predicate(record)));
  return field(name, verified, inferred, records.length - verified - inferred, source, display, related, metadata);
}

function field(fieldName, verified, inferred, missing, source, display, related, metadata) {
  return {
    field: fieldName,
    verified_value_count: verified,
    inferred_unapproved_count: inferred,
    missing_count: missing,
    source_of_truth: source,
    safe_to_display: display,
    safe_for_related_selection: related,
    safe_for_metadata: metadata,
  };
}

function count(predicate) {
  return records.reduce((total, record) => total + Number(Boolean(predicate(record))), 0);
}

function duplicateGroups(source, valueFor) {
  const groups = new Map();
  for (const record of source) {
    const value = valueFor(record);
    if (!value) continue;
    const list = groups.get(value) || [];
    list.push(record);
    groups.set(value, list);
  }
  return [...groups.entries()].filter(([, grouped]) => grouped.length > 1).map(([value, grouped]) => ({ value, records: grouped }));
}

function duplicateRow(fieldName, group, action) {
  return {
    field: fieldName,
    value: group.value,
    occurrence_count: group.records.length,
    routes: group.records.map((record) => record.canonicalPath).join("|"),
    related_context: group.records.every((record) => sharesSummaryContext(group.records[0], record)),
    action,
  };
}

function sharesSummaryContext(left, right) {
  if (left.assetId === right.assetId) return true;
  if (left.attributes.narrowSubjectCategory && left.attributes.narrowSubjectCategory === right.attributes.narrowSubjectCategory) return true;
  if (left.attributes.primarySubject && left.attributes.primarySubject === right.attributes.primarySubject) return true;
  if (left.attributes.styles.some((style) => right.attributes.styles.includes(style))) return true;
  if (left.attributes.patternFocused && right.attributes.patternFocused) return true;
  return left.attributes.seasonalClassifications.some((season) => right.attributes.seasonalClassifications.includes(season));
}

function relatedMetric(record) {
  let verifiedSignalCount = 0;
  let selfReferences = 0;
  let invalidTargets = 0;
  for (const assetId of record.relatedAssetIds) {
    if (assetId === record.assetId) selfReferences += 1;
    const candidate = recordById.get(assetId);
    if (!candidate) {
      invalidTargets += 1;
      continue;
    }
    if (sharesSummaryContext(record, candidate) || (record.attributes.patternFocused && candidate.attributes.patternFocused)) verifiedSignalCount += 1;
  }
  return {
    assetId: record.assetId,
    relatedCount: record.relatedAssetIds.length,
    verifiedSignalCount,
    selfReferences,
    invalidTargets,
    setHash: createHash("sha256").update(record.relatedAssetIds.join("|")).digest("hex"),
  };
}

function buildSamples() {
  const specs = [
    ["Animals", "hub_animals"], ["Flowers", "hub_flowers"], ["Fantasy", "hub_fantasy"],
    ["Mandalas", "hub_mandalas"], ["Geometric", "hub_geometric"], ["Easy", "hub_easy"],
    ["Coloring Pages for Kids", "hub_for_kids"], ["Seasonal", "hub_christmas"], ["Small distinct", "hub_robots"],
  ];
  const selected = [];
  for (const [label, hubId] of specs) {
    const record = records.find((entry) => entry.hubIds.includes(hubId));
    if (record) selected.push(sampleRow(label, record));
  }
  for (const orientation of ["portrait", "landscape", "square"]) {
    const record = records.find((entry) => entry.attributes.orientation === orientation && !selected.some((row) => row.printable_id === entry.assetId));
    if (record) selected.push(sampleRow(`${orientation} sample`, record));
  }
  return selected;
}

function sampleRow(label, record) {
  const related = record.relatedAssetIds.slice(0, 8).map((assetId) => recordById.get(assetId)).filter(Boolean);
  return {
    sample_group: label,
    printable_id: record.assetId,
    route: record.canonicalPath,
    orientation: record.attributes.orientation || "",
    verified_subject: record.attributes.narrowSubjectCategory || record.attributes.primarySubject || "",
    verified_styles: record.attributes.styles.join("|"),
    verified_seasonal: record.attributes.seasonalClassifications.join("|"),
    related_routes: related.map((entry) => entry.canonicalPath).join("|"),
    verified_signal_matches: related.filter((entry) => sharesSummaryContext(record, entry) || (record.attributes.patternFocused && entry.attributes.patternFocused)).length,
  };
}

function missingFields(record) {
  const fields = [];
  if (!record.attributes.primarySubject) fields.push("primary_subject");
  if (!record.attributes.styles.length) fields.push("style");
  if (!record.attributes.seasonalClassifications.length) fields.push("seasonal");
  if (!record.attributes.detailClassification) fields.push("detail");
  if (!record.attributes.audienceClassification) fields.push("audience");
  return fields;
}

async function readJson(relative) {
  return JSON.parse(await readText(relative));
}

async function readText(relative) {
  return readFile(path.join(ROOT, relative), "utf8");
}

async function writeText(relative, value) {
  const target = path.join(ROOT, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
}

async function writeCsv(relative, rows) {
  if (!rows.length) return writeText(relative, "field,value,occurrence_count,routes,related_context,action\n");
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const output = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
  await writeText(relative, `${output}\n`);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
