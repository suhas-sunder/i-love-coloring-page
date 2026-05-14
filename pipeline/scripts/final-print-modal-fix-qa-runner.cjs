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

const ARTIFACT_DIR = "pipeline/review/final-print-modal-fix";
const PREVIOUS_ARTWORK_BOX = {
  width: 584 - 6 * 2,
  height: 764 - 18 - 6 * 2,
};

const SAMPLE_SPECS = [
  {
    key: "geometric-mandala",
    label: "Geometric/Mandala item",
    route: "/coloring-pages/geometric",
    hubSlug: "geometric",
  },
  {
    key: "animals-alligator",
    label: "Animals Alligator",
    route: "/coloring-pages/animals",
    match: (item) => item.assetId === "animals__animals-alligator__4feec8505a",
  },
  {
    key: "tall-portrait",
    label: "Tall portrait item",
    route: "/coloring-pages/anime-girls",
    hubSlug: "anime-girls",
    matchHubItem: (item) => {
      const width = item.dimensions?.svg?.width || item.dimensions?.source?.width || 0;
      const height = item.dimensions?.svg?.height || item.dimensions?.source?.height || 0;
      return width > 0 && height / width >= 1.35;
    },
  },
  {
    key: "high-detail",
    label: "High-detail item",
    route: "/coloring-pages/detailed-for-adults",
    hubSlug: "detailed-for-adults",
    preferWarning: "soft_warning_high_detail",
    matchHubItem: (item) =>
      item.warningFlags?.includes("soft_warning_high_detail") &&
      item.assetId !== "mandala__mandala-geometry-patterns-animal-mandala-fox__3e8e80a2fd",
  },
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await fsp.mkdir(path.join(REPO_ROOT, ARTIFACT_DIR), { recursive: true });

  const sourceChecks = await inspectSource();
  const browserChecks = await runBrowserQa();
  const summary = buildSummary(sourceChecks, browserChecks);
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: "final-print-modal-fix-results",
    artifactDirectory: ARTIFACT_DIR,
    sourceChecks,
    browserChecks,
    summary,
  };

  await writeJson("pipeline/manifests/final-print-modal-fix-results.json", payload);
  await writeText("pipeline/reports/final-print-modal-fix-report.md", renderReport(payload));
  console.log(JSON.stringify(summary, null, 2));
}

async function inspectSource() {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const css = await readText("src/styles/components.css");
  const previewImageBlock = extractCssBlock(css, ".print-preview-media img");

  return {
    standaloneDownloadLabelRemoved: !/print-preview-download-title|>\s*Download\s*<\/(?:span|p|div|strong)>/.test(imageCard),
    pngJpgWebpControlsPresent: /Download PNG/.test(downloadMenu) && /Download JPG/.test(downloadMenu) && /Download WebP/.test(downloadMenu),
    svgDownloadAbsent: !/Download SVG|downloadSvg\b|svgDownload/i.test(`${imageCard}\n${downloadMenu}\n${browserDownloads}`),
    previewUsesContain: /object-fit:\s*contain/.test(previewImageBlock) && /width:\s*100%/.test(previewImageBlock) && /height:\s*100%/.test(previewImageBlock),
    oneBorderConfigured: /printableBorderCount:\s*1/.test(browserDownloads) && !/boxCommand\(layout\.(?:artworkBox|brandBox|imageBox)\)/.test(browserDownloads),
    brandTextConfigured: /PRINT_DOCUMENT_BRAND = "iLoveColoringPage\.com"/.test(browserDownloads),
    brandPlacementConfigured: /brandPlacement:\s*"bottom-frame-label"/.test(browserDownloads),
    noFooterRowReserved: !/footerHeight/.test(browserDownloads),
    knockoutConfigured: /knockout/i.test(browserDownloads),
  };
}

async function runBrowserQa() {
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
      modalDownloadLabelRemoved: results.every((result) => result.modal.standaloneDownloadLabelCount === 0),
      modalPreviewNotCropped: results.every((result) => result.modal.previewObjectFit === "contain"),
      modalPreviewShowsFullImage: results.every((result) => result.modal.previewImageLoaded && result.modal.previewObjectFit === "contain"),
      pdfOnePage: results.every((result) => result.pdf.pageCount === 1 && result.printSnapshot?.pageCount === 1),
      oneSlimBorderOnly: results.every((result) => result.pdf.oneSlimBorderOnly && result.printSnapshot?.printableBorderCount === 1),
      logoIntegratedIntoBottomFrame: results.every((result) => result.printSnapshot?.brandPlacement === "bottom-frame-label" && result.pdf.logoKnockoutPresent),
      logoOverlapsArtwork: results.some((result) => result.pdf.logoOverlapsArtwork),
      artworkUsesMorePageSpaceThanBefore: results.every((result) => result.pdf.artworkUsesMorePageSpaceThanBefore),
      pngJpgWebpDownloadsWork: results.every((result) => result.downloads.png && result.downloads.jpg && result.downloads.webp),
      svgDownloadAbsent: results.every((result) => result.svgDownloadAbsent),
      noConsoleErrors: consoleErrors.length === 0,
    },
  };
}

