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
  page("trust", "privacy.html", "condensed", 1),
  page("htmlSitemap", "sitemap.html", "condensed", 1),
  page("notFound", "404.html", "none", 0),
];

for (const entry of cases) {
  if (!entry.exists) continue;
  const html = readFileSync(path.join(OUT, entry.relativePath), "utf8");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const slots = [...html.matchAll(/data-ad-slot="([^"]+)"/g)].map((match) => match[1]);
  entry.checks = {
    oneH1: (html.match(/<h1\b/g) || []).length === 1,
    uniqueIds: ids.length === new Set(ids).size,
    layoutMode: html.includes(`data-ad-layout="${entry.expectedLayout}"`),
    expectedSlotCount: slots.length === entry.expectedSlotCount,
    uniqueSlots: slots.length === new Set(slots).size,
    topBeforeH1: entry.expectedSlotCount === 0 || html.indexOf('data-ad-logical-placement="top-banner"') < html.indexOf("<h1"),
    noLiveAds: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(html),
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
    const relatedStart = html.indexOf("Related printable pages", mainStart);
    const mainRegion = html.slice(mainStart, relatedStart);
    Object.assign(entry.checks, {
      previewActionsTogether: mainStart >= 0 && mainRegion.includes(">Print<") && mainRegion.includes(">Download<"),
      noAdInsidePreviewActions: !mainRegion.includes("data-ad-placeholder"),
      relatedBannerAfterCards: html.indexOf('data-ad-logical-placement="related-banner"') > html.indexOf("Related printable pages"),
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
