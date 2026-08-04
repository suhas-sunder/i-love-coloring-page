#!/usr/bin/env node

const { mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { deflateSync, inflateSync } = require("node:zlib");
const { chromium } = require("playwright");
const sharp = require("sharp");

const ROOT = process.cwd();
const APP_URL = (process.env.PDF_COMPRESSION_APP_URL || "http://127.0.0.1:3005").replace(/\/$/, "");
const REVIEW_DIR = path.join(ROOT, "pipeline", "review", "pdf-compression");
const BASELINE_DIR = path.join(REVIEW_DIR, "baseline");
const BAKEOFF_DIR = path.join(REVIEW_DIR, "bakeoff");
const FINAL_DIR = path.join(REVIEW_DIR, "final");
const ROUTES = [
  { route: "/printables/animals/animals-alligator-4feec8505a", filename: "animals-alligator.pdf" },
  { route: "/printables/animals/cats-playing-cards-c22648db9b", filename: "cats-playing-cards.pdf" },
  { route: "/printables/anime-girls/anime-girl-brazilian-jiu-jitsu-5a40029b84", filename: "anime-girl-brazilian-jiu-jitsu.pdf" },
];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const mode = process.argv[2] || "all";
  if (!new Set(["baseline", "bakeoff", "verify", "all"]).has(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  await mkdir(REVIEW_DIR, { recursive: true });
  const results = {};
  if (mode === "baseline" || mode === "all") results.baseline = await captureBrowserBaseline();
  if (mode === "bakeoff" || mode === "all") results.bakeoff = await buildBakeoff();
  if (mode === "verify" || mode === "all") results.verification = await runBrowserVerification();
  console.log(JSON.stringify(results, null, 2));
}

async function runBrowserVerification() {
  await rm(FINAL_DIR, { recursive: true, force: true });
  await mkdir(FINAL_DIR, { recursive: true });
  const specifications = [
    { id: "chrome", channel: "chrome" },
    { id: "edge", channel: "msedge" },
  ];
  const results = {
    verifiedAt: new Date().toISOString(),
    appUrl: APP_URL,
    viewports: VIEWPORTS.map(({ width }) => width),
    routes: ROUTES.map(({ route }) => route),
    browsers: [],
    screenshots: [],
  };

  for (const specification of specifications) {
    let browser;
    try {
      browser = await chromium.launch({ channel: specification.channel, headless: true });
    } catch (error) {
      results.browsers.push({ id: specification.id, available: false, reason: firstLine(error) });
      continue;
    }

    try {
      const matrix = await verifyResponsiveMatrix(browser, specification.id, results.screenshots);
      const interactions = await verifyCompressedDownloadsAndPrint(browser, specification.id);
      results.browsers.push({
        id: specification.id,
        available: true,
        version: browser.version(),
        engineCoverage: "Chromium",
        ...matrix,
        ...interactions,
      });
    } finally {
      await browser.close();
    }
  }

  const available = results.browsers.filter((entry) => entry.available);
  results.summary = {
    availableBrowsers: available.map((entry) => entry.id),
    unavailableBrowsers: results.browsers.filter((entry) => !entry.available).map((entry) => entry.id),
    maxPdfBytes: Math.max(...available.flatMap((entry) => entry.downloads.map((record) => record.byteLength))),
    everyPdfAtOrBelow3MiB: available.every((entry) => entry.downloads.every((record) => record.byteLength <= 3 * 1024 * 1024)),
    allChecksPassed: available.length === specifications.length && available.every((entry) => entry.failures.length === 0),
  };
  await writeFile(path.join(FINAL_DIR, "browser-verification-results.json"), `${JSON.stringify(results, null, 2)}\n`);
  if (!results.summary.allChecksPassed) process.exitCode = 1;
  return results;
}

async function verifyResponsiveMatrix(browser, browserId, screenshots) {
  const context = await browser.newContext({ acceptDownloads: true });
  const failures = [];
  let pagesChecked = 0;
  try {
    for (const viewport of VIEWPORTS) {
      for (const routeRecord of ROUTES) {
        const page = await context.newPage();
        try {
          await page.setViewportSize(viewport);
          const response = await page.goto(`${APP_URL}${routeRecord.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.locator(".printable-action-panel").waitFor({ state: "visible" });
          await page.getByRole("button", { name: "Download PDF", exact: true }).waitFor({ state: "visible" });
          const metrics = await page.evaluate(() => {
            const panel = document.querySelector(".printable-action-panel");
            const actionLabels = [...panel.querySelectorAll("button")].map((button) => {
              const ariaLabel = button.getAttribute("aria-label");
              return ariaLabel?.startsWith("Download ") ? ariaLabel.split(" for ")[0] : button.textContent.trim();
            });
            return {
              actionLabels,
              pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
              panelOverflow: panel.scrollWidth > panel.clientWidth,
              directPdfCount: [...panel.querySelectorAll("button")].filter((button) => button.textContent.trim() === "Download PDF").length,
              detailsText: document.querySelector(".printable-facts")?.textContent || "",
            };
          });
          pagesChecked += 1;
          if (!response || response.status() !== 200) failures.push(`${routeRecord.route}@${viewport.width}: HTTP ${response?.status() || 0}`);
          if (metrics.pageOverflow || metrics.panelOverflow) failures.push(`${routeRecord.route}@${viewport.width}: horizontal overflow`);
          if (!containsInOrder(metrics.actionLabels, ["Download PDF", "Print", "Download PNG"])) failures.push(`${routeRecord.route}@${viewport.width}: action order changed`);
          if (metrics.directPdfCount !== 1) failures.push(`${routeRecord.route}@${viewport.width}: direct PDF action count ${metrics.directPdfCount}`);
          if (!metrics.detailsText.includes("US Letter, portrait") || !metrics.detailsText.includes("2550 × 3300 px")) failures.push(`${routeRecord.route}@${viewport.width}: output facts changed`);

          if (browserId === "chrome" && routeRecord === ROUTES[0] && (viewport.width === 390 || viewport.width === 1440)) {
            const name = `${browserId}-${viewport.width}-printable-actions.png`;
            const target = path.join(FINAL_DIR, name);
            await page.locator(".printable-action-panel").screenshot({ path: target });
            screenshots.push(relative(target));
          }
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
  return { pagesChecked, failures };
}

async function verifyCompressedDownloadsAndPrint(browser, browserId) {
  const failures = [];
  const downloads = [];
  const outputDir = path.join(FINAL_DIR, browserId);
  await mkdir(outputDir, { recursive: true });

  for (const routeRecord of ROUTES) {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      window.__pdfCompressionQa = { created: 0, revoked: 0, active: 0, printCalls: 0, opens: 0, pdfSizes: [] };
      const createObjectURL = URL.createObjectURL.bind(URL);
      const revokeObjectURL = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = createObjectURL(blob);
        if (blob?.type === "application/pdf") {
          window.__pdfCompressionQa.created += 1;
          window.__pdfCompressionQa.active += 1;
          window.__pdfCompressionQa.pdfSizes.push(blob.size);
        }
        return url;
      };
      URL.revokeObjectURL = (url) => {
        if (String(url).startsWith("blob:")) {
          window.__pdfCompressionQa.revoked += 1;
          window.__pdfCompressionQa.active = Math.max(0, window.__pdfCompressionQa.active - 1);
        }
        return revokeObjectURL(url);
      };
      window.print = () => { window.__pdfCompressionQa.printCalls += 1; };
      const open = window.open.bind(window);
      window.open = (...args) => { window.__pdfCompressionQa.opens += 1; return open(...args); };
    });
    const page = await context.newPage();
    try {
      await page.goto(`${APP_URL}${routeRecord.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const pdfButton = page.getByRole("button", { name: "Download PDF", exact: true });
      await pdfButton.waitFor({ state: "visible" });
      const timingsMs = [];
      let firstRecord;
      for (let iteration = 0; iteration < 2; iteration += 1) {
        const started = performance.now();
        const [download] = await Promise.all([page.waitForEvent("download"), pdfButton.click()]);
        const target = path.join(outputDir, iteration === 0 ? routeRecord.filename : `repeat-${routeRecord.filename}`);
        await download.saveAs(target);
        await page.waitForFunction(() => document.querySelector(".printable-pdf-download")?.getAttribute("aria-busy") === "false");
        timingsMs.push(round(performance.now() - started));
        const pdf = await readFile(target);
        const image = parsePdfImage(pdf);
        const inflated = image.filter === "/FlateDecode" ? inflateSync(image.bytes) : null;
        const record = {
          route: routeRecord.route,
          path: relative(target),
          filename: download.suggestedFilename(),
          byteLength: pdf.length,
          mimeType: "application/pdf",
          magic: pdf.subarray(0, 4).toString("ascii"),
          pageCount: countPdfPages(pdf),
          mediaBox: parseMediaBox(pdf),
          metadataTitle: parseMetadataTitle(pdf),
          image: imageSummary(image),
          inflatedImageBytes: inflated?.length || 0,
          xrefValid: validateClassicXref(pdf),
        };
        if (iteration === 0) firstRecord = record;
      }

      const afterDownloads = await page.evaluate(() => ({
        ...window.__pdfCompressionQa,
        links: document.querySelectorAll('a[download$=".pdf"]').length,
        printFrames: document.querySelectorAll('iframe[title="Printable coloring page PDF"]').length,
      }));
      await page.getByRole("button", { name: "Print", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ state: "visible" });
      const dialogPrint = dialog.getByRole("button", { name: "Print", exact: true });
      await page.waitForFunction(() => !document.querySelector('[role="dialog"] button.button-primary')?.disabled);
      const printStarted = performance.now();
      await dialogPrint.click();
      await page.waitForFunction(() => document.querySelectorAll('iframe[title="Printable coloring page PDF"]').length === 1);
      const printTimingMs = round(performance.now() - printStarted);
      const afterPrint = await page.evaluate(() => ({
        qa: window.__pdfCompressionQa,
        snapshot: window.__ILCP_LAST_PRINT_DOCUMENT__,
        printFrames: document.querySelectorAll('iframe[title="Printable coloring page PDF"]').length,
      }));

      downloads.push({
        ...firstRecord,
        directTimingsMs: timingsMs,
        printTimingMs,
        lifecycleAfterDownloads: afterDownloads,
        lifecycleAfterPrint: afterPrint,
      });
      if (firstRecord.byteLength > 3 * 1024 * 1024) failures.push(`${routeRecord.route}: ${firstRecord.byteLength} bytes exceeds 3 MiB`);
      if (firstRecord.magic !== "%PDF" || firstRecord.pageCount !== 1 || firstRecord.mediaBox !== "0 0 612 792") failures.push(`${routeRecord.route}: PDF structure changed`);
      if (firstRecord.image.filter !== "/FlateDecode" || firstRecord.image.colorSpace !== "/DeviceRGB" || firstRecord.image.bitsPerComponent !== 8) failures.push(`${routeRecord.route}: compressed RGB stream missing`);
      if (firstRecord.inflatedImageBytes !== firstRecord.image.width * firstRecord.image.height * 3) failures.push(`${routeRecord.route}: invalid inflated image length`);
      if (!firstRecord.xrefValid) failures.push(`${routeRecord.route}: xref invalid`);
      if (afterDownloads.created !== 2 || afterDownloads.revoked !== 2 || afterDownloads.active !== 0 || afterDownloads.links !== 0 || afterDownloads.printFrames !== 0) failures.push(`${routeRecord.route}: direct-download cleanup failed`);
      if (afterDownloads.printCalls !== 0 || afterDownloads.opens !== 0) failures.push(`${routeRecord.route}: direct download invoked print or opened a window`);
      if (afterPrint.snapshot?.pdfByteLength !== firstRecord.byteLength || afterPrint.qa.pdfSizes.at(-1) !== firstRecord.byteLength) failures.push(`${routeRecord.route}: Print did not use the same compressed generator`);
      if (afterPrint.printFrames !== 1) failures.push(`${routeRecord.route}: hidden print iframe handoff missing`);
    } finally {
      await page.close();
      await context.close();
    }
  }

  if (browserId === "chrome") {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      await page.route("**/*.svg", (route) => route.abort("failed"));
      await page.goto(`${APP_URL}${ROUTES[0].route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.getByRole("button", { name: "Download PDF", exact: true }).click();
      await page.waitForFunction(() => {
        const status = document.querySelector('[role="status"]')?.textContent || "";
        return status.length > 0 && !status.includes("Preparing PDF");
      });
      const failureStatus = await page.getByRole("status").textContent();
      if (!/could not|failed|unable/i.test(failureStatus || "")) failures.push("failure fixture: accessible failure status missing");
    } finally {
      await context.close();
    }
  }

  return { downloads, failures };
}

async function captureBrowserBaseline() {
  await rm(BASELINE_DIR, { recursive: true, force: true });
  await mkdir(BASELINE_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const browserVersion = browser.version();
  const records = [];

  try {
    for (const routeRecord of ROUTES) {
      const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(() => {
        window.__pdfCompressionQa = { created: 0, revoked: 0, active: 0, printCalls: 0 };
        const createObjectURL = URL.createObjectURL.bind(URL);
        const revokeObjectURL = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = (blob) => {
          const url = createObjectURL(blob);
          if (blob?.type === "application/pdf") {
            window.__pdfCompressionQa.created += 1;
            window.__pdfCompressionQa.active += 1;
          }
          return url;
        };
        URL.revokeObjectURL = (url) => {
          if (String(url).startsWith("blob:")) {
            window.__pdfCompressionQa.revoked += 1;
            window.__pdfCompressionQa.active = Math.max(0, window.__pdfCompressionQa.active - 1);
          }
          return revokeObjectURL(url);
        };
        window.print = () => { window.__pdfCompressionQa.printCalls += 1; };
      });
      const page = await context.newPage();
      try {
        await page.goto(`${APP_URL}${routeRecord.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
        const pdfButton = page.getByRole("button", { name: "Download PDF", exact: true });
        await pdfButton.waitFor({ state: "visible" });
        const directTimingsMs = [];
        let firstPath = "";
        for (let iteration = 0; iteration < 2; iteration += 1) {
          const started = performance.now();
          const [download] = await Promise.all([page.waitForEvent("download"), pdfButton.click()]);
          const target = path.join(BASELINE_DIR, iteration === 0 ? routeRecord.filename : `repeat-${routeRecord.filename}`);
          await download.saveAs(target);
          await page.waitForFunction(() => document.querySelector(".printable-pdf-download")?.getAttribute("aria-busy") === "false");
          directTimingsMs.push(round(performance.now() - started));
          if (iteration === 0) firstPath = target;
        }

        await page.getByRole("button", { name: "Print", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor({ state: "visible" });
        const dialogPrint = dialog.getByRole("button", { name: "Print", exact: true });
        await dialogPrint.waitFor({ state: "visible" });
        await page.waitForFunction(() => !document.querySelector('[role="dialog"] button.button-primary')?.disabled);
        const printStarted = performance.now();
        await dialogPrint.click();
        await page.waitForFunction(() => Boolean(window.__ILCP_LAST_PRINT_DOCUMENT__?.pdfByteLength));
        const printTimingMs = round(performance.now() - printStarted);
        const qa = await page.evaluate(() => ({
          lifecycle: window.__pdfCompressionQa,
          snapshot: window.__ILCP_LAST_PRINT_DOCUMENT__,
          pdfLinks: document.querySelectorAll('a[download$=".pdf"]').length,
          printFrames: document.querySelectorAll('iframe[title="Printable coloring page PDF"]').length,
        }));
        const bytes = await readFile(firstPath);
        const parsed = parsePdfImage(bytes);
        records.push({
          ...routeRecord,
          suggestedFilename: path.basename(firstPath),
          path: relative(firstPath),
          byteLength: bytes.length,
          mimeType: "application/pdf",
          magic: bytes.subarray(0, 4).toString("ascii"),
          pageCount: countPdfPages(bytes),
          mediaBox: parseMediaBox(bytes),
          metadataTitle: parseMetadataTitle(bytes),
          image: imageSummary(parsed),
          directTimingsMs,
          printTimingMs,
          lifecycle: qa.lifecycle,
          pdfLinks: qa.pdfLinks,
          printFrames: qa.printFrames,
          compositionSnapshot: qa.snapshot,
        });
      } finally {
        await page.close();
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const summary = {
    capturedAt: new Date().toISOString(),
    appUrl: APP_URL,
    browser: `Google Chrome ${browserVersion}`,
    machine: `${process.platform} ${process.arch}`,
    records,
  };
  await writeFile(path.join(BASELINE_DIR, "baseline-results.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

async function buildBakeoff() {
  await rm(BAKEOFF_DIR, { recursive: true, force: true });
  await mkdir(BAKEOFF_DIR, { recursive: true });
  const records = [];
  let templatePdf;

  for (const routeRecord of ROUTES) {
    const baselinePath = path.join(BASELINE_DIR, routeRecord.filename);
    const baselinePdf = await readFile(baselinePath);
    templatePdf ||= baselinePdf;
    const parsed = parsePdfImage(baselinePdf);
    if (parsed.filter) throw new Error(`${routeRecord.filename} is already filtered; the baseline must be raw.`);
    const candidates = await encodeCandidates(parsed.bytes, parsed.width, parsed.height);
    const baselineName = path.basename(routeRecord.filename, ".pdf");

    for (const candidate of candidates) {
      const outputPath = path.join(BAKEOFF_DIR, `${baselineName}-${candidate.id}.pdf`);
      const output = rebuildPdfImage(baselinePdf, candidate.bytes, {
        colorSpace: candidate.colorSpace,
        filter: candidate.filter,
        width: parsed.width,
        height: parsed.height,
        bitsPerComponent: 8,
      });
      await writeFile(outputPath, output);
      records.push({
        source: routeRecord.route,
        fixture: false,
        candidate: candidate.id,
        path: relative(outputPath),
        byteLength: output.length,
        reductionPercent: reduction(baselinePdf.length, output.length),
        encodingDurationMs: candidate.durationMs,
        imageDimensions: `${parsed.width}x${parsed.height}`,
        colorSpace: candidate.colorSpace,
        bitsPerComponent: 8,
        filter: candidate.filter,
        pageCount: countPdfPages(output),
        mediaBox: parseMediaBox(output),
        metadataTitle: parseMetadataTitle(output),
        pixelComparison: candidate.pixelComparison,
      });
    }
  }

  const parsedTemplate = parsePdfImage(templatePdf);
  const syntheticRgb = buildSyntheticLineArt(parsedTemplate.width, parsedTemplate.height);
  const syntheticRawPdf = rebuildPdfImage(templatePdf, syntheticRgb, {
    colorSpace: "/DeviceRGB",
    filter: null,
    width: parsedTemplate.width,
    height: parsedTemplate.height,
    bitsPerComponent: 8,
  });
  const syntheticBaselinePath = path.join(BAKEOFF_DIR, "synthetic-line-art-raw.pdf");
  await writeFile(syntheticBaselinePath, syntheticRawPdf);
  const syntheticCandidates = await encodeCandidates(syntheticRgb, parsedTemplate.width, parsedTemplate.height);
  for (const candidate of syntheticCandidates) {
    const outputPath = path.join(BAKEOFF_DIR, `synthetic-line-art-${candidate.id}.pdf`);
    const output = rebuildPdfImage(syntheticRawPdf, candidate.bytes, {
      colorSpace: candidate.colorSpace,
      filter: candidate.filter,
      width: parsedTemplate.width,
      height: parsedTemplate.height,
      bitsPerComponent: 8,
    });
    await writeFile(outputPath, output);
    records.push({
      source: "synthetic-line-art",
      fixture: true,
      candidate: candidate.id,
      path: relative(outputPath),
      byteLength: output.length,
      reductionPercent: reduction(syntheticRawPdf.length, output.length),
      encodingDurationMs: candidate.durationMs,
      imageDimensions: `${parsedTemplate.width}x${parsedTemplate.height}`,
      colorSpace: candidate.colorSpace,
      bitsPerComponent: 8,
      filter: candidate.filter,
      pageCount: countPdfPages(output),
      mediaBox: parseMediaBox(output),
      metadataTitle: parseMetadataTitle(output),
      pixelComparison: candidate.pixelComparison,
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    methods: {
      "flate-rgb": "Lossless zlib/deflate of the existing 8-bit RGB pixels; PDF /FlateDecode.",
      "flate-gray": "Lossless zlib/deflate after converting RGB pixels to 8-bit luminance; PDF /FlateDecode.",
      "jpeg-95": "High-quality 4:4:4 JPEG at quality 95; PDF /DCTDecode.",
    },
    records,
  };
  await writeFile(path.join(BAKEOFF_DIR, "bakeoff-results.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

async function encodeCandidates(rgb, width, height) {
  const rgbStarted = performance.now();
  const flateRgb = deflateSync(rgb, { level: 9 });
  const rgbDuration = round(performance.now() - rgbStarted);

  const grayStarted = performance.now();
  const gray = rgbToGrayscale(rgb);
  const flateGray = deflateSync(gray, { level: 9 });
  const grayDuration = round(performance.now() - grayStarted);

  const jpegStarted = performance.now();
  const jpeg = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const jpegDuration = round(performance.now() - jpegStarted);
  const jpegDecoded = await sharp(jpeg).raw().toBuffer();

  return [
    {
      id: "flate-rgb",
      bytes: flateRgb,
      colorSpace: "/DeviceRGB",
      filter: "/FlateDecode",
      durationMs: rgbDuration,
      pixelComparison: compareRgb(rgb, inflateSync(flateRgb)),
    },
    {
      id: "flate-gray",
      bytes: flateGray,
      colorSpace: "/DeviceGray",
      filter: "/FlateDecode",
      durationMs: grayDuration,
      pixelComparison: compareRgbToGray(rgb, inflateSync(flateGray)),
    },
    {
      id: "jpeg-95",
      bytes: jpeg,
      colorSpace: "/DeviceRGB",
      filter: "/DCTDecode",
      durationMs: jpegDuration,
      pixelComparison: compareRgb(rgb, jpegDecoded),
    },
  ];
}

function parsePdfImage(pdf) {
  const marker = Buffer.from("4 0 obj\n", "ascii");
  const objectStart = pdf.indexOf(marker);
  if (objectStart < 0) throw new Error("PDF image object 4 was not found.");
  const streamMarker = Buffer.from("stream\n", "ascii");
  const streamMarkerStart = pdf.indexOf(streamMarker, objectStart);
  if (streamMarkerStart < 0) throw new Error("PDF image stream was not found.");
  const dictionary = pdf.subarray(objectStart + marker.length, streamMarkerStart).toString("ascii");
  const length = Number(requireMatch(dictionary, /\/Length\s+(\d+)/, "image stream length"));
  const streamStart = streamMarkerStart + streamMarker.length;
  const bytes = pdf.subarray(streamStart, streamStart + length);
  const endMarker = Buffer.from("\nendstream\nendobj\n", "ascii");
  const objectEnd = streamStart + length + endMarker.length;
  if (!pdf.subarray(streamStart + length, objectEnd).equals(endMarker)) throw new Error("PDF image stream terminator is invalid.");
  return {
    objectStart,
    objectEnd,
    bytes,
    width: Number(requireMatch(dictionary, /\/Width\s+(\d+)/, "image width")),
    height: Number(requireMatch(dictionary, /\/Height\s+(\d+)/, "image height")),
    colorSpace: requireMatch(dictionary, /\/ColorSpace\s+(\/\w+)/, "image color space"),
    bitsPerComponent: Number(requireMatch(dictionary, /\/BitsPerComponent\s+(\d+)/, "bits per component")),
    filter: dictionary.match(/\/Filter\s+(\/\w+)/)?.[1] || null,
  };
}

function rebuildPdfImage(pdf, imageBytes, options) {
  const parsed = parsePdfImage(pdf);
  const xrefMarker = Buffer.from("xref\n", "ascii");
  const xrefStart = pdf.lastIndexOf(xrefMarker);
  if (xrefStart < 0) throw new Error("PDF xref was not found.");
  const filterEntry = options.filter ? ` /Filter ${options.filter}` : "";
  const dictionary = [
    "<< /Type /XObject",
    "/Subtype /Image",
    `/Width ${options.width}`,
    `/Height ${options.height}`,
    `/ColorSpace ${options.colorSpace}`,
    `/BitsPerComponent ${options.bitsPerComponent}`,
    filterEntry,
    `/Length ${imageBytes.length}`,
    ">>\nstream\n",
  ].filter(Boolean).join(" ");
  const imageObject = Buffer.concat([
    Buffer.from(`4 0 obj\n${dictionary}`, "ascii"),
    imageBytes,
    Buffer.from("\nendstream\nendobj\n", "ascii"),
  ]);
  const body = Buffer.concat([
    pdf.subarray(0, parsed.objectStart),
    imageObject,
    pdf.subarray(parsed.objectEnd, xrefStart),
  ]);
  const offsets = [];
  for (let id = 1; id <= 7; id += 1) {
    const offset = body.indexOf(Buffer.from(`${id} 0 obj\n`, "ascii"));
    if (offset < 0) throw new Error(`PDF object ${id} was not found while rebuilding xref.`);
    offsets[id] = offset;
  }
  const xref = ["xref", "0 8", "0000000000 65535 f "];
  for (let id = 1; id <= 7; id += 1) xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `);
  xref.push("trailer", "<< /Size 8 /Root 1 0 R /Info 7 0 R >>", "startxref", String(body.length), "%%EOF");
  return Buffer.concat([body, Buffer.from(`${xref.join("\n")}\n`, "ascii")]);
}

function rgbToGrayscale(rgb) {
  const gray = Buffer.allocUnsafe(rgb.length / 3);
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 1) {
    gray[target] = Math.round(rgb[source] * 0.2126 + rgb[source + 1] * 0.7152 + rgb[source + 2] * 0.0722);
  }
  return gray;
}

function buildSyntheticLineArt(width, height) {
  const rgb = Buffer.alloc(width * height * 3, 255);
  const setPixel = (x, y, value = 0) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 3;
    rgb[offset] = value;
    rgb[offset + 1] = value;
    rgb[offset + 2] = value;
  };
  const line = (x0, y0, x1, y1, value = 0) => {
    let dx = Math.abs(x1 - x0);
    let sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0);
    let sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      setPixel(x0, y0, value);
      if (x0 === x1 && y0 === y1) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x0 += sx; }
      if (twice <= dx) { error += dx; y0 += sy; }
    }
  };

  for (let x = 80; x < width - 80; x += 9) line(x, 100, x, 760, x % 18 === 0 ? 0 : 48);
  for (let offset = 0; offset < 160; offset += 4) line(100, 900 + offset, width - 100, 1400 + offset, offset % 8 === 0 ? 0 : 96);
  for (let radius = 40; radius <= 420; radius += 18) {
    for (let degree = 0; degree < 360; degree += 1) {
      const radians = degree * Math.PI / 180;
      setPixel(Math.round(width / 2 + Math.cos(radians) * radius), Math.round(1820 + Math.sin(radians) * radius), radius % 36 === 4 ? 0 : 80);
    }
  }
  for (let y = 1500; y < 1720; y += 1) for (let x = 90; x < 360; x += 1) setPixel(x, y, 0);
  for (let y = 150; y < height - 150; y += 173) for (let x = 100; x < width - 100; x += 151) {
    setPixel(x, y, 0);
    setPixel(x + 1, y, 128);
    setPixel(x, y + 1, 192);
  }
  return rgb;
}

function compareRgb(expected, actual) {
  if (expected.length !== actual.length) return { sameLength: false, expected: expected.length, actual: actual.length };
  let changed = 0;
  let sum = 0;
  let max = 0;
  let overFive = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const delta = Math.abs(expected[index] - actual[index]);
    if (delta) changed += 1;
    if (delta > 5) overFive += 1;
    sum += delta;
    max = Math.max(max, delta);
  }
  return {
    sameLength: true,
    changedChannels: changed,
    channelsOverFive: overFive,
    meanAbsoluteError: round(sum / expected.length, 4),
    maxAbsoluteError: max,
  };
}

function compareRgbToGray(rgb, gray) {
  let nonNeutralPixels = 0;
  let changedChannels = 0;
  let sum = 0;
  let max = 0;
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 1) {
    if (rgb[source] !== rgb[source + 1] || rgb[source] !== rgb[source + 2]) nonNeutralPixels += 1;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(rgb[source + channel] - gray[target]);
      if (delta) changedChannels += 1;
      sum += delta;
      max = Math.max(max, delta);
    }
  }
  return {
    nonNeutralPixels,
    changedChannels,
    meanAbsoluteError: round(sum / rgb.length, 4),
    maxAbsoluteError: max,
  };
}

function imageSummary(parsed) {
  return {
    width: parsed.width,
    height: parsed.height,
    colorSpace: parsed.colorSpace,
    bitsPerComponent: parsed.bitsPerComponent,
    filter: parsed.filter,
    streamLength: parsed.bytes.length,
  };
}

function countPdfPages(pdf) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)\b/g) || []).length;
}

function parseMediaBox(pdf) {
  return requireMatch(pdf.toString("latin1"), /\/MediaBox\s*\[([^\]]+)\]/, "MediaBox").trim();
}

function parseMetadataTitle(pdf) {
  return requireMatch(pdf.toString("latin1"), /\/Title\s*\(([^)]*)\)/, "metadata title");
}

function validateClassicXref(pdf) {
  const source = pdf.toString("latin1");
  const match = source.match(/startxref\s+(\d+)\s+%%EOF/);
  if (!match) return false;
  const xrefOffset = Number(match[1]);
  if (pdf.subarray(xrefOffset, xrefOffset + 4).toString("ascii") !== "xref") return false;
  const entries = [...source.slice(xrefOffset).matchAll(/^(\d{10}) 00000 n $/gm)];
  if (entries.length !== 7) return false;
  return entries.every((entry, index) => {
    const objectId = index + 1;
    const objectOffset = Number(entry[1]);
    return pdf.subarray(objectOffset, objectOffset + `${objectId} 0 obj`.length).toString("ascii") === `${objectId} 0 obj`;
  });
}

function requireMatch(value, pattern, label) {
  const match = value.match(pattern);
  if (!match) throw new Error(`Missing ${label}.`);
  return match[1];
}

function reduction(before, after) {
  return round((1 - after / before) * 100, 4);
}

function relative(value) {
  return path.relative(ROOT, value).replaceAll("\\", "/");
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

function round(value, precision = 2) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}
