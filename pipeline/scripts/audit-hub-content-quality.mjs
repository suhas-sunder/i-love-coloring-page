#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FORBIDDEN = [
  "selected from successful production assets", "selected from approved production assets", "existing production assets",
  "rotated on the existing three-day schedule", "no indexable per-image pages", "Using this collection",
  "Choose a printable", "Images and titles open printable pages", "Print and download actions stay separate",
  "perfect for all ages", "spark your creativity", "hours of entertainment", "unleash your imagination",
  "something for everyone", "ideal for home or classroom", "relaxing and enjoyable", "high-quality printable",
];

const hubsManifest = await readJson("src/generated/coloring/runtime-hubs.json");
const editorialManifest = await readJson("src/config/hub-editorial-content.json");
const componentText = await Promise.all([
  readText("src/components/coloring/HubPageContent.tsx"),
  readText("src/components/coloring/CollectionPageHeader.tsx"),
  readText("app/page.tsx"),
  readText("app/coloring-pages/page.tsx"),
]).then((parts) => parts.join("\n"));

const indexable = hubsManifest.hubs.filter((hub) => hub.indexable);
const normalized = new Map();
for (const hub of indexable) {
  const key = normalize(hub.intro);
  normalized.set(key, [...(normalized.get(key) || []), hub.route]);
}
const duplicateIntros = [...normalized.entries()].filter(([, routes]) => routes.length > 1).map(([value, routes]) => ({ value, routes }));
const missingEditorial = hubsManifest.hubs.filter((hub) => !editorialManifest.hubs[hub.hubId]).map((hub) => hub.route);
const tierMismatches = hubsManifest.hubs.filter((hub) => hub.contentTier !== editorialManifest.hubs[hub.hubId]?.tier).map((hub) => hub.route);
const forbiddenOccurrences = [];
const visibleText = `${componentText}\n${hubsManifest.hubs.map((hub) => JSON.stringify(hub.editorial)).join("\n")}`;
for (const phrase of FORBIDDEN) if (visibleText.toLowerCase().includes(phrase.toLowerCase())) forbiddenOccurrences.push(phrase);
const weakRecords = hubsManifest.hubs.filter((hub) => {
  const record = hub.editorial;
  if (!record?.introduction || wordCount(record.introduction) < 7) return true;
  if (record.tier === "A" && (!record.scope || !record.distinction || !record.selectionGuidance)) return true;
  return false;
}).map((hub) => hub.route);
const multipleRelatedSections = (componentText.match(/Related Collections/g) || []).length > 1;
const countsEmbedded = hubsManifest.hubs.filter((hub) => /\b\d{2,}(?:,\d{3})*\b/.test(hub.intro)).map((hub) => hub.route);
const contentQualityPassed =
  missingEditorial.length === 0 &&
  tierMismatches.length === 0 &&
  duplicateIntros.length === 0 &&
  forbiddenOccurrences.length === 0 &&
  weakRecords.length === 0 &&
  !multipleRelatedSections &&
  countsEmbedded.length === 0;
const payload = {
  generatedAt: new Date().toISOString(),
  runId: "explicit-hub-editorial-quality-v2",
  summary: {
    hubsChecked: hubsManifest.hubs.length,
    indexableHubsChecked: indexable.length,
    explicitEditorialRecords: Object.keys(editorialManifest.hubs).length,
    missingEditorialCount: missingEditorial.length,
    tierMismatchCount: tierMismatches.length,
    duplicateIntroCount: duplicateIntros.length,
    forbiddenWordingCount: forbiddenOccurrences.length,
    weakEditorialRecordCount: weakRecords.length,
    manuallyEmbeddedCountTotal: countsEmbedded.length,
    multipleRelatedSections,
    contentQualityPassed,
  },
  duplicateIntros,
  forbiddenOccurrences,
  missingEditorial,
  tierMismatches,
  weakRecords,
  countsEmbedded,
};
await writeJson("pipeline/manifests/content-quality-score-results.json", payload);
await writeText("pipeline/reports/content-quality-score-report.md", render(payload));
console.log(JSON.stringify(payload.summary, null, 2));
if (!contentQualityPassed) process.exitCode = 1;

function render(result) {
  const s = result.summary;
  return `# Hub Content Quality Score

- Hubs checked: ${s.hubsChecked}
- Indexable hubs checked: ${s.indexableHubsChecked}
- Explicit editorial records: ${s.explicitEditorialRecords}
- Duplicate introductions: ${s.duplicateIntroCount}
- Forbidden or internal wording: ${s.forbiddenWordingCount}
- Weak editorial records: ${s.weakEditorialRecordCount}
- Manually embedded count totals: ${s.manuallyEmbeddedCountTotal}
- Multiple Related Collections modules: ${s.multipleRelatedSections}
- Content quality passed: ${s.contentQualityPassed}

This gate evaluates explicit route records and visitor value. It deliberately has no arbitrary minimum article length.
`;
}

function normalize(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function wordCount(value) {
  return String(value).split(/\s+/).filter(Boolean).length;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, value) {
  await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const target = path.join(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
}
