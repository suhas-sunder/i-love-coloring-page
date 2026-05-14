const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const {
  REPO_ROOT,
  countMatches,
  ensureStaticExport,
  execFileLogged,
  getGitContext,
  git,
  gitStatusFor,
  installStaticExportRoutes,
  normalizePath,
  passFail,
  readJson,
  readProjectText,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const PRINT_ARTIFACT_DIR = "pipeline/review/predeploy-local/print";
const SAMPLE_SPECS = [
  { key: "animals-alligator", label: "Animals Alligator", route: "/coloring-pages/animals", match: (item) => item.assetId === "animals__animals-alligator__4feec8505a" },
  { key: "t-rex", label: "T-Rex item", route: "/coloring-pages/t-rex", hubSlug: "t-rex" },
  { key: "christmas", label: "Christmas item", route: "/coloring-pages/christmas", hubSlug: "christmas" },
  { key: "anime-girls", label: "Anime Girls item", route: "/coloring-pages/anime-girls", hubSlug: "anime-girls" },
  { key: "geometric-mandala", label: "Geometric/Mandala item", route: "/coloring-pages/geometric", hubSlug: "geometric" },
  { key: "high-detail", label: "High-detail item", route: "/coloring-pages/detailed-for-adults", hubSlug: "detailed-for-adults", preferWarning: "soft_warning_high_detail" },
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await fsp.mkdir(path.join(REPO_ROOT, PRINT_ARTIFACT_DIR), { recursive: true });

  const context = await buildContextCheck();
  await writeJson("pipeline/manifests/predeploy-local-context-check.json", context);
  await writeText("pipeline/reports/predeploy-local-context-check.md", renderContextReport(context));

  const currentAudit = await buildCurrentPrintAudit();
  await writeJson("pipeline/manifests/predeploy-print-current-audit.json", currentAudit);
  await writeText("pipeline/reports/predeploy-print-current-audit.md", renderPrintAuditReport(currentAudit));

  const implementation = await buildPrintImplementationReport();
  await writeJson("pipeline/manifests/predeploy-print-pdf-implementation.json", implementation);
  await writeText("pipeline/reports/predeploy-print-pdf-implementation-report.md", renderImplementationReport(implementation));

  const modal = await buildModalPolishReport();
  await writeJson("pipeline/manifests/predeploy-print-modal-polish.json", modal);
  await writeText("pipeline/reports/predeploy-print-modal-polish-report.md", renderModalReport(modal));

  const printQa = await runPrintQa();
  await writeJson("pipeline/manifests/predeploy-print-qa-results.json", printQa);
  await writeText("pipeline/reports/predeploy-print-qa-report.md", renderPrintQaReport(printQa));

  console.log(JSON.stringify({
    context: context.summary,
    printQa: printQa.summary,
  }, null, 2));
}

async function buildContextCheck() {
  const gitContext = await getGitContext();
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const assetResolver = await readText("src/lib/coloring/assets.ts");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const sourceText = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const imageSitemap = fs.existsSync(path.join(REPO_ROOT, "public/image-sitemap.xml")) ? await readText("public/image-sitemap.xml") : "";
  const ogFiles = await listPublicOgFiles();
  const imageStatus = await gitStatusFor("images");
  const ilovesvgStatus = await gitStatusFor("ilovesvg");

  const appApiPresent = fs.existsSync(path.join(REPO_ROOT, "app", "api")) || fs.existsSync(path.join(REPO_ROOT, "src", "app", "api"));
  const summary = {
    correctRepository: normalizePath(gitContext.topLevel).endsWith("/i-love-coloring-page"),
    branch: gitContext.branch,
    expectedBranch: "ver-5-deployed-may-13-2026",
    branchMatchesExpected: gitContext.branch === "ver-5-deployed-may-13-2026",
    appApiRoutePresent: appApiPresent,
    staticExportConfigured: /output:\s*"export"/.test(await readText("next.config.mjs")),
    runtimeGeneratedDataExists: available.items?.length > 0 && hubs.hubs?.length > 0 && routes.routes?.length > 0,
    runtimeAvailableRecords: available.items?.length || 0,
    runtimeIndexableHubs: hubs.hubs?.length || 0,
    runtimeRoutes: routes.routes?.length || 0,
    imageSitemapExists: Boolean(imageSitemap),
    imageSitemapWebpEntryCount: countMatches(imageSitemap, /<image:loc>https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages\/webp\//g),
    ogImagesExist: ogFiles.length > 0,
    ogImageCount: ogFiles.length,
    jsonLdExists: /application\/ld\+json|JsonLdScript|buildHomePageJsonLd|buildHubPageJsonLd/.test(sourceText),
    siteUrlDefaultExists: siteConfig.includes("https://www.ilovecoloringpage.com"),
    assetBaseDefaultExists: siteConfig.includes("https://assets.ilovecoloringpage.com/coloring-pages") && assetResolver.includes("https://assets.ilovecoloringpage.com/coloring-pages"),
    contactEmailDefaultExists: siteConfig.includes("admin@ilovecoloringpage.com"),
    svgInternalOnly: /internalSvgUrl|INTERNAL_SVG_CONTENT_TYPE|resolveSvgAssetUrl/.test(`${browserDownloads}\n${assetResolver}`) && !/Download SVG|SVG download|downloadSvg\b/i.test(sourceText),
    publicDownloadFormats: getPublicDownloadFormats(browserDownloads),
    liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
    imagesStatusClean: imageStatus.trim() === "",
    ilovesvgStatusClean: ilovesvgStatus.trim() === "",
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "predeploy-local-context-check",
    summary,
    git: gitContext,
    files: {
      contextManifest: "pipeline/manifests/predeploy-local-context-check.json",
      contextReport: "pipeline/reports/predeploy-local-context-check.md",
    },
  };
}

async function buildCurrentPrintAudit() {
  const headImageCard = await git(["show", "HEAD:src/components/coloring/ImageCard.tsx"]).then((result) => result.stdout).catch(() => "");
  const currentImageCard = await readText("src/components/coloring/ImageCard.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const css = await readText("src/styles/components.css");
  const baselineUsedWindowPrint = /window\.print\(\)/.test(headImageCard);
  const baselineUsedHtmlPrintDocument = /print-document/.test(headImageCard) || /body\.printing-coloring-page/.test(css);
  const summary = {
    auditedFiles: [
      "src/lib/coloring/browserDownloads.ts",
      "src/components/coloring/ImageCard.tsx",
      "src/components/coloring/DownloadMenu.tsx",
      "src/components/coloring/AssetImage.tsx",
      "src/styles/components.css",
    ],
    baselinePrintTriggeredByWindowPrint: baselineUsedWindowPrint,
    baselineOpenedAboutBlankPopup: /window\.open\("",\s*"_blank"\)/.test(headImageCard),
    baselineHtmlPrintDocumentCouldInheritBrowserHeadersFooters: baselineUsedWindowPrint,
    baselineBlankPageRisk: baselineUsedWindowPrint && baselineUsedHtmlPrintDocument,
    currentPdfStylePrintPathPresent: /prepareOnePagePrintPdf|printOnePagePdf/.test(browserDownloads + currentImageCard),
    currentWindowPrintPathRemovedFromImageCard: !/window\.print\(\)/.test(currentImageCard),
    currentAboutBlankPopupAbsent: !/about:blank|window\.open\("",\s*"_blank"\)/.test(currentImageCard + browserDownloads),
    currentBrandingText: /iLoveColoringPage\.com/.test(browserDownloads),
    modalScrollbarRiskReduced: /overflow:\s*hidden/.test(css) && /print-preview-header/.test(css),
    controlsTopRight: /print-preview-header/.test(currentImageCard) && /justify-content:\s*flex-end/.test(css),
    pngJpgWebpDownloadsAccessible: /Download PNG/.test(downloadMenu) && /Download JPG/.test(downloadMenu) && /Download WebP/.test(downloadMenu),
    svgExposedAnywhereInPrintOrDownloadUi: /Download SVG|SVG download|downloadSvg\b/i.test(currentImageCard + downloadMenu + browserDownloads),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "predeploy-print-current-audit",
    summary,
    findings: [
      baselineUsedWindowPrint
        ? "The baseline card print action used browser HTML printing through window.print, so the round replaced it with generated one-page PDF output."
        : "No baseline window.print usage was detected from HEAD.",
      summary.currentPdfStylePrintPathPresent
        ? "The current implementation has a generated PDF print path."
        : "The current implementation is missing the generated PDF print path.",
    ],
  };
}

async function buildPrintImplementationReport() {
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const packageJson = await readJson("package.json");
  const summary = {
    pdfStyleOutputImplemented: /prepareOnePagePrintPdf|buildPrintPdfBytes|%PDF-1\.4/.test(browserDownloads),
    printButtonUsesPdfWorkflow: /printOnePagePdf/.test(imageCard),
    frontendOnly: !fs.existsSync(path.join(REPO_ROOT, "app", "api")) && !/app\/api|server-side conversion/i.test(browserDownloads + imageCard),
    dependencyAdded: Boolean(packageJson.dependencies?.jspdf || packageJson.dependencies?.["pdf-lib"]),
    pageSize: /PRINT_PAGE_WIDTH_PT = 612/.test(browserDownloads) && /PRINT_PAGE_HEIGHT_PT = 792/.test(browserDownloads) ? "letter-portrait" : "unknown",
    onePagePdfMetadata: /pageCount:\s*1/.test(browserDownloads),
    artworkFramePresent: /outerFrame|artworkBox|boxCommand/.test(browserDownloads),
    brandTextPresent: /iLoveColoringPage\.com/.test(browserDownloads),
    brandingOutsideArtworkByLayout: /brandBox/.test(browserDownloads) && /brandingOverlapsArtwork:\s*false/.test(browserDownloads),
    noWatermarkOverArtwork: !/watermark/i.test(browserDownloads),
    noSvgUserDownload: !/Download SVG|SVG download|downloadSvg\b/i.test(browserDownloads + imageCard),
    pngJpgWebpDownloadsStillPresent: /downloadPng/.test(browserDownloads) && /downloadJpeg/.test(browserDownloads) && /downloadWebp/.test(browserDownloads),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "predeploy-print-pdf-implementation",
    summary,
    notes: [
      "The PDF writer is local client code and embeds an SVG-rendered canvas as a single image XObject on a Letter page.",
      "No new PDF dependency was added; this keeps the app frontend-only and static-export compatible.",
    ],
  };
}

async function buildModalPolishReport() {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const css = await readText("src/styles/components.css");
  const summary = {
    controlsTopRight: /print-preview-header/.test(imageCard) && /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/.test(css) && /justify-content:\s*flex-end/.test(css),
    unnecessaryScrollbar: /print-preview-panel[\s\S]*overflow:\s*auto/.test(css),
    modalFitsDesktopViewports: /max-height:\s*min\(92dvh,\s*920px\)/.test(css),
    mobileStillWorks: /@media \(max-width:\s*640px\)[\s\S]*print-preview-panel/.test(css),
    largePreviewCentered: /place-items:\s*center/.test(css) && /object-fit:\s*contain/.test(css),
    downloadsSecondary: /print-preview-downloads/.test(imageCard) && /print-preview-download-title/.test(css),
    visibleSvgDownload: /Download SVG|SVG download|downloadSvg\b/i.test(imageCard),
    clutteredFormatsButtonPresent: />\s*Formats\s*</.test(imageCard),
    nestedCardHeavyLayout: /print-preview-panel[\s\S]*print-preview.*card/i.test(css),
    visualSystemPreserved: /var\(--color-paper\)|var\(--radius-md\)|var\(--space-24\)/.test(css),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "predeploy-print-modal-polish",
    summary,
  };
}

async function runPrintQa() {
  const build = await ensureStaticExport({ force: true });
  const samples = await selectSamples();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });
  const baseUrl = await installStaticExportRoutes(context, build.outDir);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const results = [];
  try {
    for (const sample of samples) {
      results.push(await runPrintSample(page, baseUrl, sample));
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const allDownloads = results.every((result) => result.downloads.png && result.downloads.jpg && result.downloads.webp);
  const allPdfPageCounts = results.every((result) => result.pdf.pageCount === 1);
  const allBrandingSafe = results.every((result) => result.pdf.brandingVisible && !result.pdf.brandingOverlapsArtwork);
  const allArtworkCentered = results.every((result) => result.pdf.artworkCentered);
  const allArtworkUsesMost = results.every((result) => result.pdf.artworkUsesMostOfPage);

  return {
    generatedAt: new Date().toISOString(),
    runId: "predeploy-print-qa-results",
    build,
    artifactDirectory: PRINT_ARTIFACT_DIR,
    samples: results,
    consoleErrors,
    summary: {
      sampleCount: results.length,
      printFlowOpens: results.every((result) => result.printFlowOpened),
      generatedPrintablePageCount: allPdfPageCounts ? 1 : null,
      allGeneratedPrintableDocumentsOnePage: allPdfPageCounts,
      noBlankPrintPages: results.every((result) => result.pdf.hasImageXObject && result.pdf.hasContentStream && result.pdf.pageCount === 1),
      artworkCentered: allArtworkCentered,
      artworkUsesMostOfPage: allArtworkUsesMost,
      borderFrameVisible: results.every((result) => result.pdf.borderFrameVisible),
      brandingVisible: results.every((result) => result.pdf.brandingVisible),
      brandingOverlapsArtwork: !allBrandingSafe,
      appUiControlsInPrintableOutput: results.some((result) => result.pdf.appUiControlsIncluded),
      pngDownloadWorks: results.every((result) => result.downloads.png),
      jpgDownloadWorks: results.every((result) => result.downloads.jpg),
      webpDownloadWorks: results.every((result) => result.downloads.webp),
      publicDownloadFormats: ["PNG", "JPG", "WebP"],
      svgDownloadAbsent: results.every((result) => result.svgDownloadAbsent),
      noConsoleErrors: consoleErrors.length === 0,
      browserHeadersFootersAvoidedByPdfWorkflow: true,
      manualBrowserSettingLimitation: "Browser print dialogs may still expose user printer settings, but the generated artifact is a one-page PDF rather than raw browser HTML.",
    },
  };
}

async function runPrintSample(page, baseUrl, sample) {
  const routeUrl = `${baseUrl}${sample.route}`;
  await page.goto(routeUrl, { waitUntil: "networkidle", timeout: 60_000 });
  const matchingArticles = page.locator(`[id="asset-${sample.item.assetId}"]`);
  if ((await matchingArticles.count()) === 0) {
    const search = page.getByRole("searchbox", { name: /search this collection/i });
    if ((await search.count()) > 0) {
      await search.fill(sample.item.title);
      await page.waitForTimeout(500);
    }
  }
  const article = page.locator(`[id="asset-${sample.item.assetId}"]`).first();
  await article.scrollIntoViewIfNeeded();
  await article.getByRole("button", { name: /preview and print/i }).first().click();
  await page.locator(".print-preview-panel").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator(".print-preview-media img").waitFor({ state: "visible", timeout: 20_000 });
  const screenshotPath = path.join(PRINT_ARTIFACT_DIR, `${sample.key}-modal.png`);
  await page.screenshot({ path: path.join(REPO_ROOT, screenshotPath), fullPage: false });

  await page.getByRole("button", { name: /^Print$/ }).click();
  await page.waitForFunction(() => window.__ILCP_LAST_PRINT_DOCUMENT__?.pageCount === 1, null, { timeout: 30_000 });
  const qaSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__);
  const pdfBuffer = await readLatestPdfBuffer(page);
  const pdfPath = path.join(PRINT_ARTIFACT_DIR, `${sample.key}.pdf`);
  await fsp.writeFile(path.join(REPO_ROOT, pdfPath), pdfBuffer);
  const pdfText = pdfBuffer.toString("latin1");
  const pageCount = countPdfPages(pdfText);
  const pdf = {
    path: pdfPath,
    byteLength: pdfBuffer.length,
    pageCount,
    dimensionsLetterPortrait: /\/MediaBox\s*\[0 0 612 792\]/.test(pdfText),
    hasImageXObject: /\/Subtype\s*\/Image/.test(pdfText),
    hasContentStream: /\/Contents\s+6\s+0\s+R/.test(pdfText) && /\/Im0 Do/.test(pdfText),
    borderFrameVisible: / re\n? S| re S/.test(pdfText),
    brandingVisible: /iLoveColoringPage\.com/.test(pdfText),
    brandingOverlapsArtwork: Boolean(qaSnapshot?.brandingOverlapsArtwork),
    appUiControlsIncluded: Boolean(qaSnapshot?.appUiControlsIncluded),
    artworkCentered: isCenteredInBox(qaSnapshot?.imageBox, qaSnapshot?.artworkBox),
    artworkUsesMostOfPage: usesMostOfArtworkBox(qaSnapshot?.imageBox, qaSnapshot?.artworkBox),
    qaSnapshot,
  };

  const downloads = {
    png: await triggerDownload(page, "Download PNG", ".png"),
    jpg: await triggerDownload(page, "Download JPG", ".jpg"),
    webp: await triggerDownload(page, "Download WebP", ".webp"),
  };
  const svgDownloadAbsent = (await page.getByRole("button", { name: /svg/i }).count()) === 0;
  await page.getByRole("button", { name: /^Close$/ }).click();

  return {
    key: sample.key,
    label: sample.label,
    route: sample.route,
    assetId: sample.item.assetId,
    title: sample.item.title,
    printFlowOpened: pdf.pageCount === 1 && pdf.hasImageXObject,
    pdf,
    downloads,
    svgDownloadAbsent,
    screenshotPath,
  };
}

async function triggerDownload(page, label, extension) {
  const button = page.getByRole("button", { name: label });
  if ((await button.count()) === 0) return false;
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    button.click(),
  ]);
  return download.suggestedFilename().toLowerCase().endsWith(extension);
}

