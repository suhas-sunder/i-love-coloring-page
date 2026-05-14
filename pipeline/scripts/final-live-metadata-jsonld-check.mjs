#!/usr/bin/env node

import {
  FORBIDDEN_SCHEMA_TYPES,
  METADATA_ROUTES,
  SITE_URL,
  absoluteSiteUrl,
  bool,
  canonicalSiteUrl,
  collectTypes,
  collectUrlLikeValues,
  extractJsonLd,
  extractMeta,
  fetchWithRedirects,
  getMetaContent,
  hasForbiddenPublicLeak,
  readJson,
  renderTable,
  writeJson,
  writeReport,
} from "./final-live-utils.mjs";

const outputFiles = {
  manifest: "pipeline/manifests/final-live-metadata-jsonld-results.json",
  report: "pipeline/reports/final-live-metadata-jsonld-report.md",
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const pages = [];
  for (const route of METADATA_ROUTES) {
    pages.push(await checkPage(route));
  }
  const payload = buildPayload(pages);
  await writeJson(outputFiles.manifest, payload);
  await writeReport(outputFiles.report, renderReport(payload));
  await updateGscReadiness(payload);
  console.log(JSON.stringify({
    ogMetadataPassed: payload.summary.ogMetadataPassed,
    jsonLdPassed: payload.summary.jsonLdPassed,
    pagesChecked: payload.summary.pagesChecked,
    blockers: payload.blockers,
  }, null, 2));
}

async function updateGscReadiness(metadataPayload) {
  let readiness;
  try {
    readiness = await readJson("pipeline/manifests/final-gsc-submission-readiness.json");
  } catch {
    return;
  }

  const blockers = new Set(readiness.blockers || []);
  readiness.canonicals_ready = metadataPayload.summary.canonicalsUseWww === true;
  if (!readiness.canonicals_ready) blockers.add("Live canonical URLs are not ready for GSC submission.");
  readiness.ready_for_owner_gsc_submission = [
    readiness.regular_sitemap_ready,
    readiness.image_sitemap_ready,
    readiness.robots_ready,
    readiness.canonicals_ready,
    readiness.no_per_image_routes,
  ].every(Boolean);
  readiness.blockers = [...blockers];
  await writeJson("pipeline/manifests/final-gsc-submission-readiness.json", readiness);
  await writeReport("pipeline/reports/final-gsc-submission-guide.md", renderGscGuide(readiness));
}

