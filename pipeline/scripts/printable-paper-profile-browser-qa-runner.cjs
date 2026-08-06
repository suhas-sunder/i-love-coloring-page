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
const REVIEW_DIR = path.join(ROOT, "pipeline", "review", "printable-paper-profile");
const BASELINE_PATH = path.join(ROOT, "pipeline", "tests", "fixtures", "printable-paper-profile-baseline.json");
const RUNTIME_PRINTABLES_PATH = path.join(ROOT, "src", "generated", "coloring", "runtime-printables.json");
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
];
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
  await mkdir(REVIEW_DIR, { recursive: true });

  const results = {
    capturedAt: new Date().toISOString(),
    appUrl: APP_URL,
    browsers: [],
    viewports: VIEWPORTS.map(({ width }) => width),
    routes: records.map(({ expected }) => expected.route),
    defaultOutputChecks: [],
    imageOutputChecks: null,
    internalProfileChecks: [],
    screenshots: [],
    limitations: [
      "Chrome and Edge are both Chromium-based coverage.",
      "No paper, orientation, or artwork-scale controls are exposed by this milestone.",
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
    internalProfilesPassed: results.internalProfileChecks.length === 4
      && results.internalProfileChecks.every((entry) => entry.passed),
  };
  results.summary.browserQaPassed = Object.values(results.summary).every((value) => Array.isArray(value) || value === true);

  const evidencePath = path.join(REVIEW_DIR, "browser-qa-results.json");
  await writeFile(evidencePath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(results, null, 2));
  if (!results.summary.browserQaPassed) process.exitCode = 1;
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
              newControlText: /\bA4\b|automatic orientation|artwork scale|landscape/i.test(panel.textContent),
              details: document.querySelector(".printable-facts")?.textContent || "",
            };
          });
          pageCount += 1;
          if (!response || response.status() !== 200) failures.push(`${expected.route}@${viewport.width}: HTTP ${response?.status() || 0}`);
          if (metrics.documentOverflow || metrics.panelOverflow) failures.push(`${expected.route}@${viewport.width}: horizontal overflow`);
          if (!containsInOrder(metrics.labels, ["Download PDF", "Print"])) failures.push(`${expected.route}@${viewport.width}: default action order changed`);
          if (metrics.newControlText) failures.push(`${expected.route}@${viewport.width}: future paper controls leaked into UI`);
          if (!metrics.details.includes("US Letter, portrait")) failures.push(`${expected.route}@${viewport.width}: default paper fact changed`);

          if (expected === records[0].expected && (viewport.width === 390 || viewport.width === 1440)) {
            const name = `${browserId}-${viewport.width}-default-printable-actions.png`;
            await page.locator(".printable-detail-page").screenshot({ path: path.join(REVIEW_DIR, name) });
            screenshots.push(`pipeline/review/printable-paper-profile/${name}`);
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
    { name: "letter-landscape-100", request: { paperKind: "letter", orientation: "landscape", artworkScalePercent: 100 }, expectedPage: "letter-landscape", expectedMediaBox: "0 0 792 612", expectedRaster: [3300, 2550] },
    { name: "a4-portrait-90", request: { paperKind: "a4", orientation: "portrait", artworkScalePercent: 90 }, expectedPage: "a4-portrait", expectedMediaBox: "0 0 595.28 841.89", expectedRaster: [2480, 3508] },
    { name: "a4-landscape-75", request: { paperKind: "a4", orientation: "landscape", artworkScalePercent: 75 }, expectedPage: "a4-landscape", expectedMediaBox: "0 0 841.89 595.28", expectedRaster: [3508, 2480] },
    { name: "a4-auto-50", request: { paperKind: "a4", orientation: "auto", artworkScalePercent: 50 }, expectedPage: "a4-portrait", expectedMediaBox: "0 0 595.28 841.89", expectedRaster: [2480, 3508] },
  ];
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
    browserResults = await page.evaluate(async ({ moduleUrl: sourceModuleUrl, svgBase64, profileInputs }) => {
      const downloads = await import(sourceModuleUrl);
      const svgUrl = `data:image/svg+xml;base64,${svgBase64}`;
      const results = [];
      for (const profile of profileInputs) {
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
      svgBase64: svgBytes.toString("base64"),
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
    const renderedPath = `pipeline/review/printable-paper-profile/${result.name}.png`;
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
      && result.filename === "animals-alligator.pdf"
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function buildBrowserDownloadsModuleUrl() {
  const compositionSource = require("node:fs").readFileSync(path.join(ROOT, "src", "lib", "coloring", "exportComposition.ts"), "utf8");
  const compositionOutput = ts.transpileModule(compositionSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  const compositionUrl = `data:text/javascript;base64,${Buffer.from(compositionOutput).toString("base64")}`;
  const downloadsSource = require("node:fs").readFileSync(path.join(ROOT, "src", "lib", "coloring", "browserDownloads.ts"), "utf8")
    .replace('from "./exportComposition";', `from "${compositionUrl}";`);
  const downloadsOutput = ts.transpileModule(downloadsSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(downloadsOutput).toString("base64")}`;
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
