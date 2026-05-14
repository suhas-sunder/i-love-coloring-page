const fsp = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const {
  REPO_ROOT,
  countMatches,
  ensureStaticExport,
  installStaticExportRoutes,
  passFail,
  readJson,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const PRINT_ARTIFACT_DIR = "pipeline/review/final-ux-fix/print";
const SAMPLE_SPECS = [
  { key: "animals-alligator", label: "Animals Alligator", route: "/coloring-pages/animals", match: (item) => item.assetId === "animals__animals-alligator__4feec8505a" },
  { key: "t-rex", label: "T-Rex or dinosaur", route: "/coloring-pages/t-rex", hubSlug: "t-rex" },
  { key: "christmas", label: "Christmas item", route: "/coloring-pages/christmas", hubSlug: "christmas" },
  { key: "anime-girls", label: "Anime Girls item", route: "/coloring-pages/anime-girls", hubSlug: "anime-girls" },
  { key: "geometric-mandala", label: "Geometric/Mandala item", route: "/coloring-pages/geometric", hubSlug: "geometric" },
  { key: "st-patricks-day", label: "St Patricks Day item", route: "/coloring-pages/st-patricks-day", hubSlug: "st-patricks-day" },
  { key: "high-detail", label: "High-detail item", route: "/coloring-pages/detailed-for-adults", hubSlug: "detailed-for-adults", preferWarning: "soft_warning_high_detail" },
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await fsp.mkdir(path.join(REPO_ROOT, PRINT_ARTIFACT_DIR), { recursive: true });

  const implementation = await buildPrintPdfImplementationReport();
  await writeJson("pipeline/manifests/final-ux-print-pdf-results.json", implementation);
  await writeText("pipeline/reports/final-ux-print-pdf-report.md", renderPrintPdfReport(implementation));

  const printQa = await runPrintQa();
  await writeJson("pipeline/manifests/final-ux-print-qa-results.json", printQa);
  await writeText("pipeline/reports/final-ux-print-qa-report.md", renderPrintQaReport(printQa));

  console.log(JSON.stringify({
    implementation: implementation.summary.printPdfPassed,
    printQa: printQa.summary.printQaPassed,
  }, null, 2));
}

async function buildPrintPdfImplementationReport() {
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const summary = {
    onePagePdfWorkflowPresent: /prepareOnePagePrintPdf|printOnePagePdf/.test(browserDownloads),
    frontendOnly: !/app\/api|server-side|backend/i.test(`${browserDownloads}\n${imageCard}`),
    letterPortrait: /PRINT_PAGE_WIDTH_PT = 612/.test(browserDownloads) && /PRINT_PAGE_HEIGHT_PT = 792/.test(browserDownloads),
    oneSlimBorderOnly: /printableBorderCount:\s*1/.test(browserDownloads) && !/dividerY/.test(browserDownloads),
    doubleBorderRemoved: countMatches(browserDownloads, /boxCommand\(layout\./g) === 1,
    minimalSafeMargin: /x:\s*14/.test(browserDownloads) && /safePadding = 6/.test(browserDownloads),
    brandingTextPresent: /PRINT_DOCUMENT_BRAND = "iLoveColoringPage\.com"/.test(browserDownloads),
    brandingOutsideArtwork: /brandBox/.test(browserDownloads) && /artworkBox/.test(browserDownloads),
    brandingOverlapsArtwork: /brandingOverlapsArtwork:\s*true/.test(browserDownloads),
    appUiControlsIncluded: /appUiControlsIncluded:\s*true/.test(browserDownloads),
    metadataTitleSupported: /metadataTitle/.test(browserDownloads) && /\/Title/.test(browserDownloads),
    pngJpgWebpDownloadsStillWorkInUi: /Download PNG/.test(downloadMenu) && /Download JPG/.test(downloadMenu) && /Download WebP/.test(downloadMenu),
    svgDownloadAbsent: !/Download SVG|SVG download|downloadSvg\b/i.test(`${browserDownloads}\n${imageCard}\n${downloadMenu}`),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-ux-print-pdf-results",
    summary: {
      ...summary,
      printPdfPassed:
        summary.onePagePdfWorkflowPresent &&
        summary.frontendOnly &&
        summary.letterPortrait &&
        summary.oneSlimBorderOnly &&
        summary.doubleBorderRemoved &&
        summary.minimalSafeMargin &&
        summary.brandingTextPresent &&
        summary.brandingOutsideArtwork &&
        !summary.brandingOverlapsArtwork &&
        !summary.appUiControlsIncluded &&
        summary.metadataTitleSupported &&
        summary.pngJpgWebpDownloadsStillWorkInUi &&
        summary.svgDownloadAbsent,
    },
  };
}

async function runPrintQa() {
  const build = await ensureStaticExport({ force: false });
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

  const allOnePage = results.every((result) => result.pdf.pageCount === 1 && result.printSnapshot?.pageCount === 1);
  const allOneBorder = results.every((result) => result.pdf.oneSlimBorderOnly && result.printSnapshot?.printableBorderCount === 1);
  const allBrandingSafe = results.every((result) => result.pdf.brandingVisible && !result.pdf.brandingOverlapsArtwork);
  const allArtworkUsesMost = results.every((result) => result.pdf.artworkUsesMostOfPage);

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-ux-print-qa-results",
    build,
    artifactDirectory: PRINT_ARTIFACT_DIR,
    samples: results,
    consoleErrors,
    summary: {
      sampleCount: results.length,
      requiredSamplesCovered: SAMPLE_SPECS.every((spec) => results.some((result) => result.key === spec.key)),
      printFlowOpens: results.every((result) => result.printFlowOpened),
      generatedPrintablePageCount: allOnePage ? 1 : null,
      allGeneratedPrintableDocumentsOnePage: allOnePage,
      noBlankPrintPages: results.every((result) => result.pdf.hasImageXObject && result.pdf.hasContentStream && result.pdf.pageCount === 1),
      oneSlimBorderOnly: allOneBorder,
      artworkUsesMostOfPage: allArtworkUsesMost,
      brandingVisible: results.every((result) => result.pdf.brandingVisible),
      brandingOutsideArtwork: results.every((result) => result.pdf.brandingOutsideArtwork),
      brandingOverlapsArtwork: !allBrandingSafe,
      appUiControlsInPrintableOutput: results.some((result) => result.pdf.appUiControlsIncluded),
      pngDownloadWorks: results.every((result) => result.downloads.png),
      jpgDownloadWorks: results.every((result) => result.downloads.jpg),
      webpDownloadWorks: results.every((result) => result.downloads.webp),
      publicDownloadFormats: ["PNG", "JPG", "WebP"],
      svgDownloadAbsent: results.every((result) => result.svgDownloadAbsent),
      pdfMetadataTitlePresent: results.every((result) => result.pdf.metadataTitlePresent),
      noConsoleErrors: consoleErrors.length === 0,
      printQaPassed:
        results.length === SAMPLE_SPECS.length &&
        allOnePage &&
        allOneBorder &&
        allArtworkUsesMost &&
        allBrandingSafe &&
        results.every((result) => !result.pdf.appUiControlsIncluded) &&
        results.every((result) => result.downloads.png && result.downloads.jpg && result.downloads.webp) &&
        results.every((result) => result.svgDownloadAbsent) &&
        results.every((result) => result.pdf.metadataTitlePresent) &&
        consoleErrors.length === 0,
    },
  };
}

async function runPrintSample(page, baseUrl, sample) {
  await page.goto(`${baseUrl}${sample.route}`, { waitUntil: "networkidle", timeout: 60_000 });
  const matchingArticles = page.locator(`[id="asset-${sample.item.assetId}"]`);
  if ((await matchingArticles.count()) === 0) {
    const search = page.getByRole("searchbox", { name: /search this collection/i });
    if ((await search.count()) > 0) {
      await search.fill(sample.item.title);
      await page.waitForTimeout(700);
    }
  }

  const article = page.locator(`[id="asset-${sample.item.assetId}"]`).first();
  await article.scrollIntoViewIfNeeded();
  await article.locator(".gallery-item-media-button").click();
  await page.locator(".print-preview-panel").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator(".print-preview-media img").waitFor({ state: "visible", timeout: 20_000 });
  const screenshotPath = path.join(PRINT_ARTIFACT_DIR, `${sample.key}-modal.png`);
  await page.screenshot({ path: path.join(REPO_ROOT, screenshotPath), fullPage: false });

  await page.getByRole("button", { name: /^Print$/ }).click();
  await page.waitForFunction(() => window.__ILCP_LAST_PRINT_DOCUMENT__?.pageCount === 1, null, { timeout: 30_000 });
  const printSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__);
  const pdfBuffer = await readLatestPdfBuffer(page);
  const pdfPath = path.join(PRINT_ARTIFACT_DIR, `${sample.key}.pdf`);
  await fsp.writeFile(path.join(REPO_ROOT, pdfPath), pdfBuffer);
  const pdfText = pdfBuffer.toString("latin1");
  const contentStream = extractContentStream(pdfText);
  const pageCount = countPdfPages(pdfText);
  const pdf = {
    path: pdfPath,
    byteLength: pdfBuffer.length,
    pageCount,
    dimensionsLetterPortrait: /\/MediaBox\s*\[0 0 612 792\]/.test(pdfText),
    hasImageXObject: /\/Subtype\s*\/Image/.test(pdfText),
    hasContentStream: /\/Im0 Do/.test(contentStream),
    oneSlimBorderOnly: countMatches(contentStream, /\bre\s+S\b/g) === 1 && /0\.55 w/.test(contentStream),
    brandingVisible: /iLoveColoringPage\.com/.test(contentStream),
    brandingOutsideArtwork: isBrandOutsideArtwork(printSnapshot?.brandBox, printSnapshot?.artworkBox),
    brandingOverlapsArtwork: Boolean(printSnapshot?.brandingOverlapsArtwork),
    appUiControlsIncluded: Boolean(printSnapshot?.appUiControlsIncluded) || /Download PNG|Download JPG|Download WebP|Close|Preparing PDF/.test(pdfText),
    artworkUsesMostOfPage: usesMostOfArtworkBox(printSnapshot?.imageBox, printSnapshot?.artworkBox),
    metadataTitlePresent: /\/Title\s*\(/.test(pdfText) && Boolean(printSnapshot?.metadataTitle),
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
    printSnapshot,
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

function extractContentStream(pdfText) {
  const marker = "6 0 obj";
  const startObject = pdfText.indexOf(marker);
  if (startObject < 0) return "";
  const startStream = pdfText.indexOf("stream\n", startObject);
  const endStream = pdfText.indexOf("\nendstream", startStream);
  if (startStream < 0 || endStream < 0) return "";
  return pdfText.slice(startStream + "stream\n".length, endStream);
}

function isBrandOutsideArtwork(brandBox, artworkBox) {
  if (!brandBox || !artworkBox) return false;
  return brandBox.y + brandBox.height <= artworkBox.y;
}

function usesMostOfArtworkBox(imageBox, artworkBox) {
  if (!imageBox || !artworkBox) return false;
  return imageBox.width / artworkBox.width >= 0.9 || imageBox.height / artworkBox.height >= 0.9;
}

function renderPrintPdfReport(payload) {
  return [
    "# Final UX Print PDF Report",
    "",
    renderTable([
      ["onePagePdfWorkflowPresent", passFail(payload.summary.onePagePdfWorkflowPresent)],
      ["frontendOnly", passFail(payload.summary.frontendOnly)],
      ["letterPortrait", passFail(payload.summary.letterPortrait)],
      ["oneSlimBorderOnly", passFail(payload.summary.oneSlimBorderOnly)],
      ["doubleBorderRemoved", passFail(payload.summary.doubleBorderRemoved)],
      ["minimalSafeMargin", passFail(payload.summary.minimalSafeMargin)],
      ["brandingTextPresent", passFail(payload.summary.brandingTextPresent)],
      ["brandingOutsideArtwork", passFail(payload.summary.brandingOutsideArtwork)],
      ["metadataTitleSupported", passFail(payload.summary.metadataTitleSupported)],
      ["pngJpgWebpDownloadsStillWorkInUi", passFail(payload.summary.pngJpgWebpDownloadsStillWorkInUi)],
      ["svgDownloadAbsent", passFail(payload.summary.svgDownloadAbsent)],
      ["printPdfPassed", passFail(payload.summary.printPdfPassed)],
    ]),
  ].join("\n");
}

function renderPrintQaReport(payload) {
  return [
    "# Final UX Print QA Report",
    "",
    renderTable([
      ["sampleCount", payload.summary.sampleCount],
      ["requiredSamplesCovered", passFail(payload.summary.requiredSamplesCovered)],
      ["printFlowOpens", passFail(payload.summary.printFlowOpens)],
      ["generatedPrintablePageCount", payload.summary.generatedPrintablePageCount ?? "mixed"],
      ["allGeneratedPrintableDocumentsOnePage", passFail(payload.summary.allGeneratedPrintableDocumentsOnePage)],
      ["noBlankPrintPages", passFail(payload.summary.noBlankPrintPages)],
      ["oneSlimBorderOnly", passFail(payload.summary.oneSlimBorderOnly)],
      ["artworkUsesMostOfPage", passFail(payload.summary.artworkUsesMostOfPage)],
      ["brandingVisible", passFail(payload.summary.brandingVisible)],
      ["brandingOutsideArtwork", passFail(payload.summary.brandingOutsideArtwork)],
      ["brandingOverlapsArtwork", payload.summary.brandingOverlapsArtwork ? "fail" : "pass"],
      ["appUiControlsInPrintableOutput", payload.summary.appUiControlsInPrintableOutput ? "fail" : "pass"],
      ["PNG/JPG/WebP downloads", passFail(payload.summary.pngDownloadWorks && payload.summary.jpgDownloadWorks && payload.summary.webpDownloadWorks)],
      ["svgDownloadAbsent", passFail(payload.summary.svgDownloadAbsent)],
      ["pdfMetadataTitlePresent", passFail(payload.summary.pdfMetadataTitlePresent)],
      ["printQaPassed", passFail(payload.summary.printQaPassed)],
    ]),
    "",
    `Artifacts: \`${payload.artifactDirectory}\``,
    "",
    "## Samples",
    "",
    ...payload.samples.map((sample) => `- ${sample.label}: ${sample.title}, PDF pages ${sample.pdf.pageCount}, PDF \`${sample.pdf.path}\`, screenshot \`${sample.screenshotPath}\``),
  ].join("\n");
}
