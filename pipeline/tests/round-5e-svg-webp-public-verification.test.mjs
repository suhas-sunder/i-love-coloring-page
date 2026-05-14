import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_JSON = [
  "pipeline/manifests/round-5e-project-context-check.json",
  "pipeline/manifests/round-5e-public-asset-base-validation.json",
  "pipeline/manifests/round-5e-svg-webp-public-url-results.json",
  "pipeline/manifests/round-5e-svg-cors-results.json",
  "pipeline/manifests/round-5e-browser-svg-webp-public-qa-results.json",
  "pipeline/manifests/round-5e-download-format-readiness.json",
  "pipeline/manifests/round-5e-final-upload-readiness.json",
  "pipeline/manifests/round-5e-r2-cors-content-type-update.json",
  "pipeline/manifests/round-5e-asset-strategy-results.json",
];

test("Round 5E JSON manifests parse and confirm the expected project context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5e-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5dCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.testBundleExists, true);
  assert.equal(context.summary.testBundleSvgExists, true);
  assert.equal(context.summary.testBundleWebpExists, true);
  assert.equal(context.summary.svgUserDownloadExposed, false);
  assert.deepEqual(context.summary.currentPublicDownloadFormats, ["PNG"]);
  assert.equal(context.summary.jpgJpegWebpControlsVisible, false);
});

test("public asset base validation exists and blocks non-public or missing values", async () => {
  const validation = await readJson("pipeline/manifests/round-5e-public-asset-base-validation.json");

  assert.equal(typeof validation.summary.publicVerificationReady, "boolean");
  assert.equal(validation.summary.includesColoringPagesPrefix || validation.summary.publicVerificationReady === false, true);
  assert.equal(validation.summary.hasOldTestPrefix, false);
  assert.equal(validation.summary.hasDuplicateColoringPagesPrefix, false);
  assert.equal(validation.summary.privateR2Endpoint, false);
  assert.equal(validation.summary.credentialsInUrl, false);

  if (!validation.summary.publicVerificationReady) {
    assert.ok(validation.blockers.length > 0);
  }
});

test("Round 5C SVG/WebP URL plan has 30 SVG and 30 WebP entries with no PNG or thumbs", async () => {
  const plan = await readJson("pipeline/manifests/round-5c-svg-webp-url-verification-plan.json");

  assert.equal(plan.summary.svgUrlCount, 30);
  assert.equal(plan.summary.webpUrlCount, 30);
  assert.equal(plan.summary.plannedUrlCount, 60);

  for (const entry of plan.allUrls) {
    assert.match(entry.r2ObjectKey, /^coloring-pages\/(?:svg|webp)\//);
    assert.doesNotMatch(entry.r2ObjectKey, /\/png\/|\/thumbs\//);
    assert.doesNotMatch(entry.r2ObjectKey, /coloring\/test-v1/);
    assert.doesNotMatch(entry.url, /coloring-pages\/coloring-pages/);
    if (entry.mediaType === "svg") assert.equal(entry.expectedContentType, "image/svg+xml");
    if (entry.mediaType === "webp") assert.equal(entry.expectedContentType, "image/webp");
  }
});

test("public URL and SVG CORS results remain honest when verification cannot run", async () => {
  const baseValidation = await readJson("pipeline/manifests/round-5e-public-asset-base-validation.json");
  const urlResults = await readJson("pipeline/manifests/round-5e-svg-webp-public-url-results.json");
  const corsResults = await readJson("pipeline/manifests/round-5e-svg-cors-results.json");

  assert.equal(urlResults.summary.plannedSvgUrlCount, 30);
  assert.equal(urlResults.summary.plannedWebpUrlCount, 30);
  assert.equal(urlResults.summary.checkedUrlCount <= 60, true);
  assert.equal(corsResults.summary.svgCorsPassed || corsResults.summary.status === "not_run", true);

  if (!baseValidation.summary.publicVerificationReady) {
    assert.equal(urlResults.summary.status, "not_run");
    assert.equal(urlResults.summary.publicUrlVerificationPassed, false);
    assert.equal(corsResults.summary.status, "not_run");
    assert.equal(corsResults.summary.svgCorsPassed, false);
  }
});

test("CORS success is required before conversion and JPG/JPEG/WebP readiness", async () => {
  const corsResults = await readJson("pipeline/manifests/round-5e-svg-cors-results.json");
  const browserQa = await readJson("pipeline/manifests/round-5e-browser-svg-webp-public-qa-results.json");
  const readiness = await readJson("pipeline/manifests/round-5e-download-format-readiness.json");

  if (corsResults.summary.svgCorsPassed && browserQa.summary.browserCanvasExportPassed) {
    assert.equal(readiness.summary.browserConversionReady, true);
  } else {
    assert.equal(readiness.summary.browserConversionReady, false);
    assert.equal(readiness.summary.jpgJpegWebpControlsRemainHidden, true);
  }
  assert.equal(readiness.summary.svgUserDownloadExposed, false);
});

test("final upload readiness and R2 guidance stay SVG plus WebP only", async () => {
  const finalReadiness = await readJson("pipeline/manifests/round-5e-final-upload-readiness.json");
  const guidance = await readJson("pipeline/manifests/round-5e-r2-cors-content-type-update.json");
  const strategy = await readJson("pipeline/manifests/round-5e-asset-strategy-results.json");

  assert.deepEqual(finalReadiness.finalR2Folders, ["svg", "webp"]);
  assert.deepEqual(finalReadiness.excludedFolders, ["png", "thumbs"]);
  assert.equal(finalReadiness.summary.fullUploadDeferred, true);
  assert.equal(finalReadiness.summary.svgWebpOnlyModelStillValid, true);
  assert.equal(guidance.expectedContentTypes.svg, "image/svg+xml");
  assert.equal(guidance.expectedContentTypes.webp, "image/webp");
  assert.equal(guidance.summary.svgInternalOnly, true);
  assert.equal(strategy.summary.finalUploadModel, "svg-plus-webp-only");
  assert.equal(strategy.summary.fullUploadDeferred, true);
  assert.equal(strategy.summary.jpgJpegWebpControlsRemainDeferred, true);
});

test("static export, media boundaries, downloads, ads, and deferred SEO work remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const projectText = await readProjectText(["app", "src"]);
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const trackedTestBundleMedia = await gitLsFiles("pipeline/r2-upload-test-svg-webp");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const renameStatus = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)), false);
  assert.match(imageCard, /Print/);
  assert.match(imageCard, /Download PNG/);
  assert.match(browserDownloads, /VERIFIED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png"\]/);
  assert.doesNotMatch(imageCard + browserDownloads, /Download SVG|downloadSvg|svgDownload/i);
  assert.doesNotMatch(imageCard, /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /ImageResponse|opengraph-image|twitter-image/i);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(trackedTestBundleMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.equal(renameStatus.split(/\r?\n/).some((line) => /^R/.test(line.trim())), false);
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
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
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatus() {
  const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
