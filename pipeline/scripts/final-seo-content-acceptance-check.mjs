#!/usr/bin/env node

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  REPO_ROOT,
  readJson,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const RUN_ID = "final-seo-content-acceptance";
const EXPECTED_RUNTIME_HUBS = 163;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const quality = await readJson("src/generated/coloring/hub-content-quality.json");
  const hubSeo = await readJson("src/generated/coloring/hub-seo-content.json");
  const generated = await readJson("pipeline/manifests/content-quality-generated-data.json");
  const score = await readJson("pipeline/manifests/content-quality-score-results.json");
  const layout = await readJson("pipeline/manifests/content-quality-layout-results.json");
  const metadata = await readJson("pipeline/manifests/content-quality-metadata-results.json");
  const hubPageContent = await readText("src/components/coloring/HubPageContent.tsx");
  const seoContentSection = await readText("src/components/coloring/SeoContentSection.tsx");

  const contentText = quality.hubs.map((hub) => JSON.stringify(hub.content)).join("\n");
  const intros = quality.hubs.map((hub) => normalizeText(hub.content?.shortIntro || ""));
  const duplicateIntroGroups = findDuplicateValues(intros);
  const repeatedStarts = findRepeatedStarts(quality.hubs);
  const unsupportedClaimPattern =
    /Download SVG|SVG download|online coloring|color online|commercial use|royalty-free|license included|five stars|rated \d|expert author|staff expert|doctor-reviewed|teacher-approved/i;
  const fillerPattern =
    /perfect for everyone|fun for all ages|something for everyone|endless creativity|let your imagination run wild|hours of fun/i;
  const wallOfTextSections = [];
  for (const hub of quality.hubs) {
    for (const section of hub.content?.belowGallerySections || []) {
      if ((section.body || "").length > 720) wallOfTextSections.push({ hubId: hub.hubId, heading: section.heading, length: section.body.length });
    }
  }

  const sourceOrder = {
    galleryBeforeSeoContent: hubPageContent.indexOf("GallerySearch") >= 0 && hubPageContent.indexOf("GallerySearch") < hubPageContent.indexOf("SeoContentSection"),
    seoContentSectionExists: /seo-content-section/.test(seoContentSection),
    noSeoContentBeforeGallery: !/SeoContentSection[\s\S]{0,400}GallerySearch/.test(hubPageContent),
  };

  const summary = {
    hubs_checked: runtimeHubs.hubs.length,
    quality_records: quality.hubs.length,
    hub_seo_records: hubSeo.hubs.length,
    all_163_hubs_have_generated_content: quality.hubs.length === EXPECTED_RUNTIME_HUBS && generated.summary?.allPublicHubsHaveQualityRecords === true,
    duplicate_intros: duplicateIntroGroups.length,
    unsupported_claims: countPattern(contentText, unsupportedClaimPattern),
    svg_download_claims: countPattern(contentText, /Download SVG|SVG download/i),
    online_coloring_claims: countPattern(contentText, /online coloring|color online/i),
    keyword_stuffing_risk: score.summary?.keywordStuffingRiskCount || 0,
    content_below_gallery: Boolean(sourceOrder.galleryBeforeSeoContent && sourceOrder.noSeoContentBeforeGallery && layout.summary?.galleryFirstPlacement),
    no_wall_of_text_above_gallery: sourceOrder.galleryBeforeSeoContent && wallOfTextSections.length === 0,
    generic_filler_sections: countPattern(contentText, fillerPattern),
    repeated_opening_phrase_groups: repeatedStarts.length,
    content_matches_intent: Boolean(score.summary?.intentMatchPassed && score.summary?.internalLinkQualityPassed),
    fake_commercial_use_claims: countPattern(contentText, /commercial use|royalty-free|license included/i),
    fake_ratings_reviews_claims: countPattern(contentText, /five stars|rated \d|reviewed by|customer reviews/i),
    fake_author_expert_claims: countPattern(contentText, /expert author|staff expert|doctor-reviewed|certified|teacher-approved/i),
    metadata_passed: Boolean(metadata.summary?.descriptionsUnique && metadata.summary?.noSvgClaims && metadata.summary?.noOnlineColoringClaims),
  };

  const blockers = [];
  if (summary.hubs_checked !== EXPECTED_RUNTIME_HUBS) blockers.push("runtime hub count mismatch.");
  if (!summary.all_163_hubs_have_generated_content) blockers.push("not every runtime hub has generated content.");
  if (summary.duplicate_intros !== 0) blockers.push("duplicate intros found.");
  if (summary.unsupported_claims !== 0) blockers.push("unsupported claims found.");
  if (summary.svg_download_claims !== 0) blockers.push("SVG download claims found.");
  if (summary.online_coloring_claims !== 0) blockers.push("online coloring claims found.");
  if (summary.keyword_stuffing_risk !== 0) blockers.push("keyword stuffing risk found.");
  if (!summary.content_below_gallery) blockers.push("SEO content is not below or secondary to gallery.");
  if (!summary.no_wall_of_text_above_gallery) blockers.push("wall-of-text risk found.");
  if (summary.generic_filler_sections !== 0) blockers.push("generic filler phrases found.");
  if (summary.repeated_opening_phrase_groups > 4) blockers.push("too many repeated opening phrase groups.");
  if (!summary.content_matches_intent) blockers.push("intent or internal-link quality failed.");
  if (summary.fake_commercial_use_claims !== 0) blockers.push("fake commercial-use claims found.");
  if (summary.fake_ratings_reviews_claims !== 0) blockers.push("fake ratings/reviews claims found.");
  if (summary.fake_author_expert_claims !== 0) blockers.push("fake author/expert claims found.");
  if (!summary.metadata_passed) blockers.push("metadata quality failed.");
  summary.content_quality_passed = blockers.length === 0;
  summary.blockers = blockers;

  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    sourceFiles: [
      "src/generated/coloring/hub-content-quality.json",
      "src/generated/coloring/hub-seo-content.json",
      "src/components/coloring/HubPageContent.tsx",
      "src/components/coloring/SeoContentSection.tsx",
    ],
    sourceOrder,
    duplicateIntroGroups,
    repeatedOpeningPhraseGroups: repeatedStarts,
    wallOfTextSections,
    summary,
  };

  await writeJson("pipeline/manifests/final-seo-content-acceptance-results.json", payload);
  await writeText("pipeline/reports/final-seo-content-acceptance-report.md", renderReport(payload));
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.content_quality_passed) process.exitCode = 1;
}