async function runSample(page, baseUrl, sample) {
  await page.goto(`${baseUrl}${sample.route}`, { waitUntil: "networkidle", timeout: 60_000 });
  const articleSelector = `[id="asset-${sample.item.assetId}"]`;
  if ((await page.locator(articleSelector).count()) === 0) {
    const search = page.getByRole("searchbox", { name: /search this collection/i });
    if ((await search.count()) > 0) {
      await search.fill(sample.item.title);
      await page.waitForTimeout(700);
    }
  }

  const article = page.locator(articleSelector).first();
  await article.scrollIntoViewIfNeeded();
  await article.locator(".gallery-item-media-button").click();
  await page.locator(".print-preview-panel").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator(".print-preview-media img").waitFor({ state: "visible", timeout: 20_000 });

  const modal = await page.evaluate(() => {
    const panel = document.querySelector(".print-preview-panel");
    const media = document.querySelector(".print-preview-media");
    const image = document.querySelector(".print-preview-media img");
    const style = image ? getComputedStyle(image) : null;
    return {
      standaloneDownloadLabelCount: [...document.querySelectorAll(".print-preview-panel span, .print-preview-panel p, .print-preview-panel div")]
        .filter((node) => node.textContent?.trim() === "Download").length,
      panelHasUnnecessaryScrollbar: panel ? panel.scrollHeight > panel.clientHeight + 2 : true,
      previewObjectFit: style?.objectFit || "",
      previewWidth: image?.clientWidth || 0,
      previewHeight: image?.clientHeight || 0,
      previewNaturalWidth: image?.naturalWidth || 0,
      previewNaturalHeight: image?.naturalHeight || 0,
      previewImageLoaded: Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
      mediaWidth: media?.clientWidth || 0,
      mediaHeight: media?.clientHeight || 0,
    };
  });

  await page.screenshot({ path: path.join(REPO_ROOT, ARTIFACT_DIR, `${sample.key}-modal.png`), fullPage: false });
  await page.getByRole("button", { name: /^Print$/ }).click();
  await page.waitForFunction(() => window.__ILCP_LAST_PRINT_DOCUMENT__?.pageCount === 1, null, { timeout: 30_000 });
  const printSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__);
  const pdfBuffer = await readLatestPdfBuffer(page);
  const pdfPath = path.join(ARTIFACT_DIR, `${sample.key}.pdf`);
  await fsp.writeFile(path.join(REPO_ROOT, pdfPath), pdfBuffer);
  const pdfText = pdfBuffer.toString("latin1");
  const contentStream = extractContentStream(pdfText);
  const pdf = {
    path: pdfPath,
    byteLength: pdfBuffer.length,
    pageCount: countPdfPages(pdfText),
    oneSlimBorderOnly: countMatches(contentStream, /\bre\s+S\b/g) === 1 && /0\.55 w/.test(contentStream),
    logoVisible: /iLoveColoringPage\.com/.test(contentStream),
    logoKnockoutPresent: /\bre\s+f\b/.test(contentStream) && /1 1 1 rg/.test(contentStream),
    logoOverlapsArtwork: !isBrandOutsideArtwork(printSnapshot?.brandBox, printSnapshot?.artworkBox),
    artworkUsesMorePageSpaceThanBefore:
      Boolean(printSnapshot?.artworkBox) &&
      printSnapshot.artworkBox.width > PREVIOUS_ARTWORK_BOX.width &&
      printSnapshot.artworkBox.height > PREVIOUS_ARTWORK_BOX.height,
    appUiControlsIncluded: /Download PNG|Download JPG|Download WebP|Close|Preparing PDF/.test(pdfText),
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
    if (!item) throw new Error(`Unable to find focused print/modal sample: ${spec.key}`);
    return { ...spec, item };
  });
}

