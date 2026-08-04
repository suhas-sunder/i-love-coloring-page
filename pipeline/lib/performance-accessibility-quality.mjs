import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const MIB = 1024 * 1024;

export const PERFORMANCE_BUDGETS = Object.freeze({
  galleryJavaScriptGzipBytes: 210 * 1024,
  printableJavaScriptGzipBytes: 200 * 1024,
  sharedCssGzipBytes: 12 * 1024,
  mobileInitialImageBytes: 300 * 1024,
  desktopInitialImageBytes: 600 * 1024,
  interactionLongTaskMs: 200,
  labTotalBlockingTimeMs: 200,
  printablePdfBytes: 3 * MIB,
  brokenPublicImages: 0,
  horizontalOverflowRoutes: 0,
});

export const REPRESENTATIVE_ROUTES = Object.freeze([
  { id: "home", route: "/", output: "index.html", family: "home" },
  { id: "gallery", route: "/coloring-pages", output: "coloring-pages.html", family: "gallery" },
  { id: "large-hub", route: "/coloring-pages/animals", output: "coloring-pages/animals.html", family: "gallery" },
  { id: "small-hub", route: "/coloring-pages/lotus", output: "coloring-pages/lotus.html", family: "gallery" },
  { id: "seasonal-hub", route: "/coloring-pages/christmas", output: "coloring-pages/christmas.html", family: "gallery" },
  { id: "paginated-hub", route: "/coloring-pages/animals/page/2", output: "coloring-pages/animals/page/2.html", family: "gallery" },
  { id: "printable", route: "/printables/animals/animals-alligator-4feec8505a", output: "printables/animals/animals-alligator-4feec8505a.html", family: "printable" },
  { id: "privacy", route: "/privacy", output: "privacy.html", family: "trust" },
  { id: "terms", route: "/terms", output: "terms.html", family: "trust" },
  { id: "about", route: "/about", output: "about.html", family: "trust" },
  { id: "sitemap", route: "/sitemap", output: "sitemap.html", family: "sitemap" },
  { id: "not-found", route: "/404", output: "404.html", family: "not-found" },
]);

export function collectPerformanceAccessibilitySnapshot(root, { label = "snapshot" } = {}) {
  const outDir = path.join(root, "out");
  if (!existsSync(outDir)) throw new Error("out/ does not exist; run a production build before measuring.");

  const routes = REPRESENTATIVE_ROUTES.map((definition) => measureRoute(root, outDir, definition));
  const sharedCssAssets = unique(routes.flatMap((route) => route.cssAssets));
  const sharedCss = measureLocalAssets(outDir, sharedCssAssets);
  const pdf = readPdfEvidence(root);
  const cssAudit = auditCssCustomProperties(root);
  const sourceAccessibility = auditAccessibilitySource(root);

  const budgetResults = [
    ...routes.filter((route) => route.family === "gallery").map((route) => budget(
      `${route.id}:gallery-js-gzip`, route.javascriptGzipBytes, PERFORMANCE_BUDGETS.galleryJavaScriptGzipBytes, "bytes",
    )),
    ...routes.filter((route) => route.family === "printable").map((route) => budget(
      `${route.id}:printable-js-gzip`, route.javascriptGzipBytes, PERFORMANCE_BUDGETS.printableJavaScriptGzipBytes, "bytes",
    )),
    budget("shared-css-gzip", sharedCss.gzipBytes, PERFORMANCE_BUDGETS.sharedCssGzipBytes, "bytes"),
    ...routes.filter((route) => route.family === "gallery").flatMap((route) => [
      budget(`${route.id}:mobile-initial-images`, route.initialImageBytes, PERFORMANCE_BUDGETS.mobileInitialImageBytes, "bytes"),
      budget(`${route.id}:desktop-initial-images`, route.initialImageBytes, PERFORMANCE_BUDGETS.desktopInitialImageBytes, "bytes"),
    ]),
    budget("representative-pdf", pdf.maxBytes, PERFORMANCE_BUDGETS.printablePdfBytes, "bytes"),
    budget("broken-public-images", routes.reduce((sum, route) => sum + route.brokenPublicImageCount, 0), PERFORMANCE_BUDGETS.brokenPublicImages, "count"),
  ];

  return {
    schemaVersion: 1,
    label,
    measuredAt: new Date().toISOString(),
    measurementClass: "local static-output artifact measurement",
    fieldData: null,
    browserLabData: null,
    browserLabReason: "Requires an available controlled browser session; static artifact checks do not claim LCP, CLS, INP, TBT, long tasks, overflow, or interaction timing.",
    budgets: PERFORMANCE_BUDGETS,
    budgetResults,
    passedMeasuredBudgets: budgetResults.every((entry) => entry.passed),
    routes,
    sharedCss,
    pdf,
    cssAudit,
    sourceAccessibility,
  };
}

