import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const PUBLIC_CONTACT_EMAIL = "admin@ilovecoloringpage.com";

const REQUIRED_JSON = [
  "pipeline/manifests/round-4z-project-context-check.json",
  "pipeline/manifests/round-4z-contact-config-results.json",
  "pipeline/manifests/round-4z-print-download-audit.json",
  "pipeline/manifests/round-4z-svg-conversion-design.json",
  "pipeline/manifests/round-4z-download-format-decision.json",
  "pipeline/manifests/round-4z-local-cors-preview-results.json",
  "pipeline/manifests/round-4z-browser-conversion-qa-results.json",
  "pipeline/manifests/round-4z-production-cors-requirements.json",
  "pipeline/manifests/round-4z-asset-publishing-deferral.json",
  "pipeline/manifests/round-4z-browser-qa-results.json",
  "pipeline/manifests/round-4z-print-quality-results.json",
  "pipeline/manifests/round-4z-browser-download-results.json",
  "pipeline/manifests/round-4z-launch-readiness-adjustment.json",
];

test("Round 4Z JSON manifests parse and document the revised launch scope", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-4z-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
  assert.equal(context.summary.svgUserDownloadExposed, false);
  assert.equal(context.summary.liveAdSenseCodePresent, false);
});

test("contact configuration defaults to the approved public email without fake company details", async () => {
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const envExample = await readText(".env.example");
  const contact = await readText("app/contact/page.tsx");
  const privacy = await readText("app/privacy/page.tsx");
  const terms = await readText("app/terms/page.tsx");
  const contactResults = await readJson("pipeline/manifests/round-4z-contact-config-results.json");

  assert.match(siteConfig + envExample + contact + privacy + terms, new RegExp(PUBLIC_CONTACT_EMAIL.replace(".", "\\.")));
  assert.equal(contactResults.summary.publicContactEmail, PUBLIC_CONTACT_EMAIL);
  assert.equal(contactResults.summary.contactMethodConfigured, true);
  assert.doesNotMatch(contact + privacy + terms, /support@example\.com|123 Main|555-|fake address|fake phone/i);
});

test("browser download utility uses internal SVG conversion without exposing SVG as a user download", async () => {
  const utility = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadDecision = await readJson("pipeline/manifests/round-4z-download-format-decision.json");

  assert.match(utility, /convertInternalSvgToBlob/);
  assert.match(utility, /printFromHighQualitySource/);
  assert.match(utility, /downloadPng/);
  assert.match(utility, /downloadJpeg/);
  assert.match(utility, /downloadWebp/);
  assert.match(utility, /internalSvgUrl/);
  assert.match(utility, /image\/svg\+xml/);
  assert.match(utility, /canvas-tainted|cors/i);
  assert.match(utility, /toBlob/);
  assert.doesNotMatch(utility + imageCard, /Download SVG|SVG download|downloadSvg\b/i);
  assert.equal(downloadDecision.summary.svgInternalOnly, true);
  assert.deepEqual(downloadDecision.summary.currentPublicDownloadFormats, ["PNG"]);
  assert.equal(downloadDecision.summary.jpegWebpVisibleInUi, false);
});

test("print action prefers SVG-derived output and no longer uses thumbnail or raw preview popup source", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const printResults = await readJson("pipeline/manifests/round-4z-print-quality-results.json");

  assert.match(imageCard, /prepareHighQualityPrintImage/);
  assert.match(imageCard, /internalSvgUrl/);
  assert.doesNotMatch(imageCard, /const\s+printUrl\s*=\s*assetUrls\.thumbnail|printUrl\s*=\s*assetUrls\.preview/);
  assert.doesNotMatch(imageCard, /window\.open\("",\s*"_blank"\)[\s\S]*<img src="\$\{escapeHtml\(printUrl\)\}"/);
  assert.equal(printResults.summary.printPrefersSvgDerivedPng, true);
  assert.equal(printResults.summary.thumbnailUsedForPrint, false);
  assert.equal(printResults.summary.fallbackToPngPreviewAvailable, true);
});

test("local CORS media server and browser conversion QA document conversion support and deferred formats", async () => {
  const corsServer = await readText("pipeline/scripts/round-4z-cors-media-server.mjs");
  const conversionQa = await readJson("pipeline/manifests/round-4z-browser-conversion-qa-results.json");
  const corsRequirements = await readJson("pipeline/manifests/round-4z-production-cors-requirements.json");
  const browserDownloads = await readJson("pipeline/manifests/round-4z-browser-download-results.json");

  assert.match(corsServer, /Access-Control-Allow-Origin/);
  assert.match(corsServer, /pipeline\/r2-upload|pipeline\\\\r2-upload|r2-upload/);
  assert.match(corsServer, /path traversal|startsWith|normalize/i);
  assert.equal(conversionQa.summary.internalSvgLoadsWithCorsServer, true);
  assert.equal(conversionQa.summary.canvasTaintedWithCorsServer, false);
  assert.equal(conversionQa.summary.pngBlobExportSucceeded, true);
  assert.equal(conversionQa.summary.printFlowUsesGeneratedOutput, true);
  assert.equal(conversionQa.summary.svgUserDownloadAbsent, true);
  assert.equal(browserDownloads.summary.visibleSvgDownload, false);
  assert.equal(browserDownloads.summary.visibleJpegWebpControls, false);
  assert.equal(corsRequirements.summary.productionCorsRequiredForFutureJpegWebpUi, true);
});

test("static export, app boundaries, media boundaries, and ad rules remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const sourceText = await readProjectText(["app", "src/components", "src/lib", "pipeline/manifests/round-4z-browser-qa-results.json"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const renameStatus = await gitStatus();
  const deferral = await readJson("pipeline/manifests/round-4z-asset-publishing-deferral.json");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|coloring-pages)[\\/]/i.test(file)), false);
  assert.doesNotMatch(sourceText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(sourceText, /Download SVG|SVG download|downloadSvg\b/i);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.equal(renameStatus.split(/\r?\n/).some((line) => /^R/.test(line.trim())), false);
  assert.equal(deferral.summary.fullAssetUploadDeferred, true);
  assert.equal(deferral.summary.noUploadCommandRun, true);
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
    const root = path.join(REPO_ROOT, relativeRoot);
    const rootStat = await stat(root);
    if (rootStat.isFile()) {
      chunks.push(await readText(relativeRoot));
      continue;
    }
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