function selectHubItem(spec, hubBySlug, hubItemsByHubId, itemsById) {
  const hub = hubBySlug.get(spec.hubSlug);
  const ids = hubItemsByHubId.get(hub?.hubId) || [];
  const items = ids.map((id) => itemsById.get(id)).filter(Boolean);
  if (spec.matchHubItem) return items.find(spec.matchHubItem) || items[0];
  if (spec.preferWarning) return items.find((item) => item.warningFlags?.includes(spec.preferWarning)) || items[0];
  return items[0];
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

function buildSummary(sourceChecks, browserChecks) {
  const browserSummary = browserChecks.summary;
  return {
    modalDownloadLabelRemoved: sourceChecks.standaloneDownloadLabelRemoved && browserSummary.modalDownloadLabelRemoved,
    modalPreviewNotCropped: sourceChecks.previewUsesContain && browserSummary.modalPreviewNotCropped,
    modalPreviewShowsFullImage: browserSummary.modalPreviewShowsFullImage,
    pdfOnePage: browserSummary.pdfOnePage,
    oneSlimBorderOnly: sourceChecks.oneBorderConfigured && browserSummary.oneSlimBorderOnly,
    logoIntegratedIntoBottomFrame: sourceChecks.brandPlacementConfigured && sourceChecks.noFooterRowReserved && browserSummary.logoIntegratedIntoBottomFrame,
    logoOverlapsArtwork: browserSummary.logoOverlapsArtwork,
    artworkUsesMorePageSpaceThanBefore: browserSummary.artworkUsesMorePageSpaceThanBefore,
    pngJpgWebpDownloadsWork: sourceChecks.pngJpgWebpControlsPresent && browserSummary.pngJpgWebpDownloadsWork,
    svgDownloadAbsent: sourceChecks.svgDownloadAbsent && browserSummary.svgDownloadAbsent,
    noConsoleErrors: browserSummary.noConsoleErrors,
    focusedQaPassed:
      sourceChecks.standaloneDownloadLabelRemoved &&
      sourceChecks.pngJpgWebpControlsPresent &&
      sourceChecks.svgDownloadAbsent &&
      sourceChecks.previewUsesContain &&
      sourceChecks.oneBorderConfigured &&
      sourceChecks.brandTextConfigured &&
      sourceChecks.brandPlacementConfigured &&
      sourceChecks.noFooterRowReserved &&
      sourceChecks.knockoutConfigured &&
      browserSummary.requiredSamplesCovered &&
      browserSummary.modalDownloadLabelRemoved &&
      browserSummary.modalPreviewNotCropped &&
      browserSummary.modalPreviewShowsFullImage &&
      browserSummary.pdfOnePage &&
      browserSummary.oneSlimBorderOnly &&
      browserSummary.logoIntegratedIntoBottomFrame &&
      !browserSummary.logoOverlapsArtwork &&
      browserSummary.artworkUsesMorePageSpaceThanBefore &&
      browserSummary.pngJpgWebpDownloadsWork &&
      browserSummary.svgDownloadAbsent &&
      browserSummary.noConsoleErrors,
  };
}

function renderReport(payload) {
  return [
    "# Final Print Modal Fix QA",
    "",
    renderTable([
      ["modalDownloadLabelRemoved", passFail(payload.summary.modalDownloadLabelRemoved)],
      ["modalPreviewNotCropped", passFail(payload.summary.modalPreviewNotCropped)],
      ["modalPreviewShowsFullImage", passFail(payload.summary.modalPreviewShowsFullImage)],
      ["pdfOnePage", passFail(payload.summary.pdfOnePage)],
      ["oneSlimBorderOnly", passFail(payload.summary.oneSlimBorderOnly)],
      ["logoIntegratedIntoBottomFrame", passFail(payload.summary.logoIntegratedIntoBottomFrame)],
      ["logoOverlapsArtwork", payload.summary.logoOverlapsArtwork ? "fail" : "pass"],
      ["artworkUsesMorePageSpaceThanBefore", passFail(payload.summary.artworkUsesMorePageSpaceThanBefore)],
      ["PNG/JPG/WebP downloads", passFail(payload.summary.pngJpgWebpDownloadsWork)],
      ["svgDownloadAbsent", passFail(payload.summary.svgDownloadAbsent)],
      ["focusedQaPassed", passFail(payload.summary.focusedQaPassed)],
    ]),
    "",
    `Artifacts: \`${payload.artifactDirectory}\``,
    `Frame label: iLoveColoringPage.com`,
    "",
    "## Samples",
    "",
    ...payload.browserChecks.samples.map((sample) => `- ${sample.label}: ${sample.title}, PDF pages ${sample.pdf.pageCount}, one border ${passFail(sample.pdf.oneSlimBorderOnly)}, brand placement ${sample.printSnapshot?.brandPlacement || "missing"}`),
  ].join("\n");
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

function extractCssBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1];
}
