import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "typescript";

import { analyzeClientBundles, HISTORICAL_AGGREGATE_JAVASCRIPT_LIMIT } from "../lib/client-bundle-analysis.mjs";
import { PERFORMANCE_BUDGETS } from "../lib/performance-accessibility-quality.mjs";

const ROOT = process.cwd();

test("client bundle analysis counts shared, route, deferred, raw, and deterministic gzip bytes", () => {
  const first = analyzeClientBundles(ROOT);
  const second = analyzeClientBundles(ROOT);
  assert.deepEqual(first, second);
  assert.equal(first.routes.length > 0, true);
  assert.equal(first.chunks.some((chunk) => chunk.sharedAcrossRepresentativeRoutes), true);
  assert.equal(first.chunks.some((chunk) => chunk.initialRouteCount > 0 && !chunk.sharedAcrossRepresentativeRoutes), true);
  assert.equal(first.chunks.some((chunk) => chunk.phase === "deferred-or-nonroute"), true);
  assert.equal(first.aggregate.rawBytes, first.chunks.reduce((sum, chunk) => sum + chunk.rawBytes, 0));
  assert.equal(first.aggregate.gzipBytes, first.chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0));
  assert.equal(first.aggregate.historicalRawLimitBytes, HISTORICAL_AGGREGATE_JAVASCRIPT_LIMIT);
  for (const route of first.routes) {
    assert.equal(route.initialChunkCount, route.initialJavaScriptAssets.length);
    assert.ok(route.initialRawBytes > 0);
    assert.ok(route.initialGzipBytes > 0);
  }
});

test("missing production artifacts produce a clear build prerequisite error", async () => {
  const emptyRoot = await mkdtemp(path.join(os.tmpdir(), "ilcp-client-bundle-empty-"));
  try {
    assert.throws(() => analyzeClientBundles(emptyRoot), /run a production build first/i);
  } finally {
    await rm(emptyRoot, { recursive: true, force: true });
  }
});

test("route budgets are retained and heavy printable work stays outside initial HTML chunks", () => {
  const analysis = analyzeClientBundles(ROOT);
  assert.equal(PERFORMANCE_BUDGETS.galleryJavaScriptGzipBytes, 210 * 1024);
  assert.equal(PERFORMANCE_BUDGETS.printableJavaScriptGzipBytes, 200 * 1024);
  const printable = analysis.routes.find((route) => route.id === "printable");
  assert.ok(printable.initialGzipBytes <= PERFORMANCE_BUDGETS.printableJavaScriptGzipBytes);
  const initialPrintableAssets = new Set(printable.initialJavaScriptAssets);
  for (const chunk of analysis.deferredExportChunks.filter((entry) => entry.signatures.hasPdfWriter || entry.signatures.hasArtworkCanvas || entry.signatures.hasPreviewDialog)) {
    assert.equal(initialPrintableAssets.has(chunk.asset), false, chunk.asset);
  }
});

test("printable loaders cache concurrent imports and retry after an import failure", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ilcp-client-loader-"));
  try {
    const source = await readFile(path.join(ROOT, "src/lib/coloring/browserExportLoader.ts"), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
    }).outputText;
    const outputPath = path.join(tempRoot, "browserExportLoader.mjs");
    await writeFile(outputPath, output, "utf8");
    const loaderModule = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
    let calls = 0;
    const cached = loaderModule.createCachedModuleLoader(async () => {
      calls += 1;
      return { id: calls };
    });
    const [first, second] = await Promise.all([cached(), cached()]);
    assert.equal(calls, 1);
    assert.equal(first, second);
    assert.equal(await cached(), first);

    let failures = 0;
    const retrying = loaderModule.createCachedModuleLoader(async () => {
      failures += 1;
      if (failures === 1) throw new Error("controlled import failure");
      return "loaded";
    });
    await assert.rejects(retrying(), /controlled import failure/);
    assert.equal(await retrying(), "loaded");
    assert.equal(failures, 2);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("visible controls stay lightweight while PDF, PNG, JPG, WebP, and preview code defer by interaction", async () => {
  const [detailActions, cardActions, menu, dialog, loader, artwork, canvas, printableRuntime, shell, detailPage] = await Promise.all([
    source("src/components/coloring/PrintableDetailActions.tsx"),
    source("src/components/coloring/PrintableCardActions.tsx"),
    source("src/components/coloring/DownloadMenu.tsx"),
    source("src/components/coloring/PrintablePreviewDialog.tsx"),
    source("src/lib/coloring/browserExportLoader.ts"),
    source("src/lib/coloring/browserArtworkDownloads.ts"),
    source("src/lib/coloring/browserCanvasRuntime.ts"),
    source("src/lib/coloring/browserDownloads.ts"),
    source("src/components/site/PublicPageShell.tsx"),
    source("src/components/coloring/PrintableDetailPage.tsx"),
  ]);
  assert.match(loader, /createCachedModuleLoader/);
  assert.match(loader, /import\("\.\/browserDownloads"\)/);
  assert.match(loader, /import\("\.\/browserArtworkDownloads"\)/);
  assert.match(detailActions, /await loadPrintableExportRuntime\(\)/);
  assert.match(cardActions, /lazy\(\(\) => import\("\.\/PrintablePreviewDialog"\)/);
  assert.match(cardActions, /\{open \? \(/);
  assert.match(dialog, /loadPrintableExportRuntime\(\)/);
  assert.match(menu, /option\.format === "webp"[\s\S]*loadArtworkDownloadRuntime/);
  assert.match(menu, /option\.format === "jpg"[\s\S]*loadPrintableExportRuntime/);
  assert.doesNotMatch(menu, /from "@\/lib\/coloring\/exportComposition"/);
  assert.doesNotMatch(menu, /useEffect\([\s\S]{0,200}(?:downloadPng|downloadJpeg|downloadWebp)/);
  assert.doesNotMatch(artwork, /exportComposition|computePrintableLayout|CompressionStream|%PDF/);
  assert.doesNotMatch(canvas, /exportComposition|computePrintableLayout|CompressionStream|%PDF/);
  assert.match(printableRuntime, /CompressionStream/);
  assert.match(shell, /data-runtime-optimization-version="client-split-v1"/);
  assert.match(detailPage, /<h1/);
});

async function source(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
