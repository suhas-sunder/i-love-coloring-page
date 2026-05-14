import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  REPO_ROOT,
  countMatches,
  ensureStaticExport,
  listFilesIfExists,
  normalizePath,
  passFail,
  readJson,
  readProjectText,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const SAMPLED_ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const seo = await runSeoQa();
  await writeJson("pipeline/manifests/predeploy-local-seo-qa-results.json", seo);
  await writeText("pipeline/reports/predeploy-local-seo-qa-report.md", renderSeoReport(seo));

  const acceptance = await buildAcceptanceGate(seo);
  await writeJson("pipeline/manifests/predeploy-local-acceptance-gate.json", acceptance);
  await writeText("pipeline/reports/predeploy-local-acceptance-gate.md", renderAcceptanceReport(acceptance));

  console.log(JSON.stringify({
    seo: seo.summary,
    acceptance: {
      ready_for_netlify_deploy: acceptance.ready_for_netlify_deploy,
      blockers: acceptance.blockers,
    },
  }, null, 2));
}

async function runSeoQa() {
  const build = await ensureStaticExport({ force: false });
  const outDir = build.outDir;
  const sitemapPath = path.join(outDir, "sitemap.xml");
  const imageSitemapPath = path.join(outDir, "image-sitemap.xml");
  const sitemapXml = fs.existsSync(sitemapPath) ? await fsp.readFile(sitemapPath, "utf8") : "";
  const imageSitemapXml = fs.existsSync(imageSitemapPath) ? await fsp.readFile(imageSitemapPath, "utf8") : "";
  const outFiles = await listFilesIfExists(outDir);
  const publicOgFiles = outFiles.filter((file) => /^out\/og\/.+\.jpe?g$/i.test(normalizePath(file)));
  const sampledPages = await Promise.all(SAMPLED_ROUTES.map((route) => inspectSampledPage(outDir, route)));
  const runtimeRoutes = await readJson("src/generated/coloring/runtime-routes.json");
  const sourceText = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const imageLocs = [...imageSitemapXml.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((match) => match[1]);
  const sitemapLocs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const perImageRoutes = outFiles
    .map(normalizePath)
    .filter((file) => /^out\/coloring-pages\/.+\/.+\.html$/.test(file) && !/\/page\/\d+\.html$/.test(file));
  const localhostOrPrivatePattern = /localhost|127\.0\.0\.1|\.r2\.dev|r2\.cloudflarestorage\.com|amazonaws\.com|file:\/\//i;
  const summary = {
    staticExportOutExists: fs.existsSync(outDir),
    sitemapExistsInStaticExport: Boolean(sitemapXml),
    imageSitemapExistsInStaticExport: Boolean(imageSitemapXml),
    sitemapLocCount: sitemapLocs.length,
    imageSitemapWebpEntryCount: imageLocs.filter((url) => /\/webp\/.+\.webp$/i.test(url)).length,
    expectedImageSitemapWebpEntryCount: 6352,
    svgUrlsInImageSitemap: imageLocs.filter((url) => /\.svg(?:$|\?)/i.test(url)).length,
    pngOrThumbUrlsInImageSitemap: imageLocs.filter((url) => /\/(?:png|thumbs)\//i.test(url) || /\.(?:png|jpg|jpeg)(?:$|\?)/i.test(url)).length,
    ogImagesExist: publicOgFiles.length > 0,
    ogImageCount: publicOgFiles.length,
    sampledPagesHaveJsonLd: sampledPages.every((page) => page.jsonLdCount > 0),
    sampledPagesHaveCanonical: sampledPages.every((page) => page.canonicalUrl?.startsWith("https://www.ilovecoloringpage.com")),
    canonicalUrlsUseWww: sampledPages.every((page) => !page.canonicalUrl || /^https:\/\/www\.ilovecoloringpage\.com/.test(page.canonicalUrl)),
    metadataLooksCorrectOnSamples: sampledPages.every((page) => page.titlePresent && page.descriptionPresent && page.ogPresent),
    perImageRoutesFound: perImageRoutes.length > 0,
    perImageRouteCount: perImageRoutes.length,
    localhostOrPrivateUrlsFound: localhostOrPrivatePattern.test(`${sitemapXml}\n${imageSitemapXml}\n${sampledPages.map((page) => page.htmlHead).join("\n")}`),
    noSvgUrlsInImageSitemap: !/\.svg(?:<|\?)/i.test(imageSitemapXml),
    noPngOrThumbUrlsInImageSitemap: !/\/(?:png|thumbs)\//i.test(imageSitemapXml) && !/\.png</i.test(imageSitemapXml),
    runtimeRouteCount: runtimeRoutes.routes?.length || 0,
    imageSitemapLogicChangedThisRound: false,
    ogImageLogicChangedThisRound: false,
    jsonLdExpansionChangedThisRound: false,
    liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "predeploy-local-seo-qa-results",
    build,
    sampledRoutes: sampledPages,
    publicOgSample: publicOgFiles.slice(0, 10),
    perImageRoutes,
    summary: {
      ...summary,
      seoAssetsPassed:
        summary.staticExportOutExists &&
        summary.sitemapExistsInStaticExport &&
        summary.imageSitemapExistsInStaticExport &&
        summary.imageSitemapWebpEntryCount === summary.expectedImageSitemapWebpEntryCount &&
        summary.svgUrlsInImageSitemap === 0 &&
        summary.pngOrThumbUrlsInImageSitemap === 0 &&
        summary.ogImagesExist &&
        summary.sampledPagesHaveJsonLd &&
        summary.sampledPagesHaveCanonical &&
        summary.canonicalUrlsUseWww &&
        summary.metadataLooksCorrectOnSamples &&
        !summary.perImageRoutesFound &&
        !summary.localhostOrPrivateUrlsFound &&
        !summary.liveAdSenseCodePresent,
    },
  };
}

async function inspectSampledPage(outDir, route) {
  const htmlPath = resolveOutHtmlPath(outDir, route);
  const html = fs.existsSync(htmlPath) ? await fsp.readFile(htmlPath, "utf8") : "";
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const htmlHead = headMatch?.[1] || "";
  const canonicalUrl = htmlHead.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || "";
  return {
    route,
    htmlPath: normalizePath(path.relative(REPO_ROOT, htmlPath)),
    exists: Boolean(html),
    titlePresent: /<title>[^<]+<\/title>/i.test(htmlHead),
    descriptionPresent: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+["']/i.test(htmlHead),
    ogPresent: /property=["']og:title["']|name=["']twitter:card["']/.test(htmlHead),
    canonicalUrl,
    jsonLdCount: countMatches(html, /type=["']application\/ld\+json["']/g),
    htmlHead: htmlHead.slice(0, 3000),
  };
}

function resolveOutHtmlPath(outDir, route) {
  if (route === "/") return path.join(outDir, "index.html");
  return path.join(outDir, `${route.replace(/^\/+/, "")}.html`);
}

async function buildAcceptanceGate(seo) {
  const [
    context,
    printAudit,
    implementation,
    modal,
    printQa,
    linkSection,
    browserQa,
    trust,
    ads,
  ] = await Promise.all([
    readJson("pipeline/manifests/predeploy-local-context-check.json"),
    readJson("pipeline/manifests/predeploy-print-current-audit.json"),
    readJson("pipeline/manifests/predeploy-print-pdf-implementation.json"),
    readJson("pipeline/manifests/predeploy-print-modal-polish.json"),
    readJson("pipeline/manifests/predeploy-print-qa-results.json"),
    readJson("pipeline/manifests/predeploy-link-section-ui-results.json"),
    readJson("pipeline/manifests/predeploy-local-browser-qa-results.json"),
    readJson("pipeline/manifests/predeploy-trust-legal-local-review.json"),
    readJson("pipeline/manifests/predeploy-ad-placeholder-local-qa.json"),
  ]);

  const noAppApi = !fs.existsSync(path.join(REPO_ROOT, "app", "api")) && !fs.existsSync(path.join(REPO_ROOT, "src", "app", "api"));
  const noSvgDownload = printQa.summary.svgDownloadAbsent && context.summary.svgInternalOnly;
  const staticExportPassed = context.summary.staticExportConfigured && seo.summary.staticExportOutExists;
  const blockers = [];
  const checks = {
    print_pdf_output_passed: implementation.summary.pdfStyleOutputImplemented && printQa.summary.browserHeadersFootersAvoidedByPdfWorkflow,
    print_one_page_passed: printQa.summary.allGeneratedPrintableDocumentsOnePage,
    no_blank_print_pages: printQa.summary.noBlankPrintPages,
    print_branding_safe: printQa.summary.brandingVisible && !printQa.summary.brandingOverlapsArtwork,
    modal_polish_passed: modal.summary.controlsTopRight && !modal.summary.unnecessaryScrollbar && !modal.summary.visibleSvgDownload,
    link_section_ui_passed: linkSection.summary.linkSectionUiPassed,
    browser_qa_passed: browserQa.summary.browserQaPassed,
    seo_assets_passed: seo.summary.seoAssetsPassed,
    trust_pages_passed: trust.summary.trustPagesPassed,
    ad_placeholders_passed: ads.summary.adPlaceholdersPassed,
    static_export_passed: staticExportPassed,
    no_app_api: noAppApi,
    no_svg_download: noSvgDownload,
  };

  for (const [key, value] of Object.entries(checks)) {
    if (!value) blockers.push(key);
  }

  if (printAudit.summary.currentWindowPrintPathRemovedFromImageCard !== true) blockers.push("legacy_window_print_path");
  if (context.summary.liveAdSenseCodePresent || seo.summary.liveAdSenseCodePresent) blockers.push("live_adsense_code_present");
  if (!context.summary.imagesStatusClean) blockers.push("images_status_dirty");
  if (!context.summary.ilovesvgStatusClean) blockers.push("ilovesvg_status_dirty");

  const allLocalProductBlockersPassed = blockers.length === 0;
  return {
    generatedAt: new Date().toISOString(),
    runId: "predeploy-local-acceptance-gate",
    ...checks,
    ready_for_netlify_deploy: allLocalProductBlockersPassed,
    ready_for_gsc_submission_after_deploy: allLocalProductBlockersPassed,
    ready_for_social_preview_after_deploy: allLocalProductBlockersPassed,
    ready_for_live_ads_round: false,
    blockers,
  };
}

function renderSeoReport(payload) {
  return [
    "# Predeploy Local SEO QA Report",
    "",
    renderTable([
      ["sitemapExistsInStaticExport", passFail(payload.summary.sitemapExistsInStaticExport)],
      ["imageSitemapExistsInStaticExport", passFail(payload.summary.imageSitemapExistsInStaticExport)],
      ["imageSitemapWebpEntryCount", payload.summary.imageSitemapWebpEntryCount.toLocaleString()],
      ["svgUrlsInImageSitemap", payload.summary.svgUrlsInImageSitemap],
      ["pngOrThumbUrlsInImageSitemap", payload.summary.pngOrThumbUrlsInImageSitemap],
      ["ogImagesExist", passFail(payload.summary.ogImagesExist)],
      ["ogImageCount", payload.summary.ogImageCount.toLocaleString()],
      ["sampledPagesHaveJsonLd", passFail(payload.summary.sampledPagesHaveJsonLd)],
      ["canonicalUrlsUseWww", passFail(payload.summary.canonicalUrlsUseWww)],
      ["perImageRoutesFound", payload.summary.perImageRoutesFound ? "fail" : "pass"],
      ["localhostOrPrivateUrlsFound", payload.summary.localhostOrPrivateUrlsFound ? "fail" : "pass"],
      ["seoAssetsPassed", passFail(payload.summary.seoAssetsPassed)],
    ]),
  ].join("\n");
}

function renderAcceptanceReport(payload) {
  return [
    "# Predeploy Local Acceptance Gate",
    "",
    renderTable([
      ["print_pdf_output_passed", passFail(payload.print_pdf_output_passed)],
      ["print_one_page_passed", passFail(payload.print_one_page_passed)],
      ["no_blank_print_pages", passFail(payload.no_blank_print_pages)],
      ["print_branding_safe", passFail(payload.print_branding_safe)],
      ["modal_polish_passed", passFail(payload.modal_polish_passed)],
      ["link_section_ui_passed", passFail(payload.link_section_ui_passed)],
      ["browser_qa_passed", passFail(payload.browser_qa_passed)],
      ["seo_assets_passed", passFail(payload.seo_assets_passed)],
      ["trust_pages_passed", passFail(payload.trust_pages_passed)],
      ["ad_placeholders_passed", passFail(payload.ad_placeholders_passed)],
      ["static_export_passed", passFail(payload.static_export_passed)],
      ["no_app_api", passFail(payload.no_app_api)],
      ["no_svg_download", passFail(payload.no_svg_download)],
      ["ready_for_netlify_deploy", passFail(payload.ready_for_netlify_deploy)],
      ["ready_for_live_ads_round", payload.ready_for_live_ads_round ? "pass" : "deferred"],
    ]),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join(", ") : "none"}`,
  ].join("\n");
}
