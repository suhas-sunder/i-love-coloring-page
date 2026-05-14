import {
  ALLOWED_SCHEMA_TYPES,
  FORBIDDEN_SCHEMA_TYPES,
  JSONLD_SAMPLE_PATHS,
  SITE_URL,
  canonicalSiteUrl,
  collectTypes,
  collectUrlLikeValues,
  ensureOutputDirs,
  extractJsonLd,
  fetchWithRedirects,
  readJson,
  writeJson,
  writeReport,
} from "./live-seo-utils.mjs";

async function main() {
  await ensureOutputDirs();
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const deferredIds = new Set((deferred.items || deferred.records || []).map((entry) => entry.assetId).filter(Boolean));
  const pages = [];

  for (const pagePath of JSONLD_SAMPLE_PATHS) {
    const url = pagePath === "/" ? `${SITE_URL}/` : `${SITE_URL}${pagePath}`;
    const response = await fetchWithRedirects(url);
    const jsonLd = extractJsonLd(response.bodyText || "");
    const types = [...new Set(jsonLd.flatMap((node) => collectTypes(node)))];
    const text = JSON.stringify(jsonLd);
    const urls = collectUrlLikeValues(jsonLd);
    const collectionPages = jsonLd.filter((node) => node?.["@type"] === "CollectionPage");
    const breadcrumbs = jsonLd.filter((node) => node?.["@type"] === "BreadcrumbList");
    const itemLists = jsonLd.filter((node) => node?.["@type"] === "ItemList");
    const topLevelRouteSchemas = jsonLd.filter((node) =>
      ["WebPage", "CollectionPage", "AboutPage", "ContactPage", "PrivacyPolicy", "TermsOfService"].includes(node?.["@type"]),
    );
    const canonical = canonicalSiteUrl(pagePath);

    pages.push({
      path: pagePath,
      status: response.status,
      scriptCount: jsonLd.length > 0 ? 1 : 0,
      jsonParses: jsonLd.length > 0 && !jsonLd.some((node) => node.parseError),
      schemaTypes: types,
      contextsValid: jsonLd.every((node) => node?.["@context"] === "https://schema.org"),
      selectedSchemaTypesAllowed: types.every((type) => ALLOWED_SCHEMA_TYPES.has(type)),
      forbiddenSchemaTypesAbsent: !types.some((type) => FORBIDDEN_SCHEMA_TYPES.has(type)),
      searchActionAbsent: !/SearchAction/i.test(text),
      breadcrumbsCorrect:
        breadcrumbs.length === 0 ||
        breadcrumbs.every((breadcrumb) => {
          const items = breadcrumb.itemListElement || [];
          const last = items[items.length - 1];
          return last?.item === canonical && items.every((item, index) => item.position === index + 1);
        }),
      collectionPageMatchesRoute:
        collectionPages.length === 0 || collectionPages.every((node) => node.url === canonical && node["@id"] === `${canonical}#webpage`),
      itemListCapped: itemLists.every((list) => (list.numberOfItems || 0) <= 8 && (list.itemListElement || []).length <= 8),
      noSvgUrls: !/\.svg(?:["?#/]|$)|\/svg\//i.test(text),
      noLocalhost: !/localhost|127\.0\.0\.1/i.test(text),
      noR2Dev: !/r2\.dev/i.test(text),
      noDeferredRecords: ![...deferredIds].some((id) => id && text.includes(id)),
      noPerImagePageReferences: urls.every((value) => {
        if (!value.startsWith(SITE_URL)) return true;
        const parsed = new URL(value);
        return !/\/coloring-pages\/[^/#?]+\/[^/#?]+/.test(parsed.pathname);
      }),
      imageFieldsUseRouteOgImages: urls.filter((value) => /\/og\//.test(value) || /\.(?:jpg|png|webp|svg)/i.test(value)).every((value) => /^https:\/\/www\.ilovecoloringpage\.com\/og\/.+\.jpg(?:#image)?$/i.test(value)),
      routeSchemaCanonicalMatches: topLevelRouteSchemas.every((node) => node.url === canonical),
    });
  }

  const summary = {
    pagesChecked: pages.length,
    jsonLdPassed: pages.every((page) =>
      page.status === 200 &&
      page.scriptCount >= 1 &&
      page.jsonParses &&
      page.contextsValid &&
      page.selectedSchemaTypesAllowed &&
      page.forbiddenSchemaTypesAbsent &&
      page.searchActionAbsent &&
      page.breadcrumbsCorrect &&
      page.collectionPageMatchesRoute &&
      page.itemListCapped &&
      page.noSvgUrls &&
      page.noLocalhost &&
      page.noR2Dev &&
      page.noDeferredRecords &&
      page.noPerImagePageReferences &&
      page.imageFieldsUseRouteOgImages &&
      page.routeSchemaCanonicalMatches,
    ),
    scriptsExistWhereExpected: pages.every((page) => page.scriptCount >= 1),
    jsonParses: pages.every((page) => page.jsonParses),
    contextsValid: pages.every((page) => page.contextsValid),
    selectedSchemaTypesAllowed: pages.every((page) => page.selectedSchemaTypesAllowed),
    forbiddenSchemaTypesAbsent: pages.every((page) => page.forbiddenSchemaTypesAbsent),
    searchActionAbsent: pages.every((page) => page.searchActionAbsent),
    breadcrumbsCorrect: pages.every((page) => page.breadcrumbsCorrect),
    itemListCapped: pages.every((page) => page.itemListCapped),
    noSvgUrls: pages.every((page) => page.noSvgUrls),
    noLocalhost: pages.every((page) => page.noLocalhost),
    noR2Dev: pages.every((page) => page.noR2Dev),
    noDeferredRecords: pages.every((page) => page.noDeferredRecords),
    imageFieldsUseRouteOgImages: pages.every((page) => page.imageFieldsUseRouteOgImages),
    canonicalRouteUrlsUseWww: pages.every((page) => page.routeSchemaCanonicalMatches),
  };

  const result = {
    generatedAt: new Date().toISOString(),
    phase: "live-seo-verification",
    summary,
    pages,
  };

  await writeJson("pipeline/manifests/live-seo-jsonld-results.json", result);
  await writeReport("pipeline/reports/live-seo-jsonld-report.md", report(result));
  console.log(`Live SEO JSON-LD check complete: ${summary.jsonLdPassed ? "passed" : "blocked"}.`);
}

function report(result) {
  const s = result.summary;
  return `# Live SEO JSON-LD Report

- Pages checked: ${s.pagesChecked}
- JSON-LD passed: ${s.jsonLdPassed}
- Scripts exist where expected: ${s.scriptsExistWhereExpected}
- JSON parses: ${s.jsonParses}
- Contexts valid: ${s.contextsValid}
- Selected schema types allowed: ${s.selectedSchemaTypesAllowed}
- Forbidden schema types absent: ${s.forbiddenSchemaTypesAbsent}
- SearchAction absent: ${s.searchActionAbsent}
- Breadcrumbs correct: ${s.breadcrumbsCorrect}
- ItemList capped: ${s.itemListCapped}
- No SVG/local/r2.dev/deferred records: ${s.noSvgUrls && s.noLocalhost && s.noR2Dev && s.noDeferredRecords}
- Image fields use route-level OG images: ${s.imageFieldsUseRouteOgImages}
- Canonical route URLs use www: ${s.canonicalRouteUrlsUseWww}

## Pages

${result.pages.map((page) => `- ${page.path}: ${page.schemaTypes.join(", ") || "missing JSON-LD"}`).join("\n")}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