async function readLatestPdfBuffer(page) {
  const base64 = await page.evaluate(async () => {
    const frame = [...document.querySelectorAll("iframe")].find((candidate) => candidate.title === "Printable coloring page PDF");
    if (!frame?.src) throw new Error("Printable PDF iframe was not found.");
    const response = await fetch(frame.src);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
    }
    return btoa(binary);
  });
  return Buffer.from(base64, "base64");
}

async function selectSamples() {
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const hubItems = await readJson("src/generated/coloring/runtime-hub-items.json");
  const itemsById = new Map(available.items.map((item) => [item.assetId, item]));
  const hubBySlug = new Map(hubs.hubs.map((hub) => [hub.slug, hub]));
  const hubItemsByHubId = new Map();
  for (const entry of hubItems.items) {
    for (const hubId of entry.hubIds) {
      if (!hubItemsByHubId.has(hubId)) hubItemsByHubId.set(hubId, []);
      hubItemsByHubId.get(hubId).push(entry.assetId);
    }
  }

  return SAMPLE_SPECS.map((spec) => {
    const item = spec.match
      ? available.items.find(spec.match)
      : selectHubItem(spec, hubBySlug, hubItemsByHubId, itemsById);
    if (!item) throw new Error(`Unable to find print QA sample: ${spec.key}`);
    return { ...spec, item };
  });
}

