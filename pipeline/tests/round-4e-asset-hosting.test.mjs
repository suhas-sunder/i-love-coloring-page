import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

import ts from "typescript";

import {
  ROUND4E_MANIFEST_FILES,
  ROUND4E_REPORT_FILES,
  runRound4EAssetHostingBuild,
} from "../scripts/round-4e-build-asset-publish-manifest.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const EXPECTED_RUN_ID = "round-4e-production-asset-hosting-contract";
const EXPECTED_MEDIA_COUNTS = {
  svg: 6557,
  pngPreview: 6557,
  thumbnail: 6557,
};

test("Round 4E JSON manifests parse and lock the asset URL contract", async () => {
  for (const manifestPath of ROUND4E_MANIFEST_FILES) {
    const manifest = await readJson(manifestPath);
    assert.equal(manifest.runId, EXPECTED_RUN_ID, manifestPath);
  }

  const contract = await readJson("pipeline/manifests/round-4e-asset-url-contract.json");
  const decision = await readJson("pipeline/manifests/round-4e-asset-hosting-decision.json");
  const cachePolicy = await readJson("pipeline/manifests/round-4e-cache-and-content-type-policy.json");

  assert.equal(contract.environment.productionBaseUrlVariable, "NEXT_PUBLIC_COLORING_ASSET_BASE_URL");
  assert.equal(contract.environment.localProxyPublicToggle, "NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY");
  assert.equal(contract.environment.localProxyServerToggle, "COLORING_ENABLE_LOCAL_ASSET_PROXY");
  assert.equal(contract.localProxy.disabledByDefault, true);
  assert.equal(contract.clientDataPolicy.localFilesystemPathsAllowed, false);
  assert.equal(decision.recommendedStrategy, "object-storage-cdn");
  assert.equal(decision.rejectedStrategies.nextApiRouteProduction.recommended, false);
  assert.equal(cachePolicy.contentTypes.svg, "image/svg+xml");
  assert.equal(cachePolicy.contentTypes.pngPreview, "image/png");
  assert.equal(cachePolicy.contentTypes.thumbnail, "image/png");
});

