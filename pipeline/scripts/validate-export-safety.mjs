#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const SCANNED_EXTENSIONS = new Set([".html", ".txt", ".xml", ".json", ".js"]);

if (!existsSync(OUT)) {
  console.error("Export safety validation not_run: out/ does not exist.");
  process.exit(2);
}

const checks = {
  localOrPrivateUrl: /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?|file:\/\/|[A-Za-z]:\\\\|https?:\/\/[^"'\s]*\.(?:r2\.dev|r2\.cloudflarestorage\.com)/i,
  duplicatePrintablePrefix: /\/printables\/printables\//i,
  staleFragmentNavigation: /href="\#(?:image|printable)-/i,
  liveAdvertisementCode: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client|googletagservices|doubleclick\.net/i,
};
const visibleChecks = {
  svgDownloadOrLink: />\s*Download SVG\s*</i,
  rawAssetNavigation: /<a\b[^>]*href="[^"]+\.(?:webp|png|svg)(?:[?#][^"]*)?"/i,
  fullAssetId: /\b[a-z0-9-]+__[a-z0-9-]+__[0-9a-f]{10}\b/i,
  technicalTitle: />[^<]*(?:ChatGPT|Failed|\b20\d{6}[-_T]\d{4,})[^<]*</i,
  sourceFilename: />[^<]*\.(?:svg|webp|png|jpe?g)[^<]*</i,
  pipelineTerminology: />[^<]*(?:assetId|stableId|object key|pipeline status|source category|successful production assets)[^<]*</i,
  stalePageCopy: />[^<]*(?:Preview\s*&\s*print|Image previews open print controls|Print from the gallery|clean PNG downloads)[^<]*</i,
};
const findings = Object.fromEntries([...Object.keys(checks), ...Object.keys(visibleChecks)].map((name) => [name, []]));
const duplicateAdvertisementSlotIds = [];
const duplicateCanonicalLinks = [];
const duplicateRelatedCollectionHeadings = [];
let scannedFileCount = 0;

walk(OUT, (absolutePath) => {
  if (!SCANNED_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) return;
  scannedFileCount += 1;
  const relativePath = path.relative(OUT, absolutePath).replaceAll("\\", "/");
  const text = readFileSync(absolutePath, "utf8");
  for (const [name, pattern] of Object.entries(checks)) if (pattern.test(text)) findings[name].push(relativePath);
  if (absolutePath.endsWith(".html")) {
    const visibleHtml = text.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
    for (const [name, pattern] of Object.entries(visibleChecks)) if (pattern.test(visibleHtml)) findings[name].push(relativePath);
    const adSlotIds = [...text.matchAll(/\sid="(ad-slot-[^"]+)"/g)].map((match) => match[1]);
    const duplicateAdIds = duplicates(adSlotIds);
    if (duplicateAdIds.length > 0) duplicateAdvertisementSlotIds.push({ relativePath, ids: duplicateAdIds });
    const canonicalCount = (text.match(/<link rel="canonical"/g) || []).length;
    if (canonicalCount > 1) duplicateCanonicalLinks.push({ relativePath, count: canonicalCount });
    const relatedHeadingCount = (visibleHtml.match(/>Related Collections<\/h[1-6]>/gi) || []).length;
    if (relatedHeadingCount > 1) duplicateRelatedCollectionHeadings.push({ relativePath, count: relatedHeadingCount });
  }
});

const printables = JSON.parse(readFileSync(path.join(ROOT, "src/generated/coloring/runtime-printables.json"), "utf8")).records;
const pathCounts = new Map();
for (const printable of printables) pathCounts.set(printable.canonicalPath, (pathCounts.get(printable.canonicalPath) || 0) + 1);
const canonicalCollisions = [...pathCounts].filter(([, count]) => count > 1).map(([canonicalPath, count]) => ({ canonicalPath, count }));
const missingPrintableHtml = printables
  .filter((printable) => !existsSync(path.join(OUT, `${printable.canonicalPath.slice(1)}.html`)))
  .map((printable) => printable.canonicalPath);

const passed = Object.values(findings).every((paths) => paths.length === 0)
  && canonicalCollisions.length === 0
  && missingPrintableHtml.length === 0
  && duplicateAdvertisementSlotIds.length === 0
  && duplicateCanonicalLinks.length === 0
  && duplicateRelatedCollectionHeadings.length === 0;
console.log(JSON.stringify({
  passed,
  scannedFileCount,
  printableCount: printables.length,
  findings: Object.fromEntries(Object.entries(findings).map(([name, paths]) => [name, { count: paths.length, samples: paths.slice(0, 10) }])),
  canonicalCollisions,
  duplicateAdvertisementSlotIds: { count: duplicateAdvertisementSlotIds.length, samples: duplicateAdvertisementSlotIds.slice(0, 10) },
  duplicateCanonicalLinks: { count: duplicateCanonicalLinks.length, samples: duplicateCanonicalLinks.slice(0, 10) },
  duplicateRelatedCollectionHeadings: { count: duplicateRelatedCollectionHeadings.length, samples: duplicateRelatedCollectionHeadings.slice(0, 10) },
  missingPrintableHtml: { count: missingPrintableHtml.length, samples: missingPrintableHtml.slice(0, 10) },
}, null, 2));
if (!passed) process.exitCode = 1;

function walk(directory, visitor) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolutePath, visitor);
    else visitor(absolutePath);
  }
}

function duplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value);
}