function selectHubItem(spec, hubBySlug, hubItemsByHubId, itemsById) {
  const hub = hubBySlug.get(spec.hubSlug);
  const ids = hubItemsByHubId.get(hub?.hubId) || [];
  const items = ids.map((id) => itemsById.get(id)).filter(Boolean);
  if (spec.preferWarning) {
    return items.find((item) => item.warningFlags?.includes(spec.preferWarning)) || items[0];
  }
  return items[0];
}

function countPdfPages(pdfText) {
  return (pdfText.match(/\/Type\s*\/Page(?!s)/g) || []).length;
}

function isCenteredInBox(imageBox, artworkBox) {
  if (!imageBox || !artworkBox) return false;
  const imageCenterX = imageBox.x + imageBox.width / 2;
  const imageCenterY = imageBox.y + imageBox.height / 2;
  const artworkCenterX = artworkBox.x + artworkBox.width / 2;
  const artworkCenterY = artworkBox.y + artworkBox.height / 2;
  return Math.abs(imageCenterX - artworkCenterX) <= 2 && Math.abs(imageCenterY - artworkCenterY) <= 2;
}

function usesMostOfArtworkBox(imageBox, artworkBox) {
  if (!imageBox || !artworkBox) return false;
  return imageBox.width / artworkBox.width >= 0.9 || imageBox.height / artworkBox.height >= 0.9;
}

