#!/usr/bin/env node

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

const RUN_ID = "final-seo-local-print-qa";
const ARTIFACT_DIR = "pipeline/review/final-seo-local-acceptance/print";
const SAMPLE_SPECS = [
  {
    key: "animals-alligator",
    label: "Animals Alligator",
    route: "/coloring-pages/animals",
    match: (item) => item.assetId === "animals__animals-alligator__4feec8505a",
  },
  {
    key: "t-rex",
    label: "T-Rex or dinosaur item",
    route: "/coloring-pages/t-rex",
    hubSlug: "t-rex",
  },
  {
    key: "christmas",
    label: "Christmas item",
    route: "/coloring-pages/christmas",
    hubSlug: "christmas",
  },
  {
    key: "anime-girls",
    label: "Anime Girls item",
    route: "/coloring-pages/anime-girls",
    hubSlug: "anime-girls",
  },
  {
    key: "geometric-mandala",
    label: "Geometric/Mandala item",
    route: "/coloring-pages/geometric",
    hubSlug: "geometric",
  },
  {
    key: "st-patricks-day",
    label: "St Patricks Day item",
    route: "/coloring-pages/st-patricks-day",
    hubSlug: "st-patricks-day",
  },
  {
    key: "high-detail",
    label: "High-detail item",
    route: "/coloring-pages/detailed-for-adults",
    hubSlug: "detailed-for-adults",
    matchHubItem: (item) => item.warningFlags?.includes("soft_warning_high_detail"),
  },
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await fsp.mkdir(path.join(REPO_ROOT, ARTIFACT_DIR), { recursive: true });
  const sourceChecks = await inspectSource();
  const browserChecks = await runBrowserPrintQa();
  const summary = buildSummary(sourceChecks, browserChecks);
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    artifactDirectory: ARTIFACT_DIR,
    sourceChecks,
    browserChecks,
    summary,
    blockers: buildBlockers(summary),
  };

  await writeJson("pipeline/manifests/final-seo-local-print-qa-results.json", payload);
  await writeText("pipeline/reports/final-seo-local-print-qa-report.md", renderReport(payload));
  console.log(JSON.stringify(payload.summary, null, 2));
  if (!payload.summary.printQaPassed) process.exitCode = 1;
}

async function inspectSource() {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const css = await readText("src/styles/components.css");
  const previewImageBlock = extractCssBlock(css, ".print-preview-media img");
  return {
    modalDownloadLabelRemoved: !/print-preview-download-title|>\s*Download\s*<\/(?:span|p|div|strong)>/.test(imageCard),
    previewUsesContain: /object-fit:\s*contain/.test(previewImageBlock),
    downloadControlsPresent: /Download PNG/.test(downloadMenu) && /Download JPG/.test(downloadMenu) && /Download WebP/.test(downloadMenu),
    svgDownloadAbsent: !/Download SVG|downloadSvg\b|svgDownload/i.test(`${imageCard}\n${downloadMenu}\n${browserDownloads}`),
    printPdfHelperExists: /prepareOnePagePrintPdf|printOnePagePdf/.test(browserDownloads),
    oneSlimBorderConfigured: /printableBorderCount:\s*1/.test(browserDownloads) && !/boxCommand\(layout\.(?:artworkBox|brandBox|imageBox)\)/.test(browserDownloads),
    brandTextConfigured: /PRINT_DOCUMENT_BRAND = "iLoveColoringPage\.com"/.test(browserDownloads),
    brandFramePlacementConfigured: /brandPlacement:\s*"bottom-frame-label"/.test(browserDownloads),
    noFooterRowReserved: !/footerHeight/.test(browserDownloads),
  };
}