test("publish manifest references only successful Round 3C assets and excludes quarantine", async () => {
  const publish = await readJson("pipeline/manifests/round-4e-asset-publish-manifest.json");
  const production = await readJson("pipeline/manifests/round-3c-production-assets.json");
  const quarantine = await readJson("pipeline/manifests/round-3c-production-quarantine.json");
  const successfulAssetIds = new Set(production.assets.map((asset) => asset.assetId));
  const quarantinedAssetIds = new Set(quarantine.entries.map((entry) => entry.assetId));

  assert.equal(publish.summary.sourceProductionAssetCount, successfulAssetIds.size);
  assert.equal(publish.summary.totalFiles, successfulAssetIds.size * 3);
  assert.equal(publish.summary.totalSvgFiles, EXPECTED_MEDIA_COUNTS.svg);
  assert.equal(publish.summary.totalPngPreviewFiles, EXPECTED_MEDIA_COUNTS.pngPreview);
  assert.equal(publish.summary.totalThumbnailFiles, EXPECTED_MEDIA_COUNTS.thumbnail);
  assert.equal(publish.summary.missingFiles, 0);
  assert.equal(publish.summary.invalidPaths, 0);

  for (const file of publish.files) {
    assert.equal(successfulAssetIds.has(file.assetId), true, file.assetId);
    assert.equal(quarantinedAssetIds.has(file.assetId), false, file.assetId);
    assert.equal(file.status, "ready");
    assert.match(file.expectedPublicUrlTemplate, /^\$\{NEXT_PUBLIC_COLORING_ASSET_BASE_URL\}\//);
  }
});

test("publish manifest files exist locally and use CDN-safe relative paths", async () => {
  const publish = await readJson("pipeline/manifests/round-4e-asset-publish-manifest.json");
  const seenTargets = new Set();

  for (const file of publish.files) {
    assert.match(file.localRelativePath, /^pipeline\/production\/full\/assets\/(?:svg|png|thumbs)\//, file.localRelativePath);
    assert.match(file.cdnRelativePath, /^(?:svg|png|thumbs)\//, file.cdnRelativePath);
    assert.doesNotMatch(file.cdnRelativePath, /(?:^|\/)\.\.?(?:\/|$)|\\|:|^\/|\/\//, file.cdnRelativePath);
    assert.doesNotMatch(file.expectedPublicUrlTemplate, /D:\\|C:\\|pipeline\/production\/full|images\/|ilovesvg\//i);
    assert.equal(seenTargets.has(file.cdnRelativePath), false, file.cdnRelativePath);
    seenTargets.add(file.cdnRelativePath);

    const fileStat = await stat(path.join(REPO_ROOT, ...file.localRelativePath.split("/")));
    assert.equal(fileStat.size, file.fileSize, file.localRelativePath);
    assert.equal(createHash("sha256").update(await readFile(path.join(REPO_ROOT, ...file.localRelativePath.split("/")))).digest("hex"), file.sha256);
  }
});

test("generated client-facing data contains no local filesystem paths", async () => {
  for (const generatedPath of [
    "src/generated/coloring/items.json",
    "src/generated/coloring/hubs.json",
    "src/generated/coloring/hub-items.json",
    "src/generated/coloring/routes.json",
  ]) {
    const text = await readText(generatedPath);
    assert.doesNotMatch(text, /[A-Za-z]:[\\/]|pipeline\/production\/full|images\/|ilovesvg\/|sourceRelativePath/i, generatedPath);
  }
});

test("asset resolver normalizes base URLs, rejects unsafe paths, and keeps proxy disabled by default", async () => {
  const withCdn = await loadAssetResolver({
    NEXT_PUBLIC_COLORING_ASSET_BASE_URL: "https://cdn.example.com/coloring///",
    NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY: "0",
  });
  assert.equal(
    withCdn.resolveColoringAssetUrl("svg/animals/animals-alligator-4feec8505a.svg"),
    "https://cdn.example.com/coloring/svg/animals/animals-alligator-4feec8505a.svg",
  );
  assert.equal(withCdn.resolveColoringAssetUrl("svg/animals/file name.svg"), "https://cdn.example.com/coloring/svg/animals/file%20name.svg");
  assert.equal(withCdn.normalizeAssetSubpath("../animals/file.svg"), null);
  assert.equal(withCdn.normalizeAssetSubpath("svg/../animals/file.svg"), null);
  assert.equal(withCdn.normalizeAssetSubpath("svg\\animals\\file.svg"), null);
  assert.equal(withCdn.normalizeAssetSubpath("C:/assets/file.svg"), null);

  const defaultResolver = await loadAssetResolver({});
  assert.equal(defaultResolver.hasConfiguredColoringAssetSource(), false);
  assert.equal(defaultResolver.resolveColoringAssetUrl("svg/animals/file.svg"), null);

  const withoutCdn = await loadAssetResolver({ NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY: "1" });
  assert.equal(withoutCdn.hasConfiguredColoringAssetSource(), false);
  assert.equal(withoutCdn.resolveColoringAssetUrl("thumbs/animals/file thumb.png"), null);
});

test("Round 4F removes the App Router local proxy from the production app", async () => {
  const assetsSource = await readText("src/lib/coloring/assets.ts");
  const decision = await readJson("pipeline/manifests/round-4f-deployment-mode-decision.json");

  await assert.rejects(readText("app/api/coloring-assets/[...path]/route.ts"), /ENOENT/);
  assert.equal(decision.assetProxyDecision.appApiProxyRemoved, true);
  assert.equal(decision.assetProxyDecision.productionApiMediaDependency, false);
  assert.doesNotMatch(assetsSource, /NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY|\/api\/coloring-assets/);
  assert.match(assetsSource, /image\/svg\+xml/);
  assert.match(assetsSource, /image\/png/);
});

test("download and print actions receive URLs from the centralized resolver", async () => {
  const galleryGrid = await readText("src/components/coloring/GalleryGrid.tsx");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const assetImage = await readText("src/components/coloring/AssetImage.tsx");

  assert.match(galleryGrid, /resolveColoringItemAssetUrls/);
  assert.doesNotMatch(imageCard, /resolveColoringAssetUrl|NEXT_PUBLIC_COLORING|\/api\/coloring-assets/);
  assert.match(imageCard, /assetUrls\.png/);
  assert.doesNotMatch(imageCard, /Download SVG|assetUrls\.svg|pngUrl\s*\|\|\s*svgUrl/);
  assert.match(imageCard, /Download PNG/);
  assert.match(imageCard, /Print/);
  assert.doesNotMatch(assetImage, /D:\\|C:\\|pipeline\/production\/full|images\//i);
});

test("routes, sitemap count, Phase 1 scope, and no per-image-page behavior are preserved", async () => {
  const hubs = await readJson("src/generated/coloring/hubs.json");
  const routes = await readJson("src/generated/coloring/routes.json");
  const siteMap = await readJson("src/generated/coloring/site-map.json");

  assert.equal(hubs.summary.phase1Only, true);
  assert.equal(routes.phase2RoutesExcluded, true);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(routes.routes.length, 65);
  assert.equal(siteMap.entries.length, 65);
  assert.equal(routes.routes.some((route) => /\/image\/|\[assetId\]|\[image/.test(route.path)), false);

  const appFiles = await listFiles(path.join(REPO_ROOT, "app"), [".ts", ".tsx"]);
  const relativeAppFiles = appFiles.map((file) => normalizePath(path.relative(REPO_ROOT, file)));
  assert.equal(relativeAppFiles.some((file) => /\/\[assetId\]\/|\/\[image/.test(file)), false);
  assert.equal(relativeAppFiles.some((file) => /\/image\//.test(file)), false);

  for (const hub of hubs.hubs.filter((hub) => hub.assetCount > 500)) {
    assert.ok(hub.galleryPageSize <= 60, hub.slug);
    assert.ok(hub.previewAssetIds.length <= hub.galleryPageSize, hub.slug);
  }
});

test("production assets are not copied into public and source repositories remain untouched", async () => {
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  assert.equal(publicFiles.some((file) => /pipeline[\\/]+production/i.test(file)), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);

  const inventory = await readJson("pipeline/manifests/image-inventory.json");
  for (const entry of inventory.entries) {
    const sourceStat = await stat(path.join(REPO_ROOT, ...entry.sourceRelativePath.split("/")));
    assert.equal(Number(sourceStat.size), Number(entry.fileSizeBytes), entry.sourceRelativePath);
  }

  assert.equal((await gitStatusFor("images")).trim(), "");
  assert.equal((await gitStatusFor("ilovesvg")).trim(), "");
});

test("Round 4E build script is deterministic and does not contain upload commands or credentials", async () => {
  const scriptSource = await readText("pipeline/scripts/round-4e-build-asset-publish-manifest.mjs");
  assert.doesNotMatch(scriptSource, /aws\s+s3|gsutil|rclone|azcopy|wrangler\s+r2|curl\s+-T/i);
  assert.doesNotMatch(scriptSource, /secret|access_key|private_key|token\s*=/i);

  await runRound4EAssetHostingBuild({ repoRoot: REPO_ROOT });
  const first = await hashRound4EOutputs();
  await runRound4EAssetHostingBuild({ repoRoot: REPO_ROOT });
  const second = await hashRound4EOutputs();
  assert.deepEqual(second, first);
});

async function loadAssetResolver(env) {
  const source = await readText("src/lib/coloring/assets.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    process: { env },
    URL,
    encodeURIComponent,
  };
  vm.runInNewContext(compiled, context, { filename: "assets.ts" });
  return module.exports;
}

async function hashRound4EOutputs() {
  const hashes = {};
  for (const relativePath of [...ROUND4E_MANIFEST_FILES, ...ROUND4E_REPORT_FILES]) {
    hashes[relativePath] = createHash("sha256")
      .update(await readFile(path.join(REPO_ROOT, relativePath), "utf8"))
      .digest("hex");
  }
  return hashes;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFiles(root, extensions) {
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if ([".git", ".next", "node_modules", "images", "ilovesvg"].includes(entry.name)) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (extensions.includes(path.extname(entry.name))) {
        results.push(entryPath);
      }
    }
  }
  await walk(root);
  return results;
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }
  return (await listFiles(root, [".png", ".svg", ".jpg", ".jpeg", ".webp", ".json"])).map((file) => path.relative(root, file));
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}
