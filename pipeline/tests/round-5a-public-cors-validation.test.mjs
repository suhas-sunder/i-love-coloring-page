import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const PUBLIC_CONTACT_EMAIL = "admin@ilovecoloringpage.com";

const REQUIRED_JSON = [
  "pipeline/manifests/round-5a-project-context-check.json",
  "pipeline/manifests/round-5a-conversion-implementation-audit.json",
  "pipeline/manifests/round-5a-public-asset-base-validation.json",
  "pipeline/manifests/round-5a-public-cors-test-selection.json",
  "pipeline/manifests/round-5a-public-cors-header-results.json",
  "pipeline/manifests/round-5a-browser-public-conversion-results.json",
  "pipeline/manifests/round-5a-download-format-exposure-decision.json",
  "pipeline/manifests/round-5a-r2-cors-configuration-guide.json",
  "pipeline/manifests/round-5a-browser-qa-results.json",
  "pipeline/manifests/round-5a-launch-readiness-adjustment.json",
];

test("Round 5A JSON manifests parse and record public CORS validation readiness", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5a-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round4zCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.svgUserDownloadExposed, false);
  assert.equal(context.summary.contactEmail, PUBLIC_CONTACT_EMAIL);
});

test("public asset base validation blocks public CORS claims when URL is missing, local, stale, or private", async () => {
  const validation = await readJson("pipeline/manifests/round-5a-public-asset-base-validation.json");
  const launch = await readJson("pipeline/manifests/round-5a-launch-readiness-adjustment.json");

  assert.equal(typeof validation.public_cors_validation_ready, "boolean");
  assert.equal(typeof validation.summary.assetBaseUrlConfigured, "boolean");
  assert.equal(validation.summary.hasColoringPagesPrefix || !validation.summary.assetBaseUrlConfigured, true);
  assert.equal(validation.summary.hasOldTestPrefix, false);
  assert.equal(validation.summary.hasDuplicateColoringPagesPrefix, false);
  assert.equal(validation.summary.isPrivateR2Endpoint, false);

  if (!validation.public_cors_validation_ready) {
    assert.ok(validation.blockers.length > 0);
    assert.equal(launch.public_asset_cors_ready, false);
    assert.equal(launch.jpg_webp_downloads_ready, false);
  }
});

test("CORS success is required before JPG, JPEG, or WebP controls can be exposed", async () => {
  const headers = await readJson("pipeline/manifests/round-5a-public-cors-header-results.json");
  const browser = await readJson("pipeline/manifests/round-5a-browser-public-conversion-results.json");
  const decision = await readJson("pipeline/manifests/round-5a-download-format-exposure-decision.json");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloads = await readText("src/lib/coloring/browserDownloads.ts");

  assert.equal(typeof headers.summary.publicCorsHeadersPass, "boolean");
  assert.equal(typeof browser.summary.publicBrowserConversionPass, "boolean");
  assert.equal(decision.summary.svgInternalOnly, true);
  assert.deepEqual(decision.summary.currentPublicDownloadFormats, ["PNG"]);

  if (!headers.summary.publicCorsHeadersPass || !browser.summary.publicBrowserConversionPass) {
    assert.equal(decision.summary.jpgJpegWebpControlsExposed, false);
    assert.doesNotMatch(imageCard, /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/);
  }

  assert.match(downloads, /convertInternalSvgToBlob/);
  assert.match(downloads, /printFromHighQualitySource/);
  assert.match(downloads, /downloadPng/);
  assert.doesNotMatch(downloads + imageCard, /Download SVG|downloadSvg|svgDownload/i);
});

test("R2/custom-domain CORS guide documents browser canvas requirements without credentials or uploads", async () => {
  const guide = await readJson("pipeline/manifests/round-5a-r2-cors-configuration-guide.json");
  const report = await readText("pipeline/reports/round-5a-r2-cors-configuration-guide.md");
  const deferral = await readText("pipeline/reports/round-5a-launch-readiness-adjustment.md");

  assert.ok(guide.requiredMethods.includes("GET"));
  assert.ok(guide.requiredMethods.includes("HEAD"));
  assert.ok(guide.requiredContentTypes.includes("image/svg+xml"));
  assert.ok(guide.requiredContentTypes.includes("image/png"));
  assert.match(report, /Access-Control-Allow-Origin|AllowedOrigins|GET|HEAD|canvas/i);
  assert.doesNotMatch(report, /CLOUDFLARE_R2_SECRET_ACCESS_KEY|SECRET|BEGIN PRIVATE KEY/i);
  assert.match(deferral, /Full asset upload remains deferred/i);
});

test("static export, app boundaries, media boundaries, ad rules, and contact config remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const publicSource = await readProjectText(["app", "src/components", "src/lib", "pipeline/manifests/round-5a-launch-readiness-adjustment.json"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const renameStatus = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(siteConfig, new RegExp(PUBLIC_CONTACT_EMAIL.replace(".", "\\.")));
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|coloring-pages)[\\/]/i.test(file)), false);
  assert.doesNotMatch(publicSource, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(publicSource, /Download SVG|SVG download|Download JPG|Download JPEG|Download WebP/i);
  assert.match(publicSource, /Round 4U|ad density/i);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.equal(renameStatus.split(/\r?\n/).some((line) => /^R/.test(line.trim())), false);
});

test("Round 5A scripts exist and do not upload, mutate media, or use app API routes", async () => {
  const publicValidator = await readText("pipeline/scripts/round-5a-validate-public-cors.mjs");
  const browserRunner = await readText("pipeline/scripts/round-5a-browser-public-conversion-qa-runner.cjs");

  assert.match(publicValidator, /NEXT_PUBLIC_COLORING_ASSET_BASE_URL/);
  assert.match(publicValidator, /Access-Control-Allow-Origin/);
  assert.match(browserRunner, /convertInternalSvgToBlob|printFromHighQualitySource|data-print-source/);
  assert.doesNotMatch(publicValidator + browserRunner, /wrangler\s+r2\s+object\s+put|bucket\s+cors\s+set|cloudflare\.request|app\/api|src\/app\/api/i);
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

  const rootStat = await import("node:fs/promises").then((fs) => fs.stat(root));
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root)];

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
    const root = path.join(REPO_ROOT, relativeRoot);
    for (const file of await listFilesIfExists(root)) {
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
