import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { REPRESENTATIVE_ROUTES } from "./performance-accessibility-quality.mjs";

export const HISTORICAL_AGGREGATE_JAVASCRIPT_LIMIT = 753_081;

export function analyzeClientBundles(root) {
  const outDir = path.join(root, "out");
  const chunkRoot = path.join(outDir, "_next", "static");
  const manifestRoot = path.join(root, ".next", "server", "app");
  if (!existsSync(outDir) || !existsSync(chunkRoot) || !existsSync(manifestRoot)) {
    throw new Error("Client bundle analysis requires fresh out/ and .next/ artifacts; run a production build first.");
  }

  const modulesByChunk = readClientReferenceModules(manifestRoot);
  const routes = REPRESENTATIVE_ROUTES.map((definition) => measureRoute(outDir, definition));
  const initialRouteIdsByChunk = new Map();
  for (const route of routes) {
    for (const asset of route.initialJavaScriptAssets) {
      const ids = initialRouteIdsByChunk.get(asset) || new Set();
      ids.add(route.id);
      initialRouteIdsByChunk.set(asset, ids);
    }
  }

  const allAssets = listFiles(chunkRoot)
    .filter((file) => file.endsWith(".js"))
    .map((file) => measureAsset(outDir, file))
    .sort((left, right) => right.rawBytes - left.rawBytes || left.asset.localeCompare(right.asset));
  const chunks = allAssets.map((entry) => {
    const routeIds = [...(initialRouteIdsByChunk.get(entry.asset) || [])].sort();
    const source = readFileSync(path.join(outDir, entry.asset.replace(/^\//, "")), "utf8");
    const attribution = classifyChunk(source, modulesByChunk.get(entry.asset) || []);
    return {
      ...entry,
      initialRouteIds: routeIds,
      initialRouteCount: routeIds.length,
      phase: routeIds.length > 0 ? "initial" : "deferred-or-nonroute",
      sharedAcrossRepresentativeRoutes: routeIds.length === routes.length,
      ...attribution,
    };
  });

  const aggregateRawBytes = sum(allAssets.map((asset) => asset.rawBytes));
  const aggregateGzipBytes = sum(allAssets.map((asset) => asset.gzipBytes));
  return {
    schemaVersion: 1,
    measurementClass: "fresh local production-build artifact analysis",
    representativeRouteCount: routes.length,
    routes,
    chunks,
    deferredExportChunks: chunks.filter((chunk) => chunk.exportRuntime),
    aggregate: {
      rawBytes: aggregateRawBytes,
      gzipBytes: aggregateGzipBytes,
      fileCount: allAssets.length,
      historicalRawLimitBytes: HISTORICAL_AGGREGATE_JAVASCRIPT_LIMIT,
      historicalRawLimitPassed: aggregateRawBytes <= HISTORICAL_AGGREGATE_JAVASCRIPT_LIMIT,
      overHistoricalRawLimitBytes: Math.max(0, aggregateRawBytes - HISTORICAL_AGGREGATE_JAVASCRIPT_LIMIT),
    },
  };
}

function measureRoute(outDir, definition) {
  const htmlPath = path.join(outDir, definition.output);
  if (!existsSync(htmlPath)) throw new Error(`${definition.route}: missing ${definition.output}; run a production build first.`);
  const html = readFileSync(htmlPath, "utf8");
  const initialJavaScriptAssets = unique(
    [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js(?:\?[^"]*)?)"[^>]*>/gi)]
      .map((match) => normalizeAsset(match[1]))
      .filter((asset) => asset.startsWith("/_next/static/")),
  );
  const measurements = initialJavaScriptAssets.map((asset) => measureAsset(outDir, path.join(outDir, asset.replace(/^\//, ""))));
  return {
    ...definition,
    initialJavaScriptAssets,
    initialChunkCount: measurements.length,
    initialRawBytes: sum(measurements.map((asset) => asset.rawBytes)),
    initialGzipBytes: sum(measurements.map((asset) => asset.gzipBytes)),
  };
}

function readClientReferenceModules(manifestRoot) {
  const modulesByChunk = new Map();
  for (const file of listFiles(manifestRoot).filter((entry) => entry.endsWith("client-reference-manifest.js"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/"\[project\]\/([^"<]+?)(?: <module evaluation>)?":\{[^{}]*?"chunks":\[([^\]]*)\]/g)) {
      const moduleName = match[1];
      for (const chunkMatch of match[2].matchAll(/"(\/_next\/static\/chunks\/[^"]+\.js)"/g)) {
        const asset = normalizeAsset(chunkMatch[1]);
        const modules = modulesByChunk.get(asset) || new Set();
        modules.add(moduleName);
        modulesByChunk.set(asset, modules);
      }
    }
  }
  return new Map([...modulesByChunk].map(([asset, modules]) => [asset, [...modules].sort()]));
}

function classifyChunk(source, modules) {
  const hasPdfWriter = source.includes("%PDF-1.4") && source.includes("CompressionStream");
  const hasPreviewDialog = source.includes("Preparing print preview") && source.includes("print-preview-panel");
  const hasDownloadOptions = source.includes("High-resolution artwork image") && source.includes("Download PNG");
  const hasArtworkCanvas = source.includes("The high-quality artwork could not be loaded. Please try again.") && !hasPdfWriter;
  const exportRuntime = hasPdfWriter || hasPreviewDialog || hasDownloadOptions || hasArtworkCanvas;
  let owner = modules.length ? modules.join(", ") : "framework or dynamically imported module";
  if (hasPdfWriter) owner = "src/lib/coloring/browserDownloads.ts (printable PDF/PNG/JPG runtime)";
  else if (hasArtworkCanvas) owner = "src/lib/coloring/browserCanvasRuntime.ts and browserArtworkDownloads.ts";
  else if (hasPreviewDialog) owner = "src/components/coloring/PrintablePreviewDialog.tsx";
  else if (hasDownloadOptions) owner = "src/components/coloring/DownloadMenu.tsx";
  return {
    owner,
    sourceModules: modules,
    exportRuntime,
    neededBeforeInteraction: exportRuntime ? hasDownloadOptions : null,
    safeToDefer: exportRuntime ? !hasDownloadOptions : null,
    signatures: { hasPdfWriter, hasPreviewDialog, hasDownloadOptions, hasArtworkCanvas },
  };
}

function measureAsset(outDir, absoluteOrRelativePath) {
  const absolutePath = path.isAbsolute(absoluteOrRelativePath)
    ? absoluteOrRelativePath
    : path.join(outDir, String(absoluteOrRelativePath).replace(/^\//, ""));
  if (!existsSync(absolutePath)) throw new Error(`Missing build asset ${absoluteOrRelativePath}`);
  const bytes = readFileSync(absolutePath);
  return {
    asset: `/${path.relative(outDir, absolutePath).replaceAll("\\", "/")}`,
    rawBytes: bytes.length,
    gzipBytes: gzipSync(bytes, { level: 9 }).length,
  };
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolutePath));
    else files.push(absolutePath);
  }
  return files;
}

function normalizeAsset(value) {
  return `/${String(value).split("?")[0].replace(/^\/+/, "")}`;
}

function unique(values) {
  return [...new Set(values)];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