export function auditCssCustomProperties(root) {
  const styleRoot = path.join(root, "src", "styles");
  const files = listFiles(styleRoot).filter((file) => file.endsWith(".css"));
  const definitions = new Set();
  const references = [];
  for (const absolutePath of files) {
    const source = readFileSync(absolutePath, "utf8");
    for (const match of source.matchAll(/(?:^|[;{]\s*)\s*(--[a-z0-9-]+)\s*:/gim)) definitions.add(match[1]);
    for (const match of source.matchAll(/var\((--[a-z0-9-]+)(?:\s*,[^)]*)?\)/gim)) {
      references.push({
        name: match[1],
        file: path.relative(root, absolutePath).replaceAll("\\", "/"),
        line: source.slice(0, match.index).split("\n").length,
        hasFallback: match[0].includes(","),
      });
    }
  }
  const runtimeProvided = new Set(["--font-figtree", "--font-fraunces"]);
  const unresolved = references.filter((reference) => !definitions.has(reference.name) && !runtimeProvided.has(reference.name) && !reference.hasFallback);
  return {
    definedCount: definitions.size,
    referenceCount: references.length,
    unresolved,
    runtimeProvided: [...runtimeProvided].sort(),
  };
}

export function auditAccessibilitySource(root) {
  const modalHook = read(root, "src/hooks/useModalDialog.ts");
  const preview = read(root, "src/components/coloring/PrintablePreviewDialog.tsx");
  const detailActions = read(root, "src/components/coloring/PrintableDetailActions.tsx");
  const search = read(root, "src/components/site/GlobalSearchDialog.tsx");
  const baseCss = read(root, "src/styles/base.css");
  const componentsCss = read(root, "src/styles/components.css");
  const allCss = `${baseCss}\n${componentsCss}`;
  return {
    focusTrapFiltersRenderedControls: /getClientRects\(\)\.length > 0/.test(modalHook) && /closest\("\[inert\]"\)/.test(modalHook),
    printablePreviewSingleStatusRegion:
      !/className="print-preview-media" aria-live=/.test(preview) &&
      /className="print-preview-status" role="status" aria-live="polite" aria-atomic="true"/.test(preview),
    printablePreviewFailureRecovery:
      /Print preview could not be prepared\. Please try again\./.test(preview) &&
      /The printable PDF could not be prepared\. Please try again\./.test(preview),
    directPdfStatusRegion: /role="status" aria-live="polite" aria-atomic="true"/.test(detailActions),
    searchStatusRegion: /aria-live="polite" role="status"/.test(search),
    reducedMotion: /@media \(prefers-reduced-motion: reduce\)/.test(allCss),
    noGlobalOverflowMask: !/(?:html|body|:root)[^{]*\{[^}]*overflow-x\s*:\s*(?:hidden|clip)/is.test(allCss),
    focusVisibleUsesApprovedTokens: /outline:\s*var\(--focus-ring-width\) solid var\(--color-focus\)/.test(allCss),
  };
}

function measureRoute(root, outDir, definition) {
  const absoluteHtml = path.join(outDir, definition.output);
  if (!existsSync(absoluteHtml)) throw new Error(`${definition.route}: missing ${definition.output}`);
  const htmlBuffer = readFileSync(absoluteHtml);
  const html = htmlBuffer.toString("utf8");
  const scriptAssets = unique(extractAssetUrls(html, "script", "src").filter(isFirstPartyJs));
  const cssAssets = unique(extractAssetUrls(html, "link", "href").filter((url) => /^\/_next\/static\/.+\.css(?:\?|$)/.test(url)));
  const fontAssets = unique(extractAssetUrls(html, "link", "href").filter((url) => /^\/_next\/static\/.+\.woff2(?:\?|$)/.test(url)));
  const scripts = measureLocalAssets(outDir, scriptAssets);
  const css = measureLocalAssets(outDir, cssAssets);
  const fonts = measureLocalAssets(outDir, fontAssets, { gzip: false });
  const imageTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const eagerImages = imageTags.filter((tag) => /\bloading="eager"/.test(tag) || /\bdata-priority="true"/.test(tag));
  const initialImageMeasurements = eagerImages.map((tag) => measurePublicImage(root, attribute(tag, "src"))).filter(Boolean);
  const allImageMeasurements = imageTags.map((tag) => measurePublicImage(root, attribute(tag, "src"))).filter(Boolean);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map((match) => Number(match[1]));
  const imageElements = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const htmlGzipBytes = gzipSync(htmlBuffer, { level: 9 }).length;

  return {
    ...definition,
    htmlBytes: htmlBuffer.length,
    htmlGzipBytes,
    javascriptAssets: scriptAssets,
    javascriptBytes: scripts.rawBytes,
    javascriptGzipBytes: scripts.gzipBytes,
    cssAssets,
    cssBytes: css.rawBytes,
    cssGzipBytes: css.gzipBytes,
    fontAssets,
    fontRequestCount: fontAssets.length,
    fontBytes: fonts.rawBytes,
    initialImageRequestCount: initialImageMeasurements.length,
    initialImageBytes: sum(initialImageMeasurements.map((entry) => entry.bytes)),
    initialImages: initialImageMeasurements,
    totalImageElementCount: imageElements.length,
    brokenPublicImageCount: allImageMeasurements.filter((entry) => !entry.exists).length,
    firstPartyRequestCount: 1 + scriptAssets.length + cssAssets.length + fontAssets.length + initialImageMeasurements.length,
    estimatedFirstPartyTransferBytes:
      htmlGzipBytes + scripts.gzipBytes + css.gzipBytes + fonts.rawBytes + sum(initialImageMeasurements.map((entry) => entry.bytes)),
    semantics: {
      h1Count: headings.filter((level) => level === 1).length,
      headingLevels: headings,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      missingImageAltCount: imageElements.filter((tag) => !/\salt="[^"]*"/.test(tag)).length,
      nestedInteractiveControls: /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button\b/i.test(html),
      mainCount: (html.match(/<main\b/gi) || []).length,
    },
  };
}

function readPdfEvidence(root) {
  const evidencePath = path.join(root, "pipeline/review/pdf-compression/final/browser-verification-results.json");
  if (!existsSync(evidencePath)) return { source: null, maxBytes: null, samples: [] };
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const preferred = evidence.browsers?.find((browser) => browser.id === "chrome") || evidence.browsers?.find((browser) => browser.available);
  const samples = (preferred?.downloads || []).map((download) => ({ route: download.route, bytes: download.byteLength }));
  return {
    source: path.relative(root, evidencePath).replaceAll("\\", "/"),
    browser: preferred ? { id: preferred.id, version: preferred.version, engineCoverage: preferred.engineCoverage } : null,
    maxBytes: samples.length > 0 ? Math.max(...samples.map((sample) => sample.bytes)) : null,
    samples,
  };
}

function measureLocalAssets(outDir, urls, { gzip = true } = {}) {
  const assets = urls.map((url) => {
    const absolutePath = path.join(outDir, url.split("?")[0].replace(/^\//, ""));
    if (!existsSync(absolutePath)) throw new Error(`Missing build asset ${url}`);
    const bytes = readFileSync(absolutePath);
    return { url, bytes: bytes.length, gzipBytes: gzip ? gzipSync(bytes, { level: 9 }).length : bytes.length };
  });
  return { assets, rawBytes: sum(assets.map((asset) => asset.bytes)), gzipBytes: sum(assets.map((asset) => asset.gzipBytes)) };
}

function measurePublicImage(root, url) {
  if (!url || !/^https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages\//.test(url)) return null;
  const pathname = new URL(url).pathname.replace(/^\//, "");
  const preferred = path.join(root, "pipeline", "r2-upload-optimized", ...pathname.split("/"));
  const fallback = path.join(root, "pipeline", "r2-upload-clean", ...pathname.split("/"));
  const absolutePath = existsSync(preferred) ? preferred : fallback;
  return {
    url,
    localPath: path.relative(root, absolutePath).replaceAll("\\", "/"),
    exists: existsSync(absolutePath),
    bytes: existsSync(absolutePath) ? statSync(absolutePath).size : 0,
  };
}

function extractAssetUrls(html, tagName, attributeName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))]
    .map((match) => attribute(match[0], attributeName))
    .filter(Boolean);
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]+)"`, "i"))?.[1] || null;
}

function isFirstPartyJs(url) {
  return /^\/_next\/static\/.+\.js(?:\?|$)/.test(url);
}

function budget(id, measured, limit, unit) {
  return { id, measured, limit, unit, passed: Number.isFinite(measured) && measured <= limit };
}

function read(root, relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function listFiles(directory) {
  const results = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...listFiles(absolutePath));
    else results.push(absolutePath);
  }
  return results;
}

function unique(values) {
  return [...new Set(values)];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