async function checkPage(route) {
  const url = absoluteSiteUrl(route);
  const response = await fetchWithRedirects(url);
  const html = response.bodyText || "";
  const meta = extractMeta(html);
  const jsonLd = extractJsonLd(html);
  const types = jsonLd.flatMap(collectTypes);
  const urlLikeValues = jsonLd.flatMap(collectUrlLikeValues);
  const ogImage = getMetaContent(meta, "og:image");
  const twitterImage = getMetaContent(meta, "twitter:image");
  const ogImageResponse = ogImage ? await fetchWithRedirects(ogImage, { accept: "image/*,*/*" }) : null;
  const isHubRoute = route === "/coloring-pages" || route.startsWith("/coloring-pages/");
  const itemLists = jsonLd.flatMap(findObjectsByType("ItemList"));
  const collectionPages = jsonLd.flatMap(findObjectsByType("CollectionPage"));
  const breadcrumbLists = jsonLd.flatMap(findObjectsByType("BreadcrumbList"));
  const forbiddenTypes = [...new Set(types.filter((type) => FORBIDDEN_SCHEMA_TYPES.has(type)))];
  const hasFakeSearchAction = types.includes("SearchAction");
  const itemListCounts = itemLists.map((itemList) => Array.isArray(itemList.itemListElement) ? itemList.itemListElement.length : 0);
  const maxItemListCount = itemListCounts.length ? Math.max(...itemListCounts) : 0;

  return {
    route,
    url,
    status: response.status,
    title: meta.title,
    description: getMetaContent(meta, "description"),
    canonical: meta.canonical,
    ogTitle: getMetaContent(meta, "og:title"),
    ogDescription: getMetaContent(meta, "og:description"),
    ogUrl: getMetaContent(meta, "og:url"),
    ogImage,
    ogImageStatus: ogImageResponse?.status || 0,
    ogImageContentType: ogImageResponse?.contentType || "",
    twitterCard: getMetaContent(meta, "twitter:card"),
    twitterImage,
    jsonLdScriptCount: jsonLd.length,
    jsonLdParseErrors: jsonLd.filter((entry) => entry.parseError).map((entry) => entry.parseError),
    jsonLdTypes: [...new Set(types)],
    forbiddenTypes,
    hasFakeSearchAction,
    breadcrumbListCount: breadcrumbLists.length,
    collectionPageCount: collectionPages.length,
    itemListCount: itemLists.length,
    maxItemListCount,
    checks: {
      statusOk: response.status === 200,
      titleExists: Boolean(meta.title),
      metaDescriptionExists: Boolean(getMetaContent(meta, "description")),
      canonicalUsesWww: meta.canonical === canonicalSiteUrl(route),
      ogTitleExists: Boolean(getMetaContent(meta, "og:title")),
      ogDescriptionExists: Boolean(getMetaContent(meta, "og:description")),
      ogUrlExists: getMetaContent(meta, "og:url") === canonicalSiteUrl(route),
      ogImageExists: Boolean(ogImage),
      ogImageReturns200: ogImageResponse?.status === 200,
      ogImageUsesStaticOgAsset: /^https:\/\/www\.ilovecoloringpage\.com\/og\/.+\.jpg$/i.test(ogImage),
      ogImageNotSvg: !/\.svg(?:$|\?)/i.test(ogImage),
      twitterCardLarge: getMetaContent(meta, "twitter:card") === "summary_large_image",
      twitterImageExists: Boolean(twitterImage),
      jsonLdScriptsExist: jsonLd.length > 0,
      jsonLdParses: jsonLd.length > 0 && jsonLd.every((entry) => !entry.parseError),
      noReviewSchema: !types.includes("Review"),
      noAggregateRatingSchema: !types.includes("AggregateRating"),
      noProductSchema: !types.includes("Product"),
      noOfferSchema: !types.includes("Offer"),
      noFaqPageSchema: !types.includes("FAQPage"),
      noFakeSearchAction: !hasFakeSearchAction,
      breadcrumbListCorrectForHubPages: !isHubRoute || breadcrumbLists.length > 0,
      collectionPageMatchesRoute: !isHubRoute || collectionPages.some((page) => String(page.url || page["@id"] || "").includes(canonicalSiteUrl(route))),
      itemListCapped: !isHubRoute || (itemLists.length > 0 && maxItemListCount > 0 && maxItemListCount < 200),
      noSvgUrlsInJsonLd: urlLikeValues.every((value) => !/\.svg(?:$|\?)/i.test(value)),
      noLocalhostOrR2Dev: !hasForbiddenPublicLeak(`${html}\n${urlLikeValues.join("\n")}`),
      noDeferredRecords: !/manual-review|deferred|hidden_until_manual_review/i.test(`${html}\n${JSON.stringify(jsonLd)}`),
      noPerImagePageReferences: urlLikeValues.every((value) => !/\/coloring-pages\/[^/]+\/(?!page\/)[^/#?]+/i.test(value)),
    },
  };
}

function buildPayload(pages) {
  const summary = {
    pagesChecked: pages.length,
    titlesPresent: pages.every((page) => page.checks.titleExists),
    metaDescriptionsPresent: pages.every((page) => page.checks.metaDescriptionExists),
    canonicalsUseWww: pages.every((page) => page.checks.canonicalUsesWww),
    ogTitlesPresent: pages.every((page) => page.checks.ogTitleExists),
    ogDescriptionsPresent: pages.every((page) => page.checks.ogDescriptionExists),
    ogUrlsPresent: pages.every((page) => page.checks.ogUrlExists),
    ogImagesPresent: pages.every((page) => page.checks.ogImageExists),
    ogImagesReturn200: pages.every((page) => page.checks.ogImageReturns200),
    ogImagesUseStaticOgAssets: pages.every((page) => page.checks.ogImageUsesStaticOgAsset),
    ogImagesNotSvg: pages.every((page) => page.checks.ogImageNotSvg),
    twitterCardsLarge: pages.every((page) => page.checks.twitterCardLarge),
    twitterImagesPresent: pages.every((page) => page.checks.twitterImageExists),
    jsonLdScriptsExist: pages.every((page) => page.checks.jsonLdScriptsExist),
    jsonLdParses: pages.every((page) => page.checks.jsonLdParses),
    noReviewSchema: pages.every((page) => page.checks.noReviewSchema),
    noAggregateRatingSchema: pages.every((page) => page.checks.noAggregateRatingSchema),
    noProductSchema: pages.every((page) => page.checks.noProductSchema),
    noOfferSchema: pages.every((page) => page.checks.noOfferSchema),
    noFaqPageSchema: pages.every((page) => page.checks.noFaqPageSchema),
    noFakeSearchAction: pages.every((page) => page.checks.noFakeSearchAction),
    breadcrumbListCorrectForHubPages: pages.every((page) => page.checks.breadcrumbListCorrectForHubPages),
    collectionPageMatchesRoute: pages.every((page) => page.checks.collectionPageMatchesRoute),
    itemListCapped: pages.every((page) => page.checks.itemListCapped),
    noSvgUrlsInJsonLd: pages.every((page) => page.checks.noSvgUrlsInJsonLd),
    noLocalhostOrR2Dev: pages.every((page) => page.checks.noLocalhostOrR2Dev),
    noDeferredRecords: pages.every((page) => page.checks.noDeferredRecords),
    noPerImagePageReferences: pages.every((page) => page.checks.noPerImagePageReferences),
  };
  summary.ogMetadataPassed = [
    summary.titlesPresent,
    summary.metaDescriptionsPresent,
    summary.canonicalsUseWww,
    summary.ogTitlesPresent,
    summary.ogDescriptionsPresent,
    summary.ogUrlsPresent,
    summary.ogImagesPresent,
    summary.ogImagesReturn200,
    summary.ogImagesUseStaticOgAssets,
    summary.ogImagesNotSvg,
    summary.twitterCardsLarge,
    summary.twitterImagesPresent,
    summary.noLocalhostOrR2Dev,
  ].every(Boolean);
  summary.jsonLdPassed = [
    summary.jsonLdScriptsExist,
    summary.jsonLdParses,
    summary.noReviewSchema,
    summary.noAggregateRatingSchema,
    summary.noProductSchema,
    summary.noOfferSchema,
    summary.noFaqPageSchema,
    summary.noFakeSearchAction,
    summary.breadcrumbListCorrectForHubPages,
    summary.collectionPageMatchesRoute,
    summary.itemListCapped,
    summary.noSvgUrlsInJsonLd,
    summary.noLocalhostOrR2Dev,
    summary.noDeferredRecords,
    summary.noPerImagePageReferences,
  ].every(Boolean);

  const blockers = [];
  if (!summary.ogMetadataPassed) blockers.push("Live metadata/OG/Twitter metadata check failed.");
  if (!summary.jsonLdPassed) blockers.push("Live JSON-LD check failed.");

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-live-metadata-jsonld-results",
    routes: METADATA_ROUTES,
    pages,
    summary,
    blockers,
  };
}

function findObjectsByType(type) {
  return function find(value) {
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap(find);
    const ownType = value["@type"];
    const types = Array.isArray(ownType) ? ownType : ownType ? [ownType] : [];
    return [
      ...(types.includes(type) ? [value] : []),
      ...Object.values(value).flatMap(find),
    ];
  };
}

function renderReport(payload) {
  return [
    "# Final Live Metadata, OG, And JSON-LD Report",
    "",
    renderTable([
      ["Pages checked", String(payload.summary.pagesChecked)],
      ["Titles present", bool(payload.summary.titlesPresent)],
      ["Meta descriptions present", bool(payload.summary.metaDescriptionsPresent)],
      ["Canonicals use www", bool(payload.summary.canonicalsUseWww)],
      ["OG titles present", bool(payload.summary.ogTitlesPresent)],
      ["OG descriptions present", bool(payload.summary.ogDescriptionsPresent)],
      ["OG URLs present", bool(payload.summary.ogUrlsPresent)],
      ["OG images present", bool(payload.summary.ogImagesPresent)],
      ["OG images return 200", bool(payload.summary.ogImagesReturn200)],
      ["OG images use /og/ JPG assets", bool(payload.summary.ogImagesUseStaticOgAssets)],
      ["Twitter cards large", bool(payload.summary.twitterCardsLarge)],
      ["JSON-LD scripts exist", bool(payload.summary.jsonLdScriptsExist)],
      ["JSON-LD parses", bool(payload.summary.jsonLdParses)],
      ["No Review/AggregateRating/Product/Offer/FAQPage", bool(payload.summary.noReviewSchema && payload.summary.noAggregateRatingSchema && payload.summary.noProductSchema && payload.summary.noOfferSchema && payload.summary.noFaqPageSchema)],
      ["No fake SearchAction", bool(payload.summary.noFakeSearchAction)],
      ["Hub BreadcrumbList", bool(payload.summary.breadcrumbListCorrectForHubPages)],
      ["Hub CollectionPage", bool(payload.summary.collectionPageMatchesRoute)],
      ["ItemList capped", bool(payload.summary.itemListCapped)],
      ["No SVG URLs in JSON-LD", bool(payload.summary.noSvgUrlsInJsonLd)],
      ["No localhost/r2/private URLs", bool(payload.summary.noLocalhostOrR2Dev)],
      ["No deferred/per-image references", bool(payload.summary.noDeferredRecords && payload.summary.noPerImagePageReferences)],
      ["OG metadata passed", bool(payload.summary.ogMetadataPassed)],
      ["JSON-LD passed", bool(payload.summary.jsonLdPassed)],
    ]),
    "",
    "## Page Results",
    "",
    ...payload.pages.map((page) => `- ${page.route}: status ${page.status}, title ${page.title ? "yes" : "no"}, OG image ${page.ogImage ? "yes" : "no"}, JSON-LD scripts ${page.jsonLdScriptCount}`),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join(" ") : "none"}`,
  ].join("\n");
}

function renderGscGuide(readiness) {
  const canSubmit = readiness.ready_for_owner_gsc_submission;
  return [
    "# Final GSC Submission Guide",
    "",
    `Status: ${canSubmit ? "ready for owner manual submission" : "blocked, do not submit yet"}.`,
    "",
    "Manual steps for the owner:",
    "",
    "1. Confirm the Google Search Console property exists for `https://www.ilovecoloringpage.com`.",
    "2. Submit `https://www.ilovecoloringpage.com/sitemap.xml`.",
    "3. Submit `https://www.ilovecoloringpage.com/image-sitemap.xml`.",
    "4. Keep both sitemaps submitted. Do not submit per-image pages.",
    "5. Inspect key URLs after submission: `/`, `/coloring-pages`, `/coloring-pages/animals`, `/coloring-pages/t-rex`, and `/coloring-pages/christmas`.",
    "6. Monitor indexing, image indexing, crawl errors, duplicate canonical warnings, and blocked resources.",
    "7. Do not expect instant indexing. Recheck after several days.",
    "",
    `Blockers: ${readiness.blockers.length ? readiness.blockers.join(" ") : "none"}`,
  ].join("\n");
}
