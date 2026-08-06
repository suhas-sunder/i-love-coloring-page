#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const printable = JSON.parse(readFileSync(path.join(ROOT, "src/generated/coloring/runtime-printables.json"), "utf8")).records[0];

if (!existsSync(OUT)) {
  console.error("Public page layout validation not_run: out/ does not exist.");
  process.exit(2);
}

const cases = [
  page("homepage", "index.html", "full", 6),
  page("gallery", "coloring-pages.html", "full", 6),
  page("largeHub", "coloring-pages/animals.html", "full", 6),
  page("smallHub", "coloring-pages/forget-me-not.html", "full", 6),
  page("hubPagination", "coloring-pages/animals/page/2.html", "condensed", 3),
  page("printable", `${printable.canonicalPath.slice(1)}.html`, "full", 6),
  page("trust", "privacy.html", "none", 0),
  page("htmlSitemap", "sitemap.html", "none", 0),
  page("notFound", "404.html", "none", 0),
];

for (const entry of cases) {
  if (!entry.exists) continue;
  const html = readFileSync(path.join(OUT, entry.relativePath), "utf8");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const allSlotValues = [...html.matchAll(/data-ad-slot="([^"]+)"/g)].map((match) => match[1]);
  const slots = allSlotValues.filter((slotId) => !/^\d{10}$/.test(slotId));
  const liveUnits = allSlotValues.filter((slotId) => /^\d{10}$/.test(slotId));
  const meaningfulSectionMarker = {
    homepage: 'data-page-section="primary-collections"',
    gallery: 'data-page-section="gallery"',
    largeHub: 'data-page-section="gallery"',
    smallHub: 'data-page-section="gallery"',
    hubPagination: 'data-page-section="paginated-gallery"',
    printable: 'data-page-section="printable-main"',
  }[entry.name];
  const secondaryFlowIndex = html.indexOf('data-ad-flow-version="balanced-mid-content-v1"');
  entry.checks = {
    oneH1: (html.match(/<h1\b/g) || []).length === 1,
    uniqueIds: ids.length === new Set(ids).size,
    layoutMode: html.includes(`data-ad-layout="${entry.expectedLayout}"`),
    expectedSlotCount: slots.length === entry.expectedSlotCount,
    uniqueSlots: slots.length === new Set(slots).size,
    topBeforeH1: entry.expectedSlotCount === 0 || html.indexOf('data-ad-logical-placement="top-banner"') < html.indexOf("<h1"),
    balancedFlowMarker: entry.expectedSlotCount === 0
      ? secondaryFlowIndex === -1
      : (html.match(/data-ad-flow-version="balanced-mid-content-v1"/g) || []).length === 1,
    secondaryAfterMeaningfulContent: entry.expectedSlotCount === 0
      || (Boolean(meaningfulSectionMarker) && secondaryFlowIndex > html.indexOf(meaningfulSectionMarker)),
    correctAdvertisingArchitecture: entry.expectedSlotCount === 0
      ? !/data-ad-fallback-policy=|data-ad-client=|data-ad-fallback=/i.test(html)
      : slots.length > 0 && liveUnits.length === slots.length
        && (html.match(/data-ad-fallback-policy="page-all-or-none-v1"/g) || []).length === slots.length
        && (html.match(/data-ad-fallback="true" hidden=""/g) || []).length === slots.length
        && (html.match(/data-ad-client="ca-pub-4810616735714570"/g) || []).length === liveUnits.length,
  };
  entry.slots = slots;

  if (entry.name === "hubPagination") {
    Object.assign(entry.checks, {
      pageNumberHeading: /<h1[^>]*>[^<]*Page 2<\/h1>/.test(html),
      noFeatured: !html.includes('data-page-section="featured-printables"'),
      noSupportingInformation: !html.includes('data-page-section="supporting-information"'),
      noSquare: !html.includes('data-ad-logical-placement="supporting-square"'),
      pagination: html.includes('aria-label="Gallery pagination"'),
    });
  }
  if (entry.name === "printable") {
    const mainStart = html.indexOf('data-page-section="printable-main"');
    const secondaryMarker = html.indexOf('data-ad-flow-version="balanced-mid-content-v1"', mainStart);
    const mainEnd = html.lastIndexOf('<div class="ad-slot', secondaryMarker);
    const relatedStart = html.indexOf("Related printable pages", mainStart);
    const mainRegion = html.slice(mainStart, mainEnd);
    Object.assign(entry.checks, {
      previewActionsTogether: mainStart >= 0
        && mainRegion.includes(">Print<")
        && mainRegion.includes(">Download PDF<")
        && mainRegion.includes(">Download image<"),
      noAdInsidePreviewActions: !mainRegion.includes("data-ad-fallback"),
      defaultOnlyPrintableExperience:
        (html.match(/data-printable-experience-version="default-only-v2"/g) || []).length === 1
        && !html.includes('data-printable-settings-version="paper-controls-v1"'),
      relatedBannerAfterCards:
        html.indexOf('data-ad-logical-placement="related-banner"') > html.indexOf("Related printable pages"),
    });
  }
  if (entry.name === "largeHub") {
    Object.assign(entry.checks, {
      oneRelatedCollectionsHeading: (html.match(/>Related Collections<\/h[1-6]>/g) || []).length === 1,
      searchPresent: html.includes('type="search"'),
    });
  }
}

const passed = cases.every((entry) => entry.exists && Object.values(entry.checks).every(Boolean));
console.log(JSON.stringify({ passed, cases }, null, 2));
if (!passed) process.exitCode = 1;

function page(name, relativePath, expectedLayout, expectedSlotCount) {
  return {
    name,
    relativePath,
    expectedLayout,
    expectedSlotCount,
    exists: existsSync(path.join(OUT, relativePath)),
    checks: {},
    slots: [],
  };
}
