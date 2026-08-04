#!/usr/bin/env node

const { mkdir, readFile, rm } = require("node:fs/promises");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");

const ROOT = process.cwd();
const APP_URL = (process.env.PDF_CLARITY_APP_URL || "http://127.0.0.1:3005").replace(/\/$/, "");
const REVIEW_DIR = path.join(ROOT, "pipeline", "review", "direct-pdf-format-clarity");
const DOWNLOAD_DIR = path.join(ROOT, "tmp", "pdfs", "direct-pdf-format-clarity");
const ROUTES = [
  "/printables/animals/animals-alligator-4feec8505a",
  "/printables/animals/cats-playing-cards-c22648db9b",
  "/printables/anime-girls/anime-girl-brazilian-jiu-jitsu-5a40029b84",
];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
];
const BROWSERS = [
  { id: "chrome", type: chromium, options: { channel: "chrome" }, chromiumBased: true },
  { id: "edge", type: chromium, options: { channel: "msedge" }, chromiumBased: true },
  { id: "playwright-firefox", type: firefox, options: {}, chromiumBased: false },
  { id: "playwright-webkit", type: webkit, options: {}, chromiumBased: false },
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  await mkdir(REVIEW_DIR, { recursive: true });
  await rm(DOWNLOAD_DIR, { recursive: true, force: true });
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const results = {
    appUrl: APP_URL,
    routes: ROUTES,
    viewports: VIEWPORTS.map(({ width }) => width),
    browsers: [],
    screenshots: [],
    downloadedPdf: null,
    checks: {},
  };

  for (const specification of BROWSERS) {
    let browser;
    try {
      browser = await specification.type.launch({ headless: true, ...specification.options });
    } catch (error) {
      results.browsers.push({ id: specification.id, available: false, reason: firstLine(error) });
      continue;
    }

    try {
      const matrix = await runBrowserMatrix(browser);
      results.browsers.push({
        id: specification.id,
        available: true,
        version: browser.version(),
        chromiumBased: specification.chromiumBased,
        ...matrix,
      });
      if (specification.id === "chrome") {
        const interaction = await runInteractionQa(browser, results.screenshots);
        results.checks = interaction.checks;
        results.downloadedPdf = interaction.downloadedPdf;
      }
    } finally {
      await browser.close();
    }
  }

  const available = results.browsers.filter((entry) => entry.available);
  const matrixPassed = available.length > 0 && available.every((entry) => entry.failures.length === 0);
  const interactionPassed = Object.values(results.checks).every((value) => value === true);
  results.summary = {
    availableBrowsers: available.map((entry) => entry.id),
    unavailableBrowsers: results.browsers.filter((entry) => !entry.available).map((entry) => entry.id),
    matrixPassed,
    interactionPassed,
    browserQaPassed: matrixPassed && interactionPassed,
  };

  console.log(JSON.stringify(results, null, 2));
  if (!results.summary.browserQaPassed) process.exitCode = 1;
}