function normalizeText(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function countPattern(value, regex) {
  return (String(value).match(regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`)) || []).length;
}

function findDuplicateValues(values) {
  const groups = new Map();
  values.forEach((value, index) => {
    if (!value) return;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(index);
  });
  return [...groups.entries()].filter(([, indexes]) => indexes.length > 1).map(([value, indexes]) => ({ value, indexes }));
}

function findRepeatedStarts(hubs) {
  const groups = new Map();
  for (const hub of hubs) {
    const intro = normalizeText(hub.content?.shortIntro || "");
    const start = intro.split(" ").slice(0, 6).join(" ");
    if (!start) continue;
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(hub.hubId);
  }
  return [...groups.entries()]
    .filter(([, hubIds]) => hubIds.length >= 4)
    .map(([phrase, hubIds]) => ({ phrase, hubIds }));
}

function renderReport(payload) {
  return `# Final SEO Content Acceptance

${renderTable(Object.entries(payload.summary).filter(([key]) => key !== "blockers").map(([key, value]) => [key, value]))}

## Source Order
${renderTable(Object.entries(payload.sourceOrder).map(([key, value]) => [key, value]))}

## Blockers
${payload.summary.blockers.length ? payload.summary.blockers.map((item) => `- ${item}`).join("\n") : "- None."}
`;
}
