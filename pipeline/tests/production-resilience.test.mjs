import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "typescript";

const ROOT = process.cwd();
const read = (relativePath) => readFile(path.join(ROOT, relativePath), "utf8");

test("operation controller admits one active action and invalidates stale completions", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ilcp-resilience-controller-"));
  try {
    const source = await read("src/lib/coloring/asyncOperationController.ts");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
    }).outputText;
    const modulePath = path.join(tempRoot, "asyncOperationController.mjs");
    await writeFile(modulePath, output, "utf8");
    const { createAsyncOperationController } = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
    const controller = createAsyncOperationController();
    const first = controller.start();
    assert.ok(first);
    assert.deepEqual(Array.from({ length: 5 }, () => controller.start()), Array(5).fill(null));
    assert.equal(controller.isCurrent(first.id), true);
    controller.cancel();
    assert.equal(first.signal.aborted, true);
    assert.equal(controller.isCurrent(first.id), false);
    assert.equal(controller.finish(first.id), false);
    const second = controller.start();
    assert.ok(second.id > first.id);
    assert.equal(controller.finish(second.id), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("printable actions lock rapid activations and ignore route-stale completions", async () => {
  const [detail, menu, dialog] = await Promise.all([
    read("src/components/coloring/PrintableDetailActions.tsx"),
    read("src/components/coloring/DownloadMenu.tsx"),
    read("src/components/coloring/PrintablePreviewDialog.tsx"),
  ]);
  for (const source of [detail, menu, dialog]) {
    assert.match(source, /createAsyncOperationController/);
    assert.match(source, /\.start\(\)/);
    assert.match(source, /\.isCurrent\(/);
    assert.match(source, /\.finish\(/);
    assert.match(source, /\.cancel\(\)/);
    assert.match(source, /signal:/);
  }
  assert.match(detail, /\[item\.canonicalPath\]/);
  assert.match(detail, /setPreparingPdf\(false\)/);
  assert.match(menu, /\[downloadBaseName, title\]/);
  assert.match(menu, /setBusyFormat\(null\)/);
  assert.match(dialog, /previewController\.abort\(\)/);
});

test("dynamic export failures clear pending state and report the requested operation", async () => {
  const [loader, detail, menu, dialog] = await Promise.all([
    read("src/lib/coloring/browserExportLoader.ts"),
    read("src/components/coloring/PrintableDetailActions.tsx"),
    read("src/components/coloring/DownloadMenu.tsx"),
    read("src/components/coloring/PrintablePreviewDialog.tsx"),
  ]);
  assert.match(loader, /pending = null/);
  assert.match(loader, /\.catch\(\(error\)/);
  assert.match(detail, /The PDF download could not be prepared/);
  assert.match(menu, /The \$\{option\.label\} download could not be prepared/);
  assert.match(dialog, /Print preview could not be prepared/);
  assert.doesNotMatch(`${detail}\n${menu}\n${dialog}`, /catch\(\(\) => \{\s*\}\)|catch\s*\{\s*\}/);
});

test("download and print helpers fail closed and clean every temporary browser resource", async () => {
  const [canvas, downloads, artwork] = await Promise.all([
    read("src/lib/coloring/browserCanvasRuntime.ts"),
    read("src/lib/coloring/browserDownloads.ts"),
    read("src/lib/coloring/browserArtworkDownloads.ts"),
  ]);
  assert.match(canvas, /export function downloadBlob[\s\S]*try \{[\s\S]*catch \{[\s\S]*finally \{/);
  assert.match(canvas, /link\?\.remove\(\)/);
  assert.match(canvas, /URL\.revokeObjectURL/);
  assert.match(downloads, /function triggerUrlDownload[\s\S]*finally \{[\s\S]*link\?\.remove\(\)/);
  assert.match(downloads, /frame\.onerror = \(\) => settle\(false\)/);
  assert.match(downloads, /PRINT_HANDOFF_TIMEOUT_MS = 10_000/);
  assert.match(downloads, /signal\?\.removeEventListener\("abort", abort\)/);
  assert.match(downloads, /frame\.remove\(\)/);
  assert.match(downloads, /URL\.revokeObjectURL\(prepared\.pdfUrl\)/);
  assert.match(artwork, /if \(!downloadBlob/);
  assert.doesNotMatch(downloads, /window\.location\.reload|setInterval\(/);
});

test("canvas, object URL, and image-load failures return typed results", async () => {
  const [canvas, downloads] = await Promise.all([
    read("src/lib/coloring/browserCanvasRuntime.ts"),
    read("src/lib/coloring/browserDownloads.ts"),
  ]);
  assert.match(canvas, /canvas-export-failed/);
  assert.match(canvas, /signal\?\.addEventListener\("abort", abort, \{ once: true \}\)/);
  assert.match(downloads, /operation-cancelled/);
  assert.match(downloads, /The PNG was created, but this browser could not start the download/);
  assert.match(downloads, /The JPG was created, but this browser could not start the download/);
  assert.match(downloads, /print preview could not create a temporary browser URL/i);
  assert.match(downloads, /if \(pdfUrl\) URL\.revokeObjectURL\(pdfUrl\)/);
});

test("broken artwork preserves local context instead of removing canonical cards", async () => {
  const [image, card, printable] = await Promise.all([
    read("src/components/coloring/AssetImage.tsx"),
    read("src/components/coloring/ImageCard.tsx"),
    read("src/components/coloring/PrintableDetailPage.tsx"),
  ]);
  assert.match(image, /data-state=\{loaded \? "loaded" : "loading"\}/);
  assert.match(image, /onError=\{handleImageError\}/);
  assert.match(image, /Preview unavailable/);
  assert.match(image, /role="img" aria-label=\{`\$\{title\} preview unavailable`\}/);
  assert.match(card, /href=\{itemHref\}/);
  assert.match(card, /<AssetImage/);
  assert.match(printable, /<AssetImage/);
});

test("search, navigation, and advertising lifecycles retain bounded cleanup", async () => {
  const [search, navigationData, header, mobile, ads] = await Promise.all([
    read("src/components/coloring/GallerySearch.tsx"),
    read("src/lib/search/navigationSearchData.ts"),
    read("src/components/site/SiteHeader.tsx"),
    read("src/components/site/MobileNav.tsx"),
    read("src/components/ads/AdSenseRuntime.tsx"),
  ]);
  assert.match(search, /AbortController/);
  assert.match(search, /requestRef\.current\?\.abort\(\)/);
  assert.match(navigationData, /AbortController/);
  assert.match(header, /removeEventListener\("pointerdown"/);
  assert.match(header, /removeEventListener\("keydown"/);
  assert.match(mobile, /\[pathname\]/);
  assert.match(ads, /intersectionObserver\.disconnect\(\)/);
  assert.match(ads, /resizeObserver\.disconnect\(\)/);
  assert.match(ads, /cancelAnimationFrame/);
  assert.match(ads, /removeEventListener\("orientationchange"/);
  assert.match(ads, /clearTimeout\(/);
});

test("static discovery and 404 recovery stay progressive and ad-free", async () => {
  const [home, gallery, pagination, printable, notFound, config] = await Promise.all([
    read("app/page.tsx"),
    read("app/coloring-pages/page.tsx"),
    read("src/components/coloring/Pagination.tsx"),
    read("src/components/coloring/PrintableDetailPage.tsx"),
    read("app/not-found.tsx"),
    read("src/lib/ads/config.ts"),
  ]);
  assert.match(home, /PublicPageShell/);
  assert.match(gallery, /PublicPageShell/);
  assert.match(pagination, /href=/);
  assert.match(printable, /canonicalPath/);
  assert.match(notFound, /href="\/coloring-pages"/);
  assert.match(config, /"not-found"/);
  assert.match(config, /mode: "none"/);
});

test("resilience marker is scoped to primary full layouts without visible styling", async () => {
  const shell = await read("src/components/site/PublicPageShell.tsx");
  assert.match(shell, /data-resilience-version=\{layout\.mode === "full" \? "failure-hardening-v1" : undefined\}/);
  assert.doesNotMatch(shell, /style=\{\{|<style|failure-hardening-v1<\/|>failure-hardening-v1</);
});

test("failure hardening adds no prohibited runtime architecture", async () => {
  const sources = await Promise.all([
    read("src/lib/coloring/asyncOperationController.ts"),
    read("src/lib/coloring/browserCanvasRuntime.ts"),
    read("src/lib/coloring/browserDownloads.ts"),
    read("src/components/coloring/PrintableDetailActions.tsx"),
    read("src/components/coloring/DownloadMenu.tsx"),
  ]);
  const joined = sources.join("\n");
  assert.doesNotMatch(joined, /serviceWorker|indexedDB|window\.location\.reload|process\.env|NEXT_PUBLIC_|Sentry|fetch\([^)]*api\//i);
  assert.doesNotMatch(joined, /setInterval\(|continue-on-error|\|\| true/);
});