async function runBrowserMatrix(browser) {
  const context = await browser.newContext({ acceptDownloads: true });
  const failures = [];
  let pageCount = 0;
  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const page = await context.newPage();
        try {
          await page.setViewportSize(viewport);
          const response = await page.goto(`${APP_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.locator(".printable-action-panel").waitFor({ state: "visible" });
          await page.locator(".download-options").waitFor({ state: "visible" });
          await page.getByRole("button", { name: /^Download WebP for / }).waitFor({ state: "visible" });
          const metrics = await page.evaluate(() => {
            const panel = document.querySelector(".printable-action-panel");
            const text = panel?.textContent || "";
            const labels = [...panel.querySelectorAll("button")].map((button) => {
              const ariaLabel = button.getAttribute("aria-label");
              return ariaLabel?.startsWith("Download ") ? ariaLabel.split(" for ")[0] : button.textContent.trim();
            });
            return {
              hasMain: Boolean(document.querySelector("main")),
              overflow: document.documentElement.scrollWidth > window.innerWidth,
              panelOverflow: panel.scrollWidth > panel.clientWidth,
              labels,
              text,
              artworkSizePresent: document.body.textContent.includes("Artwork size"),
              svgPresent: labels.some((label) => /SVG/i.test(label)),
            };
          });
          pageCount += 1;
          if (!response || response.status() !== 200) failures.push(`${route}@${viewport.width}: HTTP ${response?.status() || 0}`);
          if (!metrics.hasMain) failures.push(`${route}@${viewport.width}: missing main`);
          if (metrics.overflow || metrics.panelOverflow) failures.push(`${route}@${viewport.width}: horizontal overflow`);
          if (!containsInOrder(metrics.labels, ["Download PDF", "Print", "Download PNG"])) failures.push(`${route}@${viewport.width}: action hierarchy changed`);
          if (!metrics.text.includes("Printable page image, 2550 × 3300 px")) failures.push(`${route}@${viewport.width}: printable raster description missing`);
          if (!metrics.text.includes("High-resolution artwork image")) failures.push(`${route}@${viewport.width}: WebP artwork description missing`);
          if (!metrics.text.includes("Recommended")) failures.push(`${route}@${viewport.width}: PNG recommendation missing`);
          if (metrics.artworkSizePresent) failures.push(`${route}@${viewport.width}: ambiguous Artwork size remains`);
          if (metrics.svgPresent) failures.push(`${route}@${viewport.width}: public SVG action present`);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
  return { pageCount, failures };
}

async function runInteractionQa(browser, screenshots) {
  const checks = {};
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    window.__pdfQa = { created: 0, revoked: 0, active: 0, printCalls: 0, opens: 0 };
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = createObjectURL(blob);
      if (blob?.type === "application/pdf") {
        window.__pdfQa.created += 1;
        window.__pdfQa.active += 1;
      }
      return url;
    };
    URL.revokeObjectURL = (url) => {
      if (String(url).startsWith("blob:")) {
        window.__pdfQa.revoked += 1;
        window.__pdfQa.active = Math.max(0, window.__pdfQa.active - 1);
      }
      return revokeObjectURL(url);
    };
    window.print = () => { window.__pdfQa.printCalls += 1; };
    const open = window.open.bind(window);
    window.open = (...args) => { window.__pdfQa.opens += 1; return open(...args); };
  });
  const page = await context.newPage();
  let downloadedPdf;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${APP_URL}${ROUTES[0]}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator(".printable-action-panel").waitFor({ state: "visible" });
    await screenshot(page, "chrome-390-printable-actions.png", screenshots, page.locator(".printable-action-panel"));
    await screenshot(page, "chrome-390-download-image-hierarchy.png", screenshots, page.locator(".printable-download-group"));
    await screenshot(page, "chrome-390-page-details.png", screenshots, page.locator(".printable-facts"));

    const pdfButton = page.getByRole("button", { name: "Download PDF", exact: true });
    await page.route("**/*.svg", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      await route.continue();
    });
    await pdfButton.focus();
    const firstDownloadPromise = page.waitForEvent("download");
    await page.evaluate(() => document.querySelector(".printable-pdf-download").click());
    const busyStateHandle = await page.waitForFunction(() => {
      const button = document.querySelector(".printable-pdf-download");
      if (button?.getAttribute("aria-busy") !== "true") return false;
      return { disabled: button.disabled, ariaBusy: button.getAttribute("aria-busy"), text: button.textContent };
    });
    const busyState = await busyStateHandle.jsonValue();
    checks.pdfBusyStateDisabled = busyState.disabled;
    checks.pdfBusyStateAnnounced = busyState.ariaBusy === "true";
    checks.pdfBusyStateSpecific = busyState.text.includes("Preparing PDF");
    await screenshot(page, "chrome-390-download-pdf-busy.png", screenshots, page.locator(".printable-action-panel"));
    const firstDownload = await firstDownloadPromise;
    await page.unroute("**/*.svg");
    const firstTarget = path.join(DOWNLOAD_DIR, firstDownload.suggestedFilename());
    await firstDownload.saveAs(firstTarget);
    await page.waitForFunction(() => document.querySelector(".printable-pdf-download")?.getAttribute("aria-busy") === "false");
    const firstBytes = await readFile(firstTarget);
    downloadedPdf = {
      path: path.relative(ROOT, firstTarget).replaceAll("\\", "/"),
      filename: firstDownload.suggestedFilename(),
      byteLength: firstBytes.length,
      magic: firstBytes.subarray(0, 4).toString("ascii"),
    };
    checks.pdfFilenameDeterministic = firstDownload.suggestedFilename() === "animals-alligator.pdf";
    checks.pdfMagicBytes = downloadedPdf.magic === "%PDF";
    checks.pdfBusyStateClears = !await pdfButton.isDisabled() && (await pdfButton.getAttribute("aria-busy")) === "false";
    checks.pdfSuccessAnnounced = (await page.getByRole("status").textContent()).includes("PDF download started");
    await page.waitForFunction(() => document.activeElement?.classList.contains("printable-pdf-download"));
    checks.focusRemainsStable = await page.evaluate(() => document.activeElement?.classList.contains("printable-pdf-download"));

    const secondDownloadPromise = page.waitForEvent("download");
    await pdfButton.press("Enter");
    const secondDownload = await secondDownloadPromise;
    const secondTarget = path.join(DOWNLOAD_DIR, `repeat-${secondDownload.suggestedFilename()}`);
    await secondDownload.saveAs(secondTarget);
    await page.waitForFunction(() => document.querySelector(".printable-pdf-download")?.getAttribute("aria-busy") === "false");
    const lifecycle = await page.evaluate(() => ({
      ...window.__pdfQa,
      links: document.querySelectorAll('a[download$=".pdf"]').length,
      printIframes: document.querySelectorAll('iframe[title="Print preview document"]').length,
    }));
    checks.repeatedPdfFilenameDeterministic = secondDownload.suggestedFilename() === firstDownload.suggestedFilename();
    checks.objectUrlsRevoked = lifecycle.created === 2 && lifecycle.revoked === 2 && lifecycle.active === 0;
    checks.temporaryLinksRemoved = lifecycle.links === 0;
    checks.directDownloadDoesNotPrint = lifecycle.printCalls === 0 && lifecycle.printIframes === 0 && lifecycle.opens === 0;

    for (const format of ["PNG", "JPG", "WebP"]) {
      const control = page.getByRole("button", { name: new RegExp(`^Download ${format} for `) });
      if (await control.count()) {
        const downloadPromise = page.waitForEvent("download");
        await control.click();
        const download = await downloadPromise;
        checks[`download${format}Initiates`] = download.suggestedFilename().toLowerCase().endsWith(`.${format.toLowerCase()}`);
        await download.cancel();
      }
    }

    await page.getByRole("button", { name: "Print", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    await page.getByText("Print preview ready.", { exact: true }).waitFor();
    checks.printPreviewRetained = await dialog.isVisible() && await dialog.getByRole("button", { name: "Print", exact: true }).isEnabled();
    checks.printHandoffPresent = await dialog.getByRole("button", { name: "Print", exact: true }).count() === 1;
    await screenshot(page, "chrome-390-print-preview-dialog.png", screenshots);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Print");
    checks.printPreviewFocusRestored = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Print");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${APP_URL}${ROUTES[0]}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByRole("button", { name: /^Download WebP for / }).waitFor({ state: "visible" });
    await screenshot(page, "chrome-1440-printable-actions.png", screenshots);
    await page.locator(".printable-facts").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -96));
    await screenshot(page, "chrome-1440-page-details.png", screenshots);
  } finally {
    await context.close();
  }

  const failureContext = await browser.newContext({ acceptDownloads: true });
  const failurePage = await failureContext.newPage();
  try {
    await failurePage.route("**/*.svg", (route) => route.abort("failed"));
    await failurePage.setViewportSize({ width: 390, height: 844 });
    await failurePage.goto(`${APP_URL}${ROUTES[0]}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await failurePage.getByRole("button", { name: "Download PDF", exact: true }).click();
    await failurePage.waitForFunction(() => {
      const status = document.querySelector('[role="status"]')?.textContent || "";
      return status.length > 0 && !status.includes("Preparing PDF");
    });
    checks.pdfFailureAnnounced = /could not|failed|unable/i.test(await failurePage.getByRole("status").textContent());
    checks.pdfFailureDoesNotFallback = await failurePage.getByRole("button", { name: /^Download PNG for / }).isEnabled();
    await screenshot(failurePage, "chrome-390-download-pdf-failure.png", screenshots, failurePage.locator(".printable-action-panel"));
  } finally {
    await failureContext.close();
  }

  return { checks, downloadedPdf };
}

async function screenshot(page, name, screenshots, locator) {
  const target = path.join(REVIEW_DIR, name);
  if (locator) await locator.screenshot({ path: target });
  else await page.screenshot({ path: target, fullPage: false });
  screenshots.push(path.relative(ROOT, target).replaceAll("\\", "/"));
}

function containsInOrder(values, expected) {
  let index = -1;
  return expected.every((value) => {
    index = values.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate === value);
    return index >= 0;
  });
}

function firstLine(error) {
  return String(error?.message || error).split("\n")[0];
}