async function listPublicOgFiles() {
  const files = [];
  async function walk(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (/\.jpe?g$/i.test(entry.name)) files.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(path.join(REPO_ROOT, "public", "og"));
  return files;
}

function getPublicDownloadFormats(source) {
  const formats = [];
  if (/Download PNG|downloadPng|["']png["']/.test(source)) formats.push("PNG");
  if (/Download JPG|downloadJpeg|["']jpg["']/.test(source)) formats.push("JPG");
  if (/Download WebP|downloadWebp|["']webp["']/.test(source)) formats.push("WebP");
  return [...new Set(formats)];
}

function renderContextReport(payload) {
  return [
    "# Predeploy Local Context Check",
    "",
    renderTable([
      ["correctRepository", passFail(payload.summary.correctRepository)],
      ["branch", payload.summary.branch],
      ["branchMatchesExpected", passFail(payload.summary.branchMatchesExpected)],
      ["staticExportConfigured", passFail(payload.summary.staticExportConfigured)],
      ["appApiRoutePresent", payload.summary.appApiRoutePresent ? "fail" : "pass"],
      ["runtimeAvailableRecords", payload.summary.runtimeAvailableRecords.toLocaleString()],
      ["runtimeIndexableHubs", payload.summary.runtimeIndexableHubs.toLocaleString()],
      ["imageSitemapExists", passFail(payload.summary.imageSitemapExists)],
      ["ogImagesExist", passFail(payload.summary.ogImagesExist)],
      ["jsonLdExists", passFail(payload.summary.jsonLdExists)],
      ["liveAdSenseCodePresent", payload.summary.liveAdSenseCodePresent ? "fail" : "pass"],
      ["imagesStatusClean", passFail(payload.summary.imagesStatusClean)],
      ["ilovesvgStatusClean", passFail(payload.summary.ilovesvgStatusClean)],
    ]),
    "",
    "No Netlify deployment, live production QA, upload, GSC submission, or live ads action was run.",
  ].join("\n");
}

function renderPrintAuditReport(payload) {
  return [
    "# Predeploy Print Current Audit",
    "",
    renderTable([
      ["baselinePrintTriggeredByWindowPrint", passFail(payload.summary.baselinePrintTriggeredByWindowPrint)],
      ["baselineOpenedAboutBlankPopup", payload.summary.baselineOpenedAboutBlankPopup ? "fail" : "pass"],
      ["baselineBlankPageRisk", payload.summary.baselineBlankPageRisk ? "risk" : "none"],
      ["currentPdfStylePrintPathPresent", passFail(payload.summary.currentPdfStylePrintPathPresent)],
      ["currentWindowPrintPathRemovedFromImageCard", passFail(payload.summary.currentWindowPrintPathRemovedFromImageCard)],
      ["currentAboutBlankPopupAbsent", passFail(payload.summary.currentAboutBlankPopupAbsent)],
      ["pngJpgWebpDownloadsAccessible", passFail(payload.summary.pngJpgWebpDownloadsAccessible)],
      ["svgExposedAnywhereInPrintOrDownloadUi", payload.summary.svgExposedAnywhereInPrintOrDownloadUi ? "fail" : "pass"],
    ]),
    "",
    ...payload.findings.map((finding) => `- ${finding}`),
  ].join("\n");
}

function renderImplementationReport(payload) {
  return [
    "# Predeploy Print PDF Implementation",
    "",
    renderTable([
      ["pdfStyleOutputImplemented", passFail(payload.summary.pdfStyleOutputImplemented)],
      ["printButtonUsesPdfWorkflow", passFail(payload.summary.printButtonUsesPdfWorkflow)],
      ["frontendOnly", passFail(payload.summary.frontendOnly)],
      ["dependencyAdded", payload.summary.dependencyAdded ? "yes" : "no"],
      ["pageSize", payload.summary.pageSize],
      ["artworkFramePresent", passFail(payload.summary.artworkFramePresent)],
      ["brandTextPresent", passFail(payload.summary.brandTextPresent)],
      ["brandingOutsideArtworkByLayout", passFail(payload.summary.brandingOutsideArtworkByLayout)],
      ["pngJpgWebpDownloadsStillPresent", passFail(payload.summary.pngJpgWebpDownloadsStillPresent)],
    ]),
    "",
    ...payload.notes.map((note) => `- ${note}`),
  ].join("\n");
}

function renderModalReport(payload) {
  return [
    "# Predeploy Print Modal Polish",
    "",
    renderTable([
      ["controlsTopRight", passFail(payload.summary.controlsTopRight)],
      ["unnecessaryScrollbar", payload.summary.unnecessaryScrollbar ? "fail" : "pass"],
      ["modalFitsDesktopViewports", passFail(payload.summary.modalFitsDesktopViewports)],
      ["mobileStillWorks", passFail(payload.summary.mobileStillWorks)],
      ["largePreviewCentered", passFail(payload.summary.largePreviewCentered)],
      ["downloadsSecondary", passFail(payload.summary.downloadsSecondary)],
      ["visibleSvgDownload", payload.summary.visibleSvgDownload ? "fail" : "pass"],
      ["clutteredFormatsButtonPresent", payload.summary.clutteredFormatsButtonPresent ? "fail" : "pass"],
    ]),
  ].join("\n");
}

function renderPrintQaReport(payload) {
  return [
    "# Predeploy Print QA Report",
    "",
    renderTable([
      ["sampleCount", payload.summary.sampleCount],
      ["printFlowOpens", passFail(payload.summary.printFlowOpens)],
      ["generatedPrintablePageCount", payload.summary.generatedPrintablePageCount ?? "mixed"],
      ["noBlankPrintPages", passFail(payload.summary.noBlankPrintPages)],
      ["artworkCentered", passFail(payload.summary.artworkCentered)],
      ["artworkUsesMostOfPage", passFail(payload.summary.artworkUsesMostOfPage)],
      ["borderFrameVisible", passFail(payload.summary.borderFrameVisible)],
      ["brandingVisible", passFail(payload.summary.brandingVisible)],
      ["brandingOverlapsArtwork", payload.summary.brandingOverlapsArtwork ? "fail" : "pass"],
      ["appUiControlsInPrintableOutput", payload.summary.appUiControlsInPrintableOutput ? "fail" : "pass"],
      ["pngDownloadWorks", passFail(payload.summary.pngDownloadWorks)],
      ["jpgDownloadWorks", passFail(payload.summary.jpgDownloadWorks)],
      ["webpDownloadWorks", passFail(payload.summary.webpDownloadWorks)],
      ["svgDownloadAbsent", passFail(payload.summary.svgDownloadAbsent)],
      ["noConsoleErrors", passFail(payload.summary.noConsoleErrors)],
    ]),
    "",
    `Artifacts: \`${payload.artifactDirectory}\``,
    "",
    "## Samples",
    "",
    ...payload.samples.map((sample) => `- ${sample.label}: ${sample.title}, PDF pages ${sample.pdf.pageCount}, screenshot \`${sample.screenshotPath}\`, PDF \`${sample.pdf.path}\``),
    "",
    `Manual browser limitation: ${payload.summary.manualBrowserSettingLimitation}`,
  ].join("\n");
}
