import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND4O_MANIFEST_FILES,
  ROUND4O_REPORT_FILES,
  ROUND4O_RUN_ID,
  runRound4OBrowserDownloads,
} from "../scripts/round-4o-build-browser-downloads.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ALLOWED_PRODUCTION_BRANCHES = new Set(["version-4", "version-1", "ver-5-deployed-may-13-2026", "ver-6-seo"]);

test("Round 4O generated artifacts parse and confirm the requested project context", async () => {
  const result = await runRound4OBrowserDownloads({ repoRoot: REPO_ROOT });
  assert.equal(result.runId, ROUND4O_RUN_ID);

  for (const relativePath of ROUND4O_MANIFEST_FILES) {
    const raw = await readText(relativePath);
    const parsed = JSON.parse(raw);
    assert.ok(parsed, relativePath);
    assert.doesNotMatch(raw, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  for (const reportPath of ROUND4O_REPORT_FILES) {
    const text = await readText(reportPath);
    assert.match(text, /Round 4O/i, reportPath);
    assert.doesNotMatch(text, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, reportPath);
  }

  for (const manifestPath of await listRound4OFiles("pipeline/manifests", ".json")) {
    const raw = await readText(manifestPath);
    JSON.parse(raw);
    assert.doesNotMatch(raw, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, manifestPath);
  }

  for (const reportPath of await listRound4OFiles("pipeline/reports", ".md")) {
    const text = await readText(reportPath);
    assert.match(text, /Round 4O/i, reportPath);
    assert.doesNotMatch(text, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, reportPath);
  }

  const context = await readJson("pipeline/manifests/round-4o-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.ok(ALLOWED_PRODUCTION_BRANCHES.has(context.summary.branch), `unexpected branch ${context.summary.branch}`);
  assert.equal(context.summary.round4nCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
});

test("browser download utility is static, keeps SVG internal, and never exposes SVG as a user format", async () => {
  const utility = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const audit = await readJson("pipeline/manifests/round-4o-download-implementation-audit.json");

  assert.match(utility, /pngPreviewUrl/);
  assert.match(utility, /internalSvgUrl/);
  assert.match(utility, /convertInternalSvgToBlob/);
  assert.match(utility, /crossOrigin\s*=\s*"anonymous"/);
  assert.match(utility, /toBlob/);
  assert.match(utility, /image\/svg\+xml/);
  assert.match(utility, /image\/jpeg/);
  assert.match(utility, /image\/webp/);
  assert.doesNotMatch(utility, /Download SVG|downloadSvg|svgDownload/i);
  assert.equal(audit.summary.svgVisibleInPublicUi, false);
  assert.equal(audit.summary.publicDownloadFormats.length, 1);
  assert.deepEqual(audit.summary.publicDownloadFormats, ["PNG"]);
  assert.match(imageCard, /Download PNG/);
  assert.doesNotMatch(imageCard, /Download SVG|assetUrls\.svg|pngUrl\s*\|\|\s*svgUrl/);
});

test("decision keeps JPG and WebP hidden until the current public conversion gate allows owner review", async () => {
  const decision = await readJson("pipeline/manifests/round-4o-download-format-decision.json");
  const conversion = await readJson("pipeline/manifests/round-4o-browser-conversion-test-results.json");
  const ui = await readJson("pipeline/manifests/round-4o-download-ui-results.json");
  const round5gReadiness = await readJsonIfExists("pipeline/manifests/round-5g-download-format-readiness.json");
  const round5hExposure = await readJsonIfExists("pipeline/manifests/round-5h-download-format-exposure-results.json");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const round5hControlsExposed = round5hExposure?.summary?.controlsExposedAfterVerification === true;

  assert.equal(decision.summary.implementedJpegWebp, false);
  assert.equal(decision.summary.deferredJpegWebp, true);
  assert.equal(decision.summary.svgInternalOnly, true);
  assert.equal(decision.summary.requiresCorsBeforeUiExposure, true);
  if (round5hControlsExposed) {
    assert.equal(typeof conversion.summary.localCorsAllowsCanvasExport, "boolean");
    assert.deepEqual(round5hExposure.summary.currentPublicDownloadFormats, ["PNG", "JPG", "WebP"]);
    assert.equal(round5hExposure.summary.svgExposed, false);
  } else {
    assert.equal(conversion.summary.localCorsAllowsCanvasExport, false);
  }
  if (conversion.summary.temporaryR2CorsAllowsCanvasExport) {
    assert.equal(round5gReadiness?.summary?.browserConversionReady, true);
    assert.equal(round5gReadiness?.summary?.jpgJpegWebpControlsRemainHidden, true);
  } else {
    assert.equal(conversion.summary.temporaryR2CorsAllowsCanvasExport, false);
  }
  assert.equal(ui.summary.visibleJpegWebpOptions, false);
  assert.equal(ui.summary.visibleSvgOptions, false);
  assert.equal(ui.summary.printActionPresent, true);
  assert.equal(ui.summary.pngDownloadPresent, true);
  assert.doesNotMatch(imageCard, /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/);
});

test("Round 4O keeps ad placement, static export, and protected media boundaries unchanged", async () => {
  const guard = await readJson("pipeline/manifests/round-4o-download-ui-results.json");
  const nextConfig = await readText("next.config.mjs");
  const packageJson = await readJson("package.json");
  const routes = await readJson("src/generated/coloring/routes.json");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const sourceText = await readProjectText(["app", "src", "pipeline/manifests/round-4o-download-ui-results.json"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");

  assert.equal(guard.summary.adPlacementChanged, false);
  assert.equal(guard.summary.adStylingChanged, false);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(routes.routes.length, 65);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);
  assert.doesNotMatch(sourceText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), ["next", "react", "react-dom"]);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readJsonIfExists(relativePath) {
  try {
    return await readJson(relativePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }

  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else results.push(path.relative(REPO_ROOT, entryPath));
    }
  }

  await walk(root);
  return results;
}

async function listRound4OFiles(relativeRoot, extension) {
  const files = await readdir(path.join(REPO_ROOT, relativeRoot));
  return files
    .filter((file) => file.startsWith("round-4o-") && file.endsWith(extension))
    .map((file) => path.join(relativeRoot, file).replaceAll("\\", "/"))
    .sort();
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const root = path.join(REPO_ROOT, relativeRoot);
    const rootStat = await stat(root);
    if (rootStat.isFile()) {
      chunks.push(await readText(relativeRoot));
      continue;
    }
    const files = await listFilesIfExists(root);
    for (const file of files) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}
