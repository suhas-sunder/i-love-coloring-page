import {
  ASSET_BASE_URL,
  SITE_URL,
  ensureOutputDirs,
  extractImageLocs,
  extractXmlLocs,
  fetchWithRedirects,
  readJson,
  readText,
  writeJson,
  writeReport,
} from "./live-seo-utils.mjs";

async function main() {
  await ensureOutputDirs();
  const expectedSiteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const trustPagesSource = await readText("src/lib/trust/trustPages.ts");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const runtimeHubLocCount = (expectedSiteMap.entries || []).length;
  const expectedLocCount = 1 + runtimeHubLocCount + countIndexableTrustPages(trustPagesSource);
  const deferredIds = new Set((deferred.items || deferred.records || []).map((entry) => entry.assetId).filter(Boolean));

  const sitemap = await fetchWithRedirects(`${SITE_URL}/sitemap.xml`);
  const imageSitemap = await fetchWithRedirects(`${SITE_URL}/image-sitemap.xml`);
  const robots = await fetchWithRedirects(`${SITE_URL}/robots.txt`);
  const sitemapLocs = extractXmlLocs(sitemap.bodyText || "");
  const allImageLocMatches = extractImageLocs(imageSitemap.bodyText || "");
  const imageLocs = [...new Set(allImageLocMatches)];
  const regularSitemapChecks = {
    loads: sitemap.status === 200,
    contentType: sitemap.contentType,
    locCount: sitemapLocs.length,
    expectedLocCount,
    runtimeHubLocCount,
    containsHomepage: sitemapLocs.includes(SITE_URL) || sitemapLocs.includes(`${SITE_URL}/`),
    containsColoringPages: sitemapLocs.includes(`${SITE_URL}/coloring-pages`),
    containsAnimals: sitemapLocs.includes(`${SITE_URL}/coloring-pages/animals`),
    containsTrex: sitemapLocs.includes(`${SITE_URL}/coloring-pages/t-rex`),
    containsTrustPages: ["/contact", "/privacy", "/terms", "/about"].every((route) => sitemapLocs.includes(`${SITE_URL}${route}`)),
    excludesPerImageRoutes: !sitemapLocs.some((loc) => loc.includes("#asset-") || /\/coloring-pages\/[^/]+\/[^/]+/.test(new URL(loc).pathname.replace(/\/page\/\d+$/, ""))),
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(sitemap.bodyText || ""),
    noR2Dev: !/r2\.dev/i.test(sitemap.bodyText || ""),
    noDuplicatePrefix: !/coloring-pages\/coloring-pages/i.test(sitemap.bodyText || ""),
  };
  const imageSitemapChecks = {
    loads: imageSitemap.status === 200,
    contentType: imageSitemap.contentType,
    imageEntryCount: allImageLocMatches.length,
    uniqueImageEntryCount: imageLocs.length,
    expectedImageEntryCount: 6352,
    containsWebpEntries: imageLocs.some((loc) => loc.startsWith(`${ASSET_BASE_URL}/webp/`) && loc.endsWith(".webp")),
    excludesSvgUrls: !/\.svg(?:[<"&?]|$)|\/svg\//i.test(imageSitemap.bodyText || ""),
    excludesPngThumbUrls: !/\/(?:png|thumbs?)\/|(?:\.png|thumbnail)/i.test(imageSitemap.bodyText || ""),
    excludesDeferredRecords: ![...deferredIds].some((id) => id && (imageSitemap.bodyText || "").includes(id)),
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(imageSitemap.bodyText || ""),
    noR2Dev: !/r2\.dev/i.test(imageSitemap.bodyText || ""),
    noDuplicatePrefix: !/coloring-pages\/coloring-pages/i.test(imageSitemap.bodyText || ""),
  };
  const robotsChecks = {
    loads: robots.status === 200,
    referencesRegularSitemap: /Sitemap:\s*https:\/\/www\.ilovecoloringpage\.com\/sitemap\.xml/i.test(robots.bodyText || ""),
    referencesImageSitemap: /Sitemap:\s*https:\/\/www\.ilovecoloringpage\.com\/image-sitemap\.xml/i.test(robots.bodyText || ""),
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(robots.bodyText || ""),
    noR2Dev: !/r2\.dev/i.test(robots.bodyText || ""),
  };

  const summary = {
    regularSitemapChecked: true,
    imageSitemapChecked: true,
    robotsChecked: true,
    regularSitemapPassed: Object.values(regularSitemapChecks).every(Boolean),
    imageSitemapPassed: Object.values(imageSitemapChecks).every(Boolean),
    robotsPassed: Object.values(robotsChecks).every(Boolean),
    regularSitemapLocCount: sitemapLocs.length,
    expectedRegularSitemapLocCount: expectedLocCount,
    imageSitemapEntryCount: allImageLocMatches.length,
    uniqueImageSitemapEntryCount: imageLocs.length,
    expectedImageSitemapEntryCount: 6352,
    noLocalhost: regularSitemapChecks.noLocalhost && imageSitemapChecks.noLocalhost && robotsChecks.noLocalhost,
    noR2Dev: regularSitemapChecks.noR2Dev && imageSitemapChecks.noR2Dev && robotsChecks.noR2Dev,
    noDuplicateColoringPagesPrefix: regularSitemapChecks.noDuplicatePrefix && imageSitemapChecks.noDuplicatePrefix,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    phase: "live-seo-verification",
    summary,
    regularSitemap: regularSitemapChecks,
    imageSitemap: imageSitemapChecks,
    robots: robotsChecks,
    sampleRegularLocs: sitemapLocs.slice(0, 20),
    sampleImageLocs: imageLocs.slice(0, 20),
  };

  await writeJson("pipeline/manifests/live-seo-sitemap-results.json", result);
  await writeReport("pipeline/reports/live-seo-sitemap-report.md", report(result));
  console.log(`Live SEO sitemap check complete: ${summary.regularSitemapPassed && summary.imageSitemapPassed && summary.robotsPassed ? "passed" : "blocked"}.`);
}

function report(result) {
  const s = result.summary;
  return `# Live SEO Sitemap Report

- Regular sitemap checked: ${s.regularSitemapChecked}
- Regular sitemap passed: ${s.regularSitemapPassed}
- Regular sitemap loc count: ${s.regularSitemapLocCount} (expected ${s.expectedRegularSitemapLocCount})
- Image sitemap checked: ${s.imageSitemapChecked}
- Image sitemap passed: ${s.imageSitemapPassed}
- Image sitemap image entries: ${s.imageSitemapEntryCount} (expected ${s.expectedImageSitemapEntryCount})
- Robots checked: ${s.robotsChecked}
- Robots passed: ${s.robotsPassed}
- No localhost/r2.dev: ${s.noLocalhost && s.noR2Dev}
- No duplicate coloring-pages/coloring-pages prefix: ${s.noDuplicateColoringPagesPrefix}
`;
}

function countIndexableTrustPages(source) {
  return [...source.matchAll(/\{[\s\S]*?path:\s*["']\/[^"']+["'][\s\S]*?indexable:\s*true[\s\S]*?\}/g)].length;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
