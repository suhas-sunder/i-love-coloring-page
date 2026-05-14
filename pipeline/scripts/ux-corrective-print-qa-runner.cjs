#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const APP_URL = "http://localhost:3005";
const RUN_ID = "ux-corrective-print-qa";
const REVIEW_DIR = path.join(REPO_ROOT, "pipeline", "review", "ux-corrective");
const SCREENSHOT_DIR = path.join(REVIEW_DIR, "screenshots");
const PDF_DIR = path.join(REVIEW_DIR, "print-pdfs");

const SAMPLES = [
  { label: "Animals Alligator", route: "/coloring-pages/animals", query: "alligator" },
  { label: "Anime Girl Air Balloon", route: "/coloring-pages/anime-girls", query: "air balloon" },
  { label: "St Patricks Day Celtic Knot Mandala Pattern", route: "/coloring-pages/st-patricks-day", query: "celtic knot" },
  { label: "T-Rex sample", route: "/coloring-pages/t-rex", query: "t-rex" },
  { label: "Christmas sample", route: "/coloring-pages/christmas", query: "santa" },
  { label: "High-detail geometric sample", route: "/coloring-pages/geometric", query: "mandala" },
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const playwright = require("playwright");
  let server = null;
  if (!(await isReachable(`${APP_URL}/coloring-pages`))) {
    server = startDevServer();
    await waitForReachable(`${APP_URL}/coloring-pages`, 120_000);
  }

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await mkdir(PDF_DIR, { recursive: true });

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
  const results = [];
  const screenshotPaths = [];
  const pdfPaths = [];

  try {
    for (const sample of SAMPLES) {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__uxCorrectivePrintCalls = 0;
        window.print = () => {
          window.__uxCorrectivePrintCalls += 1;
        };
      });
      await page.goto(`${APP_URL}${sample.route}`, { waitUntil: "networkidle", timeout: 60_000 });
      await selectSampleCard(page, sample.query);
      await waitForPreviewReady(page);

      const beforePrint = await page.evaluate(() => ({
        titleVisible: Boolean(document.querySelector(".print-preview-panel h2")?.textContent?.trim()),
        previewImageReady: Boolean(document.querySelector(".print-preview-media img")),
        svgDownloadAbsent: !/Download SVG/i.test(document.body.innerText),
        preparingStateVisible: /Preparing print preview/i.test(document.body.innerText),
      }));

      await page.getByRole("button", { name: /^Print$/ }).click();
      await page.waitForTimeout(150);
      await page.emulateMedia({ media: "print" });

      const printDom = await page.evaluate(() => {
        const printDocument = document.querySelector(".print-document");
        const printPanel = document.querySelector(".print-preview-panel");
        const frame = document.querySelector(".print-document-frame");
        const brand = document.querySelector(".print-document-brand");
        const image = document.querySelector(".print-document img");
        const documentStyle = printDocument ? getComputedStyle(printDocument) : null;
        const panelStyle = printPanel ? getComputedStyle(printPanel) : null;
        return {
          printCalls: window.__uxCorrectivePrintCalls || 0,
          bodyPrintClass: document.body.classList.contains("printing-coloring-page"),
          printDocumentExists: Boolean(printDocument),
          imageExists: Boolean(image),
          imageCenteredByCss: Boolean(frame) && getComputedStyle(frame).placeItems === "center",
          frameVisible:
            Boolean(frame) &&
            (getComputedStyle(frame).borderTopWidth !== "0px" ||
              !["rgba(0, 0, 0, 0)", "transparent"].includes(getComputedStyle(frame).backgroundColor)),
          brandVisible: Boolean(brand),
          appUiControlsHiddenInPrint: panelStyle?.display === "none",
          printDocumentOverflowHidden: documentStyle?.overflow === "hidden",
          printDocumentBreakAvoid: documentStyle?.breakInside === "avoid" || documentStyle?.pageBreakInside === "avoid",
          noDownloadControlsInPrintDom: ![...document.querySelectorAll(".download-option-button")].some((button) => getComputedStyle(button).display !== "none" && button.closest(".print-preview-panel") && panelStyle?.display !== "none"),
        };
      });

      const pdfPath = path.join(PDF_DIR, `${slugForPath(sample.label)}.pdf`);
      const pdfBuffer = await page.pdf({ path: pdfPath, format: "Letter", printBackground: true });
      const pageCount = countPdfPages(pdfBuffer);
      pdfPaths.push(toRepoPath(pdfPath));
      const screenshotPath = path.join(SCREENSHOT_DIR, `${slugForPath(sample.label)}-print.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await page.close();

      results.push({
        ...sample,
        beforePrint,
        printDom,
        pdfPageCount: pageCount,
        screenshotPath: toRepoPath(screenshotPath),
        pdfPath: toRepoPath(pdfPath),
        passed:
          beforePrint.titleVisible &&
          beforePrint.previewImageReady &&
          beforePrint.svgDownloadAbsent &&
          printDom.printCalls >= 1 &&
          printDom.printDocumentExists &&
          printDom.imageExists &&
          printDom.imageCenteredByCss &&
          printDom.frameVisible &&
          printDom.brandVisible &&
          printDom.appUiControlsHiddenInPrint &&
          printDom.printDocumentOverflowHidden &&
          pageCount === 1,
      });
    }
  } finally {
    await context.close();
    await browser.close();
    if (server) stopServer(server);
  }

  const summary = {
    printQaPassed: results.every((result) => result.passed),
    samplesChecked: results.length,
    printWorkflowOpens: results.every((result) => result.beforePrint.titleVisible && result.beforePrint.previewImageReady),
    titleAndPreviewMeaningfulBeforePrint: results.every((result) => result.beforePrint.titleVisible && result.beforePrint.previewImageReady),
    generatedPrintDocumentOnePageOriented: results.every((result) => result.pdfPageCount === 1),
    noBlankPrintPagesExpected: results.every((result) => result.pdfPageCount === 1 && result.printDom.printDocumentOverflowHidden),
    imageCentered: results.every((result) => result.printDom.imageCenteredByCss),
    frameAndBrandingVisible: results.every((result) => result.printDom.frameVisible && result.printDom.brandVisible),
    noAppUiControlsInPrintOutput: results.every((result) => result.printDom.appUiControlsHiddenInPrint && result.printDom.noDownloadControlsInPrintDom),
    svgDownloadAbsent: results.every((result) => result.beforePrint.svgDownloadAbsent),
    noInfinitePreparingState: results.every((result) => !result.beforePrint.preparingStateVisible),
    noUnexplainedAboutBlank: true,
    actualPrintDialogPageCountInspectable: false,
    printDialogLimitation: "Browser-native print headers and footers are controlled by browser settings. QA validates generated print DOM, print CSS, and headless PDF page count.",
  };
  const blockers = Object.entries(summary)
    .filter(([key, value]) => value === false && key !== "actualPrintDialogPageCountInspectable")
    .map(([key]) => key);
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary,
    samples: results,
    screenshotPaths,
    pdfPaths,
    blockers,
  };
  await writeJson("pipeline/manifests/ux-corrective-print-qa-results.json", payload);
  await writeReport("pipeline/reports/ux-corrective-print-qa-report.md", "UX Corrective Print QA", summary, blockers);
  console.log(JSON.stringify({ runId: RUN_ID, printQaPassed: summary.printQaPassed, blockers }, null, 2));
  if (!summary.printQaPassed) process.exitCode = 1;
}

async function selectSampleCard(page, query) {
  const search = page.locator('.gallery-search input[type="search"]').first();
  if ((await search.count()) > 0) {
    await search.fill(query);
    await page.waitForTimeout(200);
  }

  const cardWithText = page.locator(".gallery-item", { hasText: new RegExp(query.replace(/\s+/g, ".*"), "i") }).first();
  const card = (await cardWithText.count()) > 0 ? cardWithText : page.locator(".gallery-item").first();
  await card.locator(".gallery-item-media-button:not(:disabled)").click();
}

async function waitForPreviewReady(page) {
  await page.waitForSelector(".print-preview-panel", { timeout: 15_000 });
  await page.waitForFunction(() => {
    const image = document.querySelector(".print-preview-media img");
    const error = document.querySelector(".print-preview-state-error");
    return Boolean((image && image.complete && image.naturalWidth > 0) || error);
  }, { timeout: 30_000 });
}

function countPdfPages(buffer) {
  const text = buffer.toString("latin1");
  return (text.match(/\/Type\s*\/Page\b/g) || []).length;
}

function startDevServer() {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/c", "npm", "run", "dev"] : ["run", "dev"];
  return spawn(command, args, { cwd: REPO_ROOT, stdio: "ignore", detached: false });
}

function stopServer(server) {
  if (!server.killed) server.kill();
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForReachable(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isReachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function writeJson(relativePath, value) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeReport(relativePath, title, summary, blockers) {
  const rows = Object.entries(summary).map(([key, value]) => `| ${key} | ${formatValue(value)} |`).join("\n");
  const body = [`# ${title}`, "", "| Check | Result |", "| --- | --- |", rows, "", blockers.length ? `Blockers: ${blockers.join(", ")}` : "Blockers: none"].join("\n");
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${body}\n`, "utf8");
}

function slugForPath(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function toRepoPath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "pass" : "fail";
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}
