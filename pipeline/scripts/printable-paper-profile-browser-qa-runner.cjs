#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { mkdtemp, mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const ts = require("typescript");

const ROOT = process.cwd();
const APP_URL = (process.argv[2] || "http://127.0.0.1:3012").replace(/\/$/, "");
const REVIEW_DIR = path.join(ROOT, "pipeline", "review", "printable-settings-ui");
const BASELINE_PATH = path.join(ROOT, "pipeline", "tests", "fixtures", "printable-paper-profile-baseline.json");
const RUNTIME_PRINTABLES_PATH = path.join(ROOT, "src", "generated", "coloring", "runtime-printables.json");
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
  { width: 2400, height: 1200 },
  { width: 3440, height: 1440 },
];
const INTERNAL_PROFILE_CASE_COUNT = 9;
const BROWSERS = [
  { id: "chrome", channel: "chrome" },
  { id: "edge", channel: "msedge" },
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  const runtime = JSON.parse(await readFile(RUNTIME_PRINTABLES_PATH, "utf8"));
  const records = baseline.representativeOutputs.map((expected) => {
    const record = runtime.records.find((item) => item.canonicalPath === expected.route);
    if (!record) throw new Error(`Baseline route is not in runtime printables: ${expected.route}`);
    return { expected, record };
  });
  const svgAssets = await fetchSvgAssets(records);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ilcp-paper-profile-qa-"));
  await rm(REVIEW_DIR, { recursive: true, force: true });
  await mkdir(REVIEW_DIR, { recursive: true });

  const results = {
    capturedAt: new Date().toISOString(),
    appUrl: APP_URL,
    browsers: [],
    viewports: VIEWPORTS.map(({ width }) => width),
    routes: records.map(({ expected }) => expected.route),
    defaultOutputChecks: [],
    imageOutputChecks: null,
    publicSettingsChecks: null,
    internalProfileChecks: [],
    screenshots: [],
    limitations: [
      "Chrome and Edge are both Chromium-based coverage.",
      "The UI checks cover all seven required widths; both installed channels are Chromium-based.",
      "The 200% and 400% checks use Chromium DevTools visual page scaling plus narrow-width reflow checks; physical browser UI zoom remains a manual check.",
    ],
  };

  try {
    for (const specification of BROWSERS) {
      let browser;
      try {
        browser = await chromium.launch({ channel: specification.channel, headless: true });
      } catch (error) {
        results.browsers.push({ id: specification.id, available: false, reason: firstLine(error) });
        continue;
      }

      try {
        const matrix = await runLayoutMatrix(browser, records, svgAssets, specification.id, results.screenshots);
        results.browsers.push({
          id: specification.id,
          available: true,
          engine: "Chromium",
          version: browser.version(),
          ...matrix,
        });
        if (specification.id === "chrome") {
          const output = await runDefaultOutputChecks(browser, records, svgAssets, tempRoot);
          results.defaultOutputChecks = output.pdfChecks;
          results.imageOutputChecks = output.imageChecks;
          results.lifecycle = output.lifecycle;
          results.lifecycleDiagnostics = output.diagnostics;
          results.publicSettingsChecks = await runPublicSettingsChecks(
            browser,
            records[0],
            svgAssets,
            tempRoot,
            results.screenshots,
            buildExportCompositionModuleUrl(),
          );
          results.internalProfileChecks = await runInternalProfileChecks(
            browser,
            buildBrowserDownloadsModuleUrl(),
            svgAssets.get(`${ASSET_BASE_URL}/${records[0].record.svgPath}`),
            tempRoot,
            results.screenshots,
          );
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  const availableBrowsers = results.browsers.filter((entry) => entry.available);
  results.summary = {
    availableBrowsers: availableBrowsers.map((entry) => entry.id),
    unavailableBrowsers: results.browsers.filter((entry) => !entry.available).map((entry) => entry.id),
    layoutChecksPassed: availableBrowsers.length === BROWSERS.length && availableBrowsers.every((entry) => entry.failures.length === 0),
    defaultPdfBytesPreserved: results.defaultOutputChecks.length === records.length
      && results.defaultOutputChecks.every((entry) => entry.matchesBaseline),
    defaultImageBytesPreserved: Boolean(results.imageOutputChecks?.matchesBaseline),
    lifecyclePassed: Object.values(results.lifecycle || {}).every(Boolean),
    internalProfilesPassed: results.internalProfileChecks.length === INTERNAL_PROFILE_CASE_COUNT
      && results.internalProfileChecks.every((entry) => entry.passed),
    publicSettingsPassed: Boolean(results.publicSettingsChecks?.passed),
  };
  results.summary.browserQaPassed = Object.values(results.summary).every((value) => Array.isArray(value) || value === true);

  const evidencePath = path.join(REVIEW_DIR, "browser-qa-results.json");
  await writeFile(evidencePath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(results, null, 2));
  if (!results.summary.browserQaPassed) process.exitCode = 1;
}

async function runPublicSettingsChecks(browser, { expected }, svgAssets, tempRoot, screenshots, compositionModuleUrl) {
  const context = await browser.newContext({ acceptDownloads: true });
  await installSvgFulfillment(context, svgAssets);
  await context.addInitScript(() => {
    window.print = () => {};
    window.open = () => null;
    window.__ILCP_PRINTABLE_SETTINGS_PERF__ = { longTasks: [], layoutShifts: [] };
    try {
      new PerformanceObserver((list) => {
        window.__ILCP_PRINTABLE_SETTINGS_PERF__.longTasks.push(...list.getEntries().map((entry) => entry.duration));
      }).observe({ type: "longtask", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        window.__ILCP_PRINTABLE_SETTINGS_PERF__.layoutShifts.push(...list.getEntries()
          .filter((entry) => !entry.hadRecentInput)
          .map((entry) => entry.value));
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(staticRouteUrl(expected.route), { waitUntil: "domcontentloaded", timeout: 45_000 });
    const previewUpdateStartedAt = Date.now();
    await page.locator('input[name$="-paper"][value="a4"]').check();
    await page.locator('input[name$="-orientation"][value="auto"]').check();
    await page.locator('input[name$="-scale"][value="75"]').check();
    await page.waitForFunction(() => document.querySelector("[data-printable-page-preview]")?.getAttribute("data-artwork-scale") === "75");
    const previewUpdateMs = Date.now() - previewUpdateStartedAt;
    const geometryResolution = await page.evaluate(async (moduleUrl) => {
      const module = await import(moduleUrl);
      const iterations = 10_000;
      const startedAt = performance.now();
      for (let index = 0; index < iterations; index += 1) {
        module.computePrintableLayout(800, 1200, {
          paperKind: index % 2 ? "letter" : "a4",
          orientation: index % 3 ? "auto" : "landscape",
          artworkScalePercent: index % 4 ? 75 : 100,
        });
      }
      const totalMs = performance.now() - startedAt;
      return { iterations, totalMs, averageMs: totalMs / iterations };
    }, compositionModuleUrl);

    const selected = await page.evaluate(() => ({
      paper: document.querySelector('input[name$="-paper"]:checked')?.value,
      orientation: document.querySelector('input[name$="-orientation"]:checked')?.value,
      scale: document.querySelector('input[name$="-scale"]:checked')?.value,
      pageProfile: document.querySelector("[data-printable-page-preview]")?.getAttribute("data-page-profile"),
      requestedOrientation: document.querySelector("[data-printable-page-preview]")?.getAttribute("data-requested-orientation"),
      scalePercent: document.querySelector("[data-printable-page-preview]")?.getAttribute("data-artwork-scale"),
      outputSummary: document.querySelector(".printable-settings-current")?.textContent?.trim(),
      resetVisible: Boolean(document.querySelector(".printable-settings-reset")),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }));

    const screenshotName = "chrome-1440-a4-auto-75-printable-settings.png";
    await page.locator(".printable-main").screenshot({ path: path.join(REVIEW_DIR, screenshotName) });
    screenshots.push(`pipeline/review/printable-settings-ui/${screenshotName}`);

    const pdfDownload = await captureDownload(page, page.getByRole("button", { name: "Download PDF", exact: true }), tempRoot);
    const pdfBytes = await readFile(pdfDownload.path);
    const pdfSource = pdfBytes.toString("latin1");

    await page.getByRole("button", { name: "Print", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    await page.getByText("Print preview ready.", { exact: true }).waitFor();
    const dialogProfile = await dialog.locator("[data-printable-page-preview]").getAttribute("data-page-profile");
    await dialog.getByRole("button", { name: "Print", exact: true }).click();
    await page.getByText("Printable PDF is ready.", { exact: true }).waitFor();
    const printSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();

    const pngDownload = await captureDownload(page, page.getByRole("button", { name: /^Download PNG for / }), tempRoot);
    const jpgDownload = await captureDownload(page, page.getByRole("button", { name: /^Download JPG for / }), tempRoot);
    const webpDownload = await captureDownload(page, page.getByRole("button", { name: /^Download WebP for / }), tempRoot);
    const pngDimensions = readPngDimensions(await readFile(pngDownload.path));
    const jpgDimensions = readJpegDimensions(await readFile(jpgDownload.path));

    const resetButton = page.getByRole("button", { name: "Reset to defaults", exact: true });
    await resetButton.focus();
    await page.keyboard.press("Space");
    const reset = await page.evaluate(() => ({
      paper: document.querySelector('input[name$="-paper"]:checked')?.value,
      orientation: document.querySelector('input[name$="-orientation"]:checked')?.value,
      scale: document.querySelector('input[name$="-scale"]:checked')?.value,
      pageProfile: document.querySelector("[data-printable-page-preview]")?.getAttribute("data-page-profile"),
      resetVisible: Boolean(document.querySelector(".printable-settings-reset")),
      activeValue: document.activeElement?.getAttribute("value"),
    }));

    const a4Control = page.locator('input[name$="-paper"][value="a4"]');
    await a4Control.focus();
    await page.keyboard.press("Space");
    const landscapeControl = page.locator('input[name$="-orientation"][value="landscape"]');
    await landscapeControl.focus();
    await page.keyboard.press("Space");
    const scaleControl = page.locator('input[name$="-scale"][value="90"]');
    await scaleControl.focus();
    await page.keyboard.press("Space");
    const keyboardSelection = await page.evaluate(() => ({
      paper: document.querySelector('input[name$="-paper"]:checked')?.value,
      orientation: document.querySelector('input[name$="-orientation"]:checked')?.value,
      scale: document.querySelector('input[name$="-scale"]:checked')?.value,
      activeValue: document.activeElement?.getAttribute("value"),
    }));
    const keyboardReset = page.getByRole("button", { name: "Reset to defaults", exact: true });
    await keyboardReset.focus();
    await page.keyboard.press("Enter");
    const cdp = await context.newCDPSession(page);
    const zoomChecks = [];
    for (const factor of [2, 4]) {
      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: factor });
      zoomChecks.push(await page.evaluate((expectedScale) => {
        const panel = document.querySelector(".printable-action-panel");
        const bounds = panel?.getBoundingClientRect();
        return {
          factor: expectedScale,
          visualScale: window.visualViewport?.scale || 1,
          controlsReachable: Boolean(bounds && bounds.width > 0 && bounds.height > 0),
        };
      }, factor));
    }
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });

    const expectedBase = pdfDownload.filename.replace(/-a4-auto-portrait-75\.pdf$/, "");
    const checks = {
      selectedProfile: selected.paper === "a4" && selected.orientation === "auto" && selected.scale === "75",
      autoResolutionVisible: selected.pageProfile === "a4-portrait"
        && selected.requestedOrientation === "auto"
        && /Auto selected: Portrait/.test(selected.outputSummary || ""),
      scaleVisible: selected.scalePercent === "75",
      noOverflow: !selected.overflow,
      resetAppears: selected.resetVisible,
      pdfFilename: pdfDownload.filename === `${expectedBase}-a4-auto-portrait-75.pdf`,
      pdfStructure: pdfBytes.subarray(0, 4).toString("ascii") === "%PDF"
        && requiredMatch(pdfSource, /\/MediaBox \[([^\]]+)\]/) === "0 0 595.28 841.89"
        && requiredMatch(pdfSource, /\/Filter (\/\w+)/) === "/FlateDecode",
      printUsesSameProfile: dialogProfile === "a4-portrait" && printSnapshot?.pageSize === "a4-portrait",
      pngOutput: pngDownload.filename === `${expectedBase}-a4-auto-portrait-75.png`
        && pngDimensions.width === 2480 && pngDimensions.height === 3508,
      jpgOutput: jpgDownload.filename === `${expectedBase}-a4-auto-portrait-75.jpg`
        && jpgDimensions.width === 2480 && jpgDimensions.height === 3508,
      webpIndependent: webpDownload.filename === `${expectedBase}.webp`,
      resetRestoresDefaults: reset.paper === "letter" && reset.orientation === "portrait"
        && reset.scale === "100" && reset.pageProfile === "letter-portrait" && !reset.resetVisible
        && reset.activeValue === "letter",
      nativeKeyboardSelection: keyboardSelection.paper === "a4" && keyboardSelection.orientation === "landscape"
        && keyboardSelection.scale === "90" && keyboardSelection.activeValue === "90",
      keyboardReset: !await page.locator(".printable-settings-reset").count(),
      zoomReachability: zoomChecks.every((entry) => entry.visualScale === entry.factor && entry.controlsReachable),
    };
    return {
      route: expected.route,
      selected,
      downloads: {
        pdf: { filename: pdfDownload.filename, bytes: pdfBytes.length, durationMs: pdfDownload.durationMs },
        png: { filename: pngDownload.filename, ...pngDimensions, durationMs: pngDownload.durationMs },
        jpg: { filename: jpgDownload.filename, ...jpgDimensions, durationMs: jpgDownload.durationMs },
        webp: { filename: webpDownload.filename, durationMs: webpDownload.durationMs },
      },
      performance: await page.evaluate(({ previewUpdateMs: measuredPreviewUpdateMs, geometryResolution: measuredGeometry }) => ({
        previewUpdateMs: measuredPreviewUpdateMs,
        geometryResolution: measuredGeometry,
        longTasks: window.__ILCP_PRINTABLE_SETTINGS_PERF__?.longTasks || [],
        layoutShiftScore: (window.__ILCP_PRINTABLE_SETTINGS_PERF__?.layoutShifts || []).reduce((sum, value) => sum + value, 0),
      }), { previewUpdateMs, geometryResolution }),
      dialogProfile,
      printPageSize: printSnapshot?.pageSize || null,
      reset,
      keyboardSelection,
      zoomChecks,
      checks,
      passed: Object.values(checks).every(Boolean),
    };
  } finally {
    await context.close();
  }
}

async function runLayoutMatrix(browser, records, svgAssets, browserId, screenshots) {
  const context = await browser.newContext({ acceptDownloads: true });
  await installSvgFulfillment(context, svgAssets);
  const failures = [];
  let pageCount = 0;
  try {
    for (const viewport of VIEWPORTS) {
      for (const { expected } of records) {
        const page = await context.newPage();
        try {
          await page.setViewportSize(viewport);
          const response = await page.goto(staticRouteUrl(expected.route), { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.locator(".printable-action-panel").waitFor({ state: "visible" });
          await page.getByRole("button", { name: "Download PDF", exact: true }).waitFor({ state: "visible" });
          const metrics = await page.evaluate(() => {
            const panel = document.querySelector(".printable-action-panel");
            const labels = [...panel.querySelectorAll("button")].map((button) => button.textContent.trim());
            return {
              documentOverflow: document.documentElement.scrollWidth > window.innerWidth,
              panelOverflow: panel.scrollWidth > panel.clientWidth,
              labels,
              settingsMarker: document.querySelector('[data-printable-settings-version="paper-controls-v1"]') !== null,
              settingsGroups: [...document.querySelectorAll(".printable-settings fieldset")].map((fieldset) => ({
                legend: fieldset.querySelector("legend")?.textContent?.trim() || "",
                checked: fieldset.querySelector('input[type="radio"]:checked')?.value || "",
              })),
              previewProfile: document.querySelector("[data-printable-page-preview]")?.getAttribute("data-page-profile") || "",
              details: document.querySelector(".printable-facts")?.textContent || "",
            };
          });
          pageCount += 1;
          if (!response || response.status() !== 200) failures.push(`${expected.route}@${viewport.width}: HTTP ${response?.status() || 0}`);
          if (metrics.documentOverflow || metrics.panelOverflow) failures.push(`${expected.route}@${viewport.width}: horizontal overflow`);
          if (!containsInOrder(metrics.labels, ["Download PDF", "Print"])) failures.push(`${expected.route}@${viewport.width}: default action order changed`);
          if (!metrics.settingsMarker) failures.push(`${expected.route}@${viewport.width}: settings marker missing`);
          if (JSON.stringify(metrics.settingsGroups) !== JSON.stringify([
            { legend: "Paper", checked: "letter" },
            { legend: "Orientation", checked: "portrait" },
            { legend: "Artwork size", checked: "100" },
          ])) failures.push(`${expected.route}@${viewport.width}: default settings changed`);
          if (metrics.previewProfile !== "letter-portrait") failures.push(`${expected.route}@${viewport.width}: preview default changed`);
          if (!metrics.details.includes("US Letter, portrait")) failures.push(`${expected.route}@${viewport.width}: default paper fact changed`);

          if (browserId === "chrome" && expected === records[0].expected && viewport.width === 390) {
            const name = `${browserId}-${viewport.width}-default-printable-actions.png`;
            await page.locator(".printable-detail-page").screenshot({ path: path.join(REVIEW_DIR, name) });
            screenshots.push(`pipeline/review/printable-settings-ui/${name}`);
          }
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

async function runDefaultOutputChecks(browser, records, svgAssets, tempRoot) {
  const context = await browser.newContext({ acceptDownloads: true });
  await installSvgFulfillment(context, svgAssets);
  await context.addInitScript(() => {
    window.__paperProfileQa = { created: 0, revoked: 0, active: 0, printCalls: 0, opens: 0 };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      if (blob?.type === "application/pdf") {
        window.__paperProfileQa.created += 1;
        window.__paperProfileQa.active += 1;
      }
      return url;
    };
    URL.revokeObjectURL = (url) => {
      if (String(url).startsWith("blob:")) {
        window.__paperProfileQa.revoked += 1;
        window.__paperProfileQa.active = Math.max(0, window.__paperProfileQa.active - 1);
      }
      return revoke(url);
    };
    window.print = () => { window.__paperProfileQa.printCalls += 1; };
    window.open = () => { window.__paperProfileQa.opens += 1; return null; };
  });
  const page = await context.newPage();
  const pdfChecks = [];
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const { expected } of records) {
      await page.goto(staticRouteUrl(expected.route), { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.locator(".printable-action-panel").waitFor({ state: "visible" });
      const captured = await captureDownload(page, page.getByRole("button", { name: "Download PDF", exact: true }), tempRoot);
      const bytes = await readFile(captured.path);
      const repeated = await captureDownload(page, page.getByRole("button", { name: "Download PDF", exact: true }), tempRoot);
      const repeatedBytes = await readFile(repeated.path);
      const source = bytes.toString("latin1");
      const check = {
        route: expected.route,
        filename: captured.filename,
        bytes: bytes.length,
        sha256: sha256(bytes),
        magic: bytes.subarray(0, 4).toString("ascii"),
        pageCount: Number(requiredMatch(source, /\/Type \/Pages \/Kids \[3 0 R\] \/Count (\d+)/)),
        mediaBox: requiredMatch(source, /\/MediaBox \[([^\]]+)\]/),
        filter: requiredMatch(source, /\/Filter (\/\w+)/),
        generationMs: { cold: captured.durationMs, repeat: repeated.durationMs },
        repeatedBytes: repeatedBytes.length,
        repeatedSha256: sha256(repeatedBytes),
      };
      check.matchesBaseline = check.bytes === expected.pdfBytes
        && check.sha256 === expected.pdfSha256
        && check.magic === "%PDF"
        && check.pageCount === 1
        && check.mediaBox === "0 0 612 792"
        && check.filter === "/FlateDecode"
        && check.repeatedBytes === check.bytes
        && check.repeatedSha256 === check.sha256;
      pdfChecks.push(check);
    }

    await page.goto(staticRouteUrl(records[0].expected.route), { waitUntil: "domcontentloaded", timeout: 45_000 });
    const imageChecks = {};
    for (const [label, key, extension] of [["PNG", "png", ".png"], ["JPG", "jpg", ".jpg"], ["WebP", "webp", ".webp"]]) {
      const captured = await captureDownload(page, page.getByRole("button", { name: new RegExp(`^Download ${label} for `) }), tempRoot);
      const bytes = await readFile(captured.path);
      imageChecks[key] = { filename: captured.filename, bytes: bytes.length, sha256: sha256(bytes) };
      if (!captured.filename.endsWith(extension)) throw new Error(`${label} filename changed: ${captured.filename}`);
    }
    const first = records[0].expected;
    imageChecks.matchesBaseline = imageChecks.png.bytes === first.pngBytes
      && imageChecks.png.sha256 === first.pngSha256
      && imageChecks.jpg.bytes === first.jpgBytes
      && imageChecks.jpg.sha256 === first.jpgSha256
      && imageChecks.webp.bytes === first.webpBytes
      && imageChecks.webp.sha256 === first.webpSha256;

    const directState = await page.evaluate(() => ({
      pdfAnchors: document.querySelectorAll('a[download$=".pdf"]').length,
      printIframes: document.querySelectorAll('iframe[title="Printable coloring page PDF"]').length,
      opens: window.__paperProfileQa.opens,
    }));

    await page.getByRole("button", { name: "Print", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    await page.getByText("Print preview ready.", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Print", exact: true }).click();
    await page.getByText("Printable PDF is ready.", { exact: true }).waitFor();
    const printSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__);
    const printState = await page.evaluate(() => ({
      printIframes: document.querySelectorAll('iframe[title="Printable coloring page PDF"]').length,
      iframeAriaHidden: document.querySelector('iframe[title="Printable coloring page PDF"]')?.getAttribute("aria-hidden"),
    }));
    const lifecycle = {
      temporaryAnchorsRemoved: directState.pdfAnchors === 0,
      directDownloadDidNotPrint: directState.printIframes === 0 && directState.opens === 0,
      printPreparedDefaultProfile: printSnapshot?.pageSize === "letter-portrait"
        && printSnapshot?.pageCount === 1
        && printSnapshot?.printableBorderCount === 1,
      printHandoffRetained: printState.printIframes === 1,
      printIframeHiddenFromAccessibilityTree: printState.iframeAriaHidden === "true",
    };
    return { pdfChecks, imageChecks, lifecycle, diagnostics: { directState, printState, printSnapshot } };
  } finally {
    await context.close();
  }
}

async function runInternalProfileChecks(browser, moduleUrl, svgBytes, tempRoot, screenshots) {
  const profiles = [
    { name: "a4-portrait-100", source: "portrait", request: { paperKind: "a4", orientation: "portrait", artworkScalePercent: 100 }, expectedPage: "a4-portrait", expectedMediaBox: "0 0 595.28 841.89", expectedRaster: [2480, 3508], expectedFilename: "animals-alligator-a4.pdf" },
    { name: "letter-landscape-100", source: "portrait", request: { paperKind: "letter", orientation: "landscape", artworkScalePercent: 100 }, expectedPage: "letter-landscape", expectedMediaBox: "0 0 792 612", expectedRaster: [3300, 2550], expectedFilename: "animals-alligator-landscape.pdf" },
    { name: "letter-auto-portrait-100", source: "portrait", request: { paperKind: "letter", orientation: "auto", artworkScalePercent: 100 }, expectedPage: "letter-portrait", expectedMediaBox: "0 0 612 792", expectedRaster: [2550, 3300], expectedFilename: "animals-alligator-auto-portrait.pdf" },
    { name: "letter-auto-landscape-100", source: "landscape", request: { paperKind: "letter", orientation: "auto", artworkScalePercent: 100 }, expectedPage: "letter-landscape", expectedMediaBox: "0 0 792 612", expectedRaster: [3300, 2550], expectedFilename: "animals-alligator-auto-landscape.pdf" },
    { name: "a4-auto-square-100", source: "square", request: { paperKind: "a4", orientation: "auto", artworkScalePercent: 100 }, expectedPage: "a4-portrait", expectedMediaBox: "0 0 595.28 841.89", expectedRaster: [2480, 3508], expectedFilename: "animals-alligator-a4-auto-portrait.pdf" },
    { name: "letter-portrait-90", source: "portrait", request: { paperKind: "letter", orientation: "portrait", artworkScalePercent: 90 }, expectedPage: "letter-portrait", expectedMediaBox: "0 0 612 792", expectedRaster: [2550, 3300], expectedFilename: "animals-alligator-90.pdf" },
    { name: "letter-portrait-75", source: "portrait", request: { paperKind: "letter", orientation: "portrait", artworkScalePercent: 75 }, expectedPage: "letter-portrait", expectedMediaBox: "0 0 612 792", expectedRaster: [2550, 3300], expectedFilename: "animals-alligator-75.pdf" },
    { name: "letter-portrait-50", source: "portrait", request: { paperKind: "letter", orientation: "portrait", artworkScalePercent: 50 }, expectedPage: "letter-portrait", expectedMediaBox: "0 0 612 792", expectedRaster: [2550, 3300], expectedFilename: "animals-alligator-50.pdf" },
    { name: "a4-landscape-75", source: "portrait", request: { paperKind: "a4", orientation: "landscape", artworkScalePercent: 75 }, expectedPage: "a4-landscape", expectedMediaBox: "0 0 841.89 595.28", expectedRaster: [3508, 2480], expectedFilename: "animals-alligator-a4-landscape-75.pdf" },
  ];
  const sourceFixtures = {
    portrait: svgBytes.toString("base64"),
    landscape: Buffer.from(syntheticLineArtSvg(1200, 800)).toString("base64"),
    square: Buffer.from(syntheticLineArtSvg(1000, 1000)).toString("base64"),
  };
  const saved = new Map();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.exposeFunction("savePaperProfilePdf", async (name, base64) => {
    const target = path.join(tempRoot, `${name}.pdf`);
    await writeFile(target, Buffer.from(base64, "base64"));
    saved.set(name, target);
  });

  let browserResults;
  try {
    await page.goto("about:blank");
    browserResults = await page.evaluate(async ({ moduleUrl: sourceModuleUrl, sources, profileInputs }) => {
      const downloads = await import(sourceModuleUrl);
      const results = [];
      for (const profile of profileInputs) {
        const svgUrl = `data:image/svg+xml;base64,${sources[profile.source]}`;
        const startedAt = performance.now();
        const prepared = await downloads.prepareOnePagePrintPdf({
          internalSvgUrl: svgUrl,
          pngPreviewUrl: null,
          title: "Animals Alligator",
          filenameBaseName: "Animals Alligator",
          altText: "Animals Alligator coloring page",
          composition: profile.request,
        });
        if (!prepared.ok) {
          results.push({ name: profile.name, error: prepared.message });
          continue;
        }
        const bytes = new Uint8Array(await prepared.pdfBlob.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 32_768) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 32_768));
        }
        await window.savePaperProfilePdf(profile.name, btoa(binary));
        const raster = await downloads.composePrintableRasterToBlob({
          internalSvgUrl: svgUrl,
          pngPreviewUrl: null,
          title: "Animals Alligator",
          format: "png",
          composition: profile.request,
        });
        results.push({
          name: profile.name,
          generationMs: Math.round((performance.now() - startedAt) * 100) / 100,
          pageSize: prepared.pageSize,
          pageDimensions: prepared.pageDimensions,
          pageCount: prepared.pageCount,
          pdfBytes: bytes.length,
          imageBox: prepared.imageBox,
          artworkBox: prepared.artworkBox,
          brandBox: prepared.brandBox,
          filename: prepared.filename,
          metadataTitle: prepared.metadataTitle,
          raster: raster.ok ? { width: raster.width, height: raster.height, mimeType: raster.mimeType } : { error: raster.message },
        });
        downloads.revokePreparedPrintPdf(prepared);
      }
      return results;
    }, {
      moduleUrl,
      sources: sourceFixtures,
      profileInputs: profiles,
    });
  } finally {
    await context.close();
  }

  return browserResults.map((result) => {
    const expected = profiles.find((profile) => profile.name === result.name);
    if (result.error) return { ...result, passed: false };
    const pdfPath = saved.get(result.name);
    const bytes = require("node:fs").readFileSync(pdfPath);
    const source = bytes.toString("latin1");
    const mediaBox = requiredMatch(source, /\/MediaBox \[([^\]]+)\]/);
    const filter = requiredMatch(source, /\/Filter (\/\w+)/);
    const info = runPdfTool("pdfinfo", [pdfPath], { encoding: "utf8" });
    const renderPrefix = path.join(REVIEW_DIR, result.name);
    runPdfTool("pdftoppm", ["-f", "1", "-singlefile", "-r", "144", "-png", pdfPath, renderPrefix]);
    const renderedPath = `pipeline/review/printable-settings-ui/${result.name}.png`;
    screenshots.push(renderedPath);
    const contained = result.imageBox.x >= result.artworkBox.x
      && result.imageBox.y >= result.artworkBox.y
      && result.imageBox.x + result.imageBox.width <= result.artworkBox.x + result.artworkBox.width + 0.0001
      && result.imageBox.y + result.imageBox.height <= result.artworkBox.y + result.artworkBox.height + 0.0001;
    const passed = result.pageSize === expected.expectedPage
      && result.pageCount === 1
      && mediaBox === expected.expectedMediaBox
      && filter === "/FlateDecode"
      && result.pdfBytes > 0
      && result.pdfBytes <= 3 * 1024 * 1024
      && result.filename === expected.expectedFilename
      && result.metadataTitle === "Animals Alligator - iLoveColoringPage.com"
      && result.raster?.mimeType === "image/png"
      && result.raster?.width === expected.expectedRaster[0]
      && result.raster?.height === expected.expectedRaster[1]
      && contained
      && /Pages:\s+1\b/.test(info);
    return {
      ...result,
      mediaBox,
      filter,
      sha256: sha256(bytes),
      imageContainedInSafeArea: contained,
      pdfInfoPageCount: Number(requiredMatch(info, /Pages:\s+(\d+)/)),
      renderedOutput: renderedPath,
      passed,
    };
  });
}

async function captureDownload(page, control, tempRoot) {
  await control.waitFor({ state: "visible" });
  const handle = await control.elementHandle();
  await page.waitForFunction((element) => !element.disabled && !/Preparing/.test(element.textContent || ""), handle);
  const startedAt = Date.now();
  const event = page.waitForEvent("download");
  await control.click();
  const download = await event;
  const target = path.join(tempRoot, `${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(target);
  await page.waitForFunction(
    (element) => !element.disabled && element.getAttribute("aria-busy") !== "true" && !/Preparing/.test(element.textContent || ""),
    handle,
  );
  return { path: target, filename: download.suggestedFilename(), durationMs: Date.now() - startedAt };
}

async function fetchSvgAssets(records) {
  const result = new Map();
  for (const { record } of records) {
    const url = `${ASSET_BASE_URL}/${record.svgPath}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`SVG fixture fetch failed (${response.status}): ${url}`);
    result.set(url, Buffer.from(await response.arrayBuffer()));
  }
  return result;
}

async function installSvgFulfillment(context, svgAssets) {
  await context.route("**/*.svg", async (route) => {
    const bytes = svgAssets.get(route.request().url());
    if (!bytes) return route.abort("failed");
    return route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      headers: { "access-control-allow-origin": "*" },
      body: bytes,
    });
  });
}

function containsInOrder(values, expected) {
  let previous = -1;
  return expected.every((value) => {
    previous = values.findIndex((candidate, index) => index > previous && candidate === value);
    return previous >= 0;
  });
}

function staticRouteUrl(route) {
  return `${APP_URL}${route}.html`;
}

function requiredMatch(source, pattern) {
  const match = source.match(pattern);
  if (!match) throw new Error(`Missing PDF contract: ${pattern}`);
  return match[1];
}

function readPngDimensions(bytes) {
  if (bytes.subarray(1, 4).toString("ascii") !== "PNG") throw new Error("Downloaded PNG has invalid magic bytes");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readJpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Downloaded JPG has invalid magic bytes");
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > bytes.length) break;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += length + 2;
  }
  throw new Error("Downloaded JPG has no readable frame dimensions");
}

function syntheticLineArtSvg(width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><g fill="none" stroke="black" stroke-width="4"><rect x="12" y="12" width="${width - 24}" height="${height - 24}"/><path d="M 40 ${height - 40} L ${width - 40} 40 M 40 40 Q ${width / 2} ${height - 80} ${width - 40} 40"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 5}"/></g></svg>`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function buildBrowserDownloadsModuleUrl() {
  const compositionUrl = buildExportCompositionModuleUrl();
  const downloadsSource = require("node:fs").readFileSync(path.join(ROOT, "src", "lib", "coloring", "browserDownloads.ts"), "utf8")
    .replace('from "./exportComposition";', `from "${compositionUrl}";`);
  const downloadsOutput = ts.transpileModule(downloadsSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(downloadsOutput).toString("base64")}`;
}

function buildExportCompositionModuleUrl() {
  const compositionSource = require("node:fs").readFileSync(path.join(ROOT, "src", "lib", "coloring", "exportComposition.ts"), "utf8");
  const compositionOutput = ts.transpileModule(compositionSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compositionOutput).toString("base64")}`;
}

function firstLine(error) {
  return String(error?.message || error).split("\n")[0];
}

function runPdfTool(command, args, options = {}) {
  return execFileSync(resolvePdfTool(command), args, options);
}

function resolvePdfTool(command) {
  if (process.platform !== "win32") return command;
  let candidates = [];
  try {
    candidates = execFileSync("where.exe", [command], { encoding: "utf8" })
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    // The error below includes the missing command name.
  }
  for (const candidate of candidates) {
    if (candidate.toLowerCase().endsWith(".exe")) return candidate;
    const directory = path.dirname(candidate);
    const runtimeCandidates = [
      path.resolve(directory, "..", "..", "native", "poppler", "Library", "bin", `${command}.exe`),
      path.resolve(directory, "..", "Library", "bin", `${command}.exe`),
    ];
    const existing = runtimeCandidates.find((value) => require("node:fs").existsSync(value));
    if (existing) return existing;
  }
  throw new Error(`Required PDF inspection tool is unavailable: ${command}`);
}
