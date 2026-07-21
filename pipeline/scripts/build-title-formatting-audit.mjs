#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runtime = JSON.parse(await readFile(path.join(ROOT, "src/generated/coloring/runtime-printables.json"), "utf8"));
const titleManifest = JSON.parse(await readFile(path.join(ROOT, "pipeline/manifests/printable-title-manifest.json"), "utf8"));
const records = runtime.records;
const variants = records.filter((record) => record.designNumber != null);
const suffixes = tally(records, (record) => record.displayTitle.match(/(?:Design|Version|Page|Variant|Number|Set)\s+\d+$/i)?.[0] || "none");
const rows = records.filter((record) => record.designNumber != null).map((record) => ({
  assetId: record.assetId,
  route: record.canonicalPath,
  baseTitle: titleManifest.entries.find((entry) => entry.stableId === record.stableId)?.correctedBaseTitle || record.publicTitle,
  displayTitle: record.displayTitle,
  designNumber: record.designNumber,
  separator: record.displayTitle.includes(": Design ") ? "colon" : "unexpected",
  metadataTitle: record.metadataTitle,
}));
await writeText("reports/title-variant-patterns.csv", ["asset_id,route,base_title,display_title,design_number,separator,metadata_title", ...rows.map((row) => [row.assetId, row.route, row.baseTitle, row.displayTitle, row.designNumber, row.separator, row.metadataTitle].map(csv).join(","))].join("\n") + "\n");
await writeText("reports/title-formatting-audit.md", `# Printable title formatting audit\n\n- Printable routes: ${records.length}\n- Duplicate-title groups: ${titleManifest.summary.duplicateGroupCount}\n- Variant-labelled routes: ${variants.length}\n- Variant labels with the required colon separator: ${rows.filter((row) => row.separator === "colon").length}\n- Unexpected variant separators: ${rows.filter((row) => row.separator !== "colon").length}\n- Duplicate display titles: ${records.length - new Set(records.map((record) => record.displayTitle)).size}\n\n## Formatter contract\n\nThe title model keeps the base title and design number distinct. A duplicate route renders as \`Base title: Design N\`; the same model supplies the breadcrumb, H1, card title, metadata title, Open Graph title, JSON-LD name, image caption, and accessible image text. Canonical routes and stable design-number assignments are unchanged.\n\n## Suffix patterns\n\n| Suffix | Occurrences |\n| --- | ---: |\n${[...suffixes.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([suffix, count]) => `| ${suffix} | ${count} |`).join("\n")}\n`);
process.stdout.write(`Audited ${records.length} printable titles and ${variants.length} variant labels.\n`);

function tally(values, keyFor) { const map = new Map(); for (const value of values) { const key = keyFor(value); map.set(key, (map.get(key) || 0) + 1); } return map; }
function csv(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
async function writeText(relativePath, value) { const target = path.join(ROOT, relativePath); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, value, "utf8"); }