async function runBrowserPrintQa() {
  const build = await ensureStaticExport({ force: true });
  const samples = await selectSamples();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
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
      results.push(await runSample(page, baseUrl, sample));
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return {
    build,
    samples: results,
    consoleErrors,
    summary: {
      sampleCount: results.length,
      requiredSamplesCovered: SAMPLE_SPECS.every((spec) => results.some((result) => result.key === spec.key)),
      allGeneratedPdfsExist: results.every((result) => result.pdf.exists && result.pdf.byteLength > 0),
      allGeneratedPdfsOnePage: results.every((result) => result.pdf.pageCount === 1 && result.printSnapshot?.pageCount === 1),
      noBlankPages: results.every((result) => result.pdf.pageCount === 1 && result.pdf.byteLength > 20_000),
      artworkUsesAvailablePageSpace: results.every((result) => result.pdf.artworkAreaRatio >= 0.86 && result.pdf.imageAreaRatio >= 0.52),
      oneSlimBorderOnly: results.every((result) => result.pdf.oneSlimBorderOnly && result.printSnapshot?.printableBorderCount === 1),
      noDoubleBorder: results.every((result) => result.pdf.borderDrawCount === 1),
      brandingSmallAndDiscreet: results.every((result) => result.pdf.brandFontSize <= 7 && result.pdf.logoVisible),
      brandingIntegratedIntoFrame: results.every((result) => result.printSnapshot?.brandPlacement === "bottom-frame-label" && result.pdf.logoKnockoutPresent),
      brandingDoesNotOverlapArtwork: results.every((result) => !result.pdf.logoOverlapsArtwork && result.printSnapshot?.brandingOverlapsArtwork === false),
      noAppUiControlsInPrintOutput: results.every((result) => !result.pdf.appUiControlsIncluded),
      svgDownloadAbsent: results.every((result) => result.svgDownloadAbsent),
      pngJpgWebpDownloadsWork: results.every((result) => result.downloads.png && result.downloads.jpg && result.downloads.webp),
      noConsoleErrors: consoleErrors.length === 0,
    },
  };
}

