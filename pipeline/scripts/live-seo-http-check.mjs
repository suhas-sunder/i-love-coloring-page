import {
  HTTP_CHECK_URLS,
  SITE_URL,
  buildContextCheck,
  ensureOutputDirs,
  fetchWithRedirects,
  hasSvgDownloadCopy,
  isSelfRedirect,
  writeContextArtifacts,
  writeJson,
  writeReport,
} from "./live-seo-utils.mjs";

async function main() {
  await ensureOutputDirs();
  const context = await buildContextCheck();
  await writeContextArtifacts(context);

  const checks = [];
  for (const url of HTTP_CHECK_URLS) {
    const response = await fetchWithRedirects(url, { timeoutMs: 30000 });
    const body = response.bodyText || "";
    const isHtmlRoute = /\/(?:$|coloring-pages|contact|privacy)/.test(new URL(url).pathname) && !url.endsWith(".xml") && !url.endsWith(".txt");
    checks.push({
      url,
      status: response.status,
      finalUrl: response.finalUrl,
      contentType: response.contentType,
      bodySize: response.bodySize,
      bodyText: url.endsWith("/robots.txt") ? body : "",
      redirected: response.redirected,
      redirects: response.redirects,
      validRedirect: response.redirects.every((redirect) => redirect.to.startsWith(SITE_URL)),
      selfRedirect: isSelfRedirect(response),
      routeCurrent: response.status === 200 && (!isHtmlRoute || /application\/ld\+json/i.test(body)),
      hasJsonLd: /application\/ld\+json/i.test(body),
      hasOgImage: /property=["']og:image["']|name=["']twitter:image["']/i.test(body),
      hasLocalhostLeak: /localhost|127\.0\.0\.1/i.test(body),
      hasR2DevLeak: /r2\.dev/i.test(body),
      hasPrivateR2Leak: /cloudflarestorage\.com|amazonaws\.com/i.test(body),
      hasAppApiReference: /\/api\//i.test(body),
      hasSvgDownloadCopy: hasSvgDownloadCopy(body),
      error: response.error || null,
    });
  }

  const byUrl = new Map(checks.map((entry) => [entry.url, entry]));
  const home = byUrl.get(`${SITE_URL}/`);
  const robots = byUrl.get(`${SITE_URL}/robots.txt`);
  const imageSitemap = byUrl.get(`${SITE_URL}/image-sitemap.xml`);
  const sitemap = byUrl.get(`${SITE_URL}/sitemap.xml`);
  const freshnessSummary = {
    productionSiteReachable: home?.status === 200,
    productionDeployCurrent:
      Boolean(home?.hasJsonLd) &&
      checks.filter((entry) => entry.url.includes("/coloring-pages")).some((entry) => entry.hasJsonLd) &&
      Boolean(imageSitemap?.status === 200) &&
      Boolean(robots?.bodySize && /image-sitemap\.xml/i.test(robotsBody(robots))),
    jsonLdScriptTagsPresent: checks.filter((entry) => !entry.url.endsWith(".xml") && !entry.url.endsWith(".txt")).every((entry) => entry.hasJsonLd),
    ogImageMetadataPresent: checks.filter((entry) => !entry.url.endsWith(".xml") && !entry.url.endsWith(".txt")).every((entry) => entry.hasOgImage),
    robotsReferencesBothSitemaps: /sitemap\.xml/i.test(robotsBody(robots)) && /image-sitemap\.xml/i.test(robotsBody(robots)),
    liveImageSitemapExists: imageSitemap?.status === 200,
    liveRegularSitemapExists: sitemap?.status === 200,
    noLocalhostLeak: !checks.some((entry) => entry.hasLocalhostLeak),
    noR2DevLeak: !checks.some((entry) => entry.hasR2DevLeak),
    noPrivateR2EndpointLeak: !checks.some((entry) => entry.hasPrivateR2Leak),
    noAppApiReferences: !checks.some((entry) => entry.hasAppApiReference),
    noSvgDownloadLabelsOrLinks: !checks.some((entry) => entry.hasSvgDownloadCopy),
    ownerActionIfStale: "Trigger a fresh Netlify production deploy from ver-5-deployed-may-13-2026 at commit 0e18282 or later.",
  };
  const freshness = {
    generatedAt: new Date().toISOString(),
    phase: "live-seo-verification",
    summary: freshnessSummary,
    evidence: checks.map((entry) => ({
      url: entry.url,
      status: entry.status,
      finalUrl: entry.finalUrl,
      hasJsonLd: entry.hasJsonLd,
      hasOgImage: entry.hasOgImage,
      bodySize: entry.bodySize,
    })),
  };

  const summary = {
    checkedUrlCount: checks.length,
    productionReachable: freshnessSummary.productionSiteReachable,
    productionDeployCurrent: freshnessSummary.productionDeployCurrent,
    routeCheckPassed: checks.every((entry) => entry.status === 200 && !entry.selfRedirect && !entry.hasLocalhostLeak && !entry.hasR2DevLeak && !entry.hasPrivateR2Leak),
    selfRedirectFound: checks.some((entry) => entry.selfRedirect),
    allRedirectsValid: checks.every((entry) => entry.validRedirect),
    noLocalhostLeak: freshnessSummary.noLocalhostLeak,
    noR2DevLeak: freshnessSummary.noR2DevLeak,
    noPrivateR2EndpointLeak: freshnessSummary.noPrivateR2EndpointLeak,
    noAppApiReferences: freshnessSummary.noAppApiReferences,
    noSvgDownloadLabelsOrLinks: freshnessSummary.noSvgDownloadLabelsOrLinks,
  };
  const result = {
    generatedAt: new Date().toISOString(),
    phase: "live-seo-verification",
    summary,
    checks,
  };

  await writeJson("pipeline/manifests/live-seo-http-results.json", result);
  await writeReport("pipeline/reports/live-seo-http-report.md", report(result));
  await writeJson("pipeline/manifests/live-seo-deploy-freshness-check.json", freshness);
  await writeReport("pipeline/reports/live-seo-deploy-freshness-check.md", freshnessReport(freshness));
  console.log(`Live SEO HTTP check complete: ${summary.routeCheckPassed ? "passed" : "blocked"}.`);
}

function robotsBody(entry) {
  return entry?.bodyText || "";
}

function report(result) {
  const s = result.summary;
  return `# Live SEO HTTP Report

- URLs checked: ${s.checkedUrlCount}
- Production reachable: ${s.productionReachable}
- Production deploy appears current: ${s.productionDeployCurrent}
- Route check passed: ${s.routeCheckPassed}
- Self-redirect found: ${s.selfRedirectFound}
- Redirects valid: ${s.allRedirectsValid}
- No localhost/r2.dev/private leaks: ${s.noLocalhostLeak && s.noR2DevLeak && s.noPrivateR2EndpointLeak}
- No app/api references: ${s.noAppApiReferences}
- No SVG download labels or links: ${s.noSvgDownloadLabelsOrLinks}

## Routes

${result.checks.map((entry) => `- ${entry.url}: ${entry.status}, final ${entry.finalUrl}, ${entry.contentType || "unknown content type"}, ${entry.bodySize} bytes`).join("\n")}
`;
}

function freshnessReport(freshness) {
  const s = freshness.summary;
  return `# Live SEO Deploy Freshness Check

- Production site reachable: ${s.productionSiteReachable}
- Production deploy appears current: ${s.productionDeployCurrent}
- JSON-LD script tags present: ${s.jsonLdScriptTagsPresent}
- OG image metadata present: ${s.ogImageMetadataPresent}
- robots.txt references both sitemaps: ${s.robotsReferencesBothSitemaps}
- image-sitemap.xml exists: ${s.liveImageSitemapExists}
- sitemap.xml exists: ${s.liveRegularSitemapExists}
- No localhost/r2.dev/private endpoint leak: ${s.noLocalhostLeak && s.noR2DevLeak && s.noPrivateR2EndpointLeak}
- No app/api references: ${s.noAppApiReferences}
- No SVG download labels or links: ${s.noSvgDownloadLabelsOrLinks}
- Owner action if stale: ${s.productionDeployCurrent ? "none" : s.ownerActionIfStale}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