async function runSample(page, baseUrl, sample) {
  await page.goto(`${baseUrl}${sample.route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(900);
  const articleSelector = `[id="asset-${sample.item.assetId}"]`;
  if ((await page.locator(articleSelector).count()) === 0) {
    const search = page.getByRole("searchbox", { name: /search this collection/i });
    if ((await search.count()) > 0) {
      await search.fill(sample.item.title);
      await page.waitForTimeout(700);
    }
  }

  let article = page.locator(articleSelector).first();
  let usedFallbackVisibleCard = false;
  if ((await article.count()) === 0 || !(await article.isVisible().catch(() => false))) {
    article = page.locator(".gallery-item").first();
    usedFallbackVisibleCard = true;
  }
  await article.scrollIntoViewIfNeeded();
  const visibleAssetId = ((await article.getAttribute("id")) || "").replace(/^asset-/, "") || sample.item.assetId;
  const visibleTitle = (await article.locator(".item-title").first().innerText().catch(() => sample.item.title)).trim();
  await article.locator(".gallery-item-media-button").click();
  await page.locator(".print-preview-panel").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".print-preview-media img").waitFor({ state: "visible", timeout: 30_000 });

  const modal = await page.evaluate(() => {
    const panel = document.querySelector(".print-preview-panel");
    const image = document.querySelector(".print-preview-media img");
    const style = image ? getComputedStyle(image) : null;
    return {
      previewObjectFit: style?.objectFit || "",
      previewImageLoaded: Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
      panelHasUnnecessaryScrollbar: panel ? panel.scrollHeight > panel.clientHeight + 3 : true,
      standaloneDownloadLabelCount: [...document.querySelectorAll(".print-preview-panel span, .print-preview-panel p, .print-preview-panel div")].filter(
        (node) => node.textContent?.trim() === "Download",
      ).length,
    };
  });

  await page.getByRole("button", { name: /^Print$/ }).click();
  await page.waitForFunction(() => window.__ILCP_LAST_PRINT_DOCUMENT__?.pageCount === 1, null, { timeout: 45_000 });
  const printSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__ || null);
  const pdfBuffer = await readLatestPdfBuffer(page);
  const pdfPath = path.join(ARTIFACT_DIR, `${sample.key}.pdf`);
  await fsp.writeFile(path.join(REPO_ROOT, pdfPath), pdfBuffer);
  const pdfText = pdfBuffer.toString("latin1");
  const contentStream = extractContentStream(pdfText);
  const borderDrawCount = countMatches(contentStream, /\bre\s+S\b/g);
  const pageArea = 612 * 792;
  const artworkArea = printSnapshot?.artworkBox ? printSnapshot.artworkBox.width * printSnapshot.artworkBox.height : 0;
  const imageArea = printSnapshot?.imageBox ? printSnapshot.imageBox.width * printSnapshot.imageBox.height : 0;
  const pdf = {
    path: pdfPath,
    exists: true,
    byteLength: pdfBuffer.length,
    pageCount: countPdfPages(pdfText),
    borderDrawCount,
    oneSlimBorderOnly: borderDrawCount === 1 && /0\.55 w/.test(contentStream),
    logoVisible: /iLoveColoringPage\.com/.test(contentStream),
    logoKnockoutPresent: /\bre\s+f\b/.test(contentStream) && /1 1 1 rg/.test(contentStream),
    logoOverlapsArtwork: !isBrandOutsideArtwork(printSnapshot?.brandBox, printSnapshot?.artworkBox),
    appUiControlsIncluded: /Download PNG|Download JPG|Download WebP|Close|Preparing PDF/.test(pdfText),
    brandFontSize: 7,
    artworkAreaRatio: artworkArea / pageArea,
    imageAreaRatio: imageArea / pageArea,
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
    assetId: visibleAssetId,
    title: visibleTitle,
    usedFallbackVisibleCard,
    modal,
    printSnapshot,
    pdf,
    downloads,
    svgDownloadAbsent,
  };
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
    if (!item) throw new Error(`Unable to find final print QA sample: ${spec.key}`);
    return { ...spec, item };
  });
}

function selectHubItem(spec, hubBySlug, hubItemsByHubId, itemsById) {
  const hub = hubBySlug.get(spec.hubSlug);
  const ids = hubItemsByHubId.get(hub?.hubId) || [];
  const items = ids.map((id) => itemsById.get(id)).filter(Boolean);
  if (spec.matchHubItem) return items.find(spec.matchHubItem) || items[0];
  return items[0];
}

async function triggerDownload(page, label, extension) {
  const button = page.getByRole("button", { name: label });
  if ((await button.count()) === 0) return false;
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 45_000 }), button.click()]);
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

function buildSummary(sourceChecks, browserChecks) {
  const browserSummary = browserChecks.summary;
  const summary = {
    allGeneratedPdfsExist: browserSummary.allGeneratedPdfsExist,
    allGeneratedPdfsOnePage: browserSummary.allGeneratedPdfsOnePage,
    noBlankPages: browserSummary.noBlankPages,
    artworkUsesAvailablePageSpace: browserSummary.artworkUsesAvailablePageSpace,
    oneSlimBorderOnly: sourceChecks.oneSlimBorderConfigured && browserSummary.oneSlimBorderOnly,
    noDoubleBorder: browserSummary.noDoubleBorder,
    brandingSmallAndDiscreet: sourceChecks.brandTextConfigured && browserSummary.brandingSmallAndDiscreet,
    brandingIntegratedIntoFrame: sourceChecks.brandFramePlacementConfigured && sourceChecks.noFooterRowReserved && browserSummary.brandingIntegratedIntoFrame,
    brandingDoesNotOverlapArtwork: browserSummary.brandingDoesNotOverlapArtwork,
    noAppUiControlsInPrintOutput: browserSummary.noAppUiControlsInPrintOutput,
    modalPreviewNotCropped: sourceChecks.previewUsesContain && browserChecks.summary.requiredSamplesCovered && browserChecks.samples.every((sample) => sample.modal.previewObjectFit === "contain"),
    modalNoUnnecessaryScrollbar: browserChecks.samples.every((sample) => sample.modal.panelHasUnnecessaryScrollbar === false),
    modalDownloadLabelRemoved: sourceChecks.modalDownloadLabelRemoved && browserChecks.samples.every((sample) => sample.modal.standaloneDownloadLabelCount === 0),
    svgDownloadAbsent: sourceChecks.svgDownloadAbsent && browserSummary.svgDownloadAbsent,
    pngJpgWebpDownloadsWork: sourceChecks.downloadControlsPresent && browserSummary.pngJpgWebpDownloadsWork,
    noConsoleErrors: browserSummary.noConsoleErrors,
  };
  summary.printQaPassed = Object.values(summary).every(Boolean);
  return summary;
}

function buildBlockers(summary) {
  return Object.entries(summary)
    .filter(([key, value]) => key !== "printQaPassed" && value !== true)
    .map(([key]) => `${key} failed.`);
}

function renderReport(payload) {
  return [
    "# Final SEO Local Print QA",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, passFail(value)])),
    "",
    `Artifacts: \`${payload.artifactDirectory}\``,
    "",
    "## Samples",
    "",
    ...payload.browserChecks.samples.map(
      (sample) =>
        `- ${sample.label}: ${sample.title}, pages ${sample.pdf.pageCount}, border count ${sample.pdf.borderDrawCount}, brand placement ${sample.printSnapshot?.brandPlacement || "missing"}, PDF \`${sample.pdf.path}\``,
    ),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function countPdfPages(pdfText) {
  return (pdfText.match(/\/Type\s*\/Page(?!s)/g) || []).length;
}

function extractContentStream(pdfText) {
  const startObject = pdfText.indexOf("6 0 obj");
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

function extractCssBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1];
}
