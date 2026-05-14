import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/predeploy-local-context-check.json",
  "pipeline/manifests/predeploy-print-current-audit.json",
  "pipeline/manifests/predeploy-print-pdf-implementation.json",
  "pipeline/manifests/predeploy-print-modal-polish.json",
  "pipeline/manifests/predeploy-print-qa-results.json",
  "pipeline/manifests/predeploy-link-section-ui-results.json",
  "pipeline/manifests/predeploy-local-browser-qa-results.json",
  "pipeline/manifests/predeploy-local-seo-qa-results.json",
  "pipeline/manifests/predeploy-trust-legal-local-review.json",
  "pipeline/manifests/predeploy-ad-placeholder-local-qa.json",
  "pipeline/manifests/predeploy-local-acceptance-gate.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/predeploy-local-context-check.md",
  "pipeline/reports/predeploy-print-current-audit.md",
  "pipeline/reports/predeploy-print-pdf-implementation-report.md",
  "pipeline/reports/predeploy-print-modal-polish-report.md",
  "pipeline/reports/predeploy-print-qa-report.md",
  "pipeline/reports/predeploy-link-section-ui-report.md",
  "pipeline/reports/predeploy-local-browser-qa-report.md",
  "pipeline/reports/predeploy-local-seo-qa-report.md",
  "pipeline/reports/predeploy-trust-legal-local-review.md",
  "pipeline/reports/predeploy-ad-placeholder-local-qa.md",
  "pipeline/reports/predeploy-local-acceptance-gate.md",
];

test("predeploy manifests and reports parse and exist", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    JSON.parse(await readText(relativePath));
  }

  for (const relativePath of REQUIRED_REPORTS) {
    const report = await readText(relativePath);
    assert.ok(report.trim().length > 0, `${relativePath} should not be empty`);
  }
});

test("print QA documents one-page PDF output with safe branding", async () => {
  const printQa = await readJson("pipeline/manifests/predeploy-print-qa-results.json");
  const implementation = await readJson("pipeline/manifests/predeploy-print-pdf-implementation.json");
  const modal = await readJson("pipeline/manifests/predeploy-print-modal-polish.json");

  assert.equal(printQa.summary.printFlowOpens, true);
  assert.equal(printQa.summary.generatedPrintablePageCount, 1);
  assert.equal(printQa.summary.noBlankPrintPages, true);
  assert.equal(printQa.summary.artworkCentered, true);
  assert.equal(printQa.summary.artworkUsesMostOfPage, true);
  assert.equal(printQa.summary.brandingVisible, true);
  assert.equal(printQa.summary.brandingOverlapsArtwork, false);
  assert.equal(printQa.summary.appUiControlsInPrintableOutput, false);
  assert.equal(printQa.summary.browserHeadersFootersAvoidedByPdfWorkflow, true);
  assert.equal(implementation.summary.pdfStyleOutputImplemented, true);
  assert.equal(implementation.summary.frontendOnly, true);
  assert.equal(implementation.summary.pageSize, "letter-portrait");
  assert.equal(modal.summary.controlsTopRight, true);
  assert.equal(modal.summary.unnecessaryScrollbar, false);
});

test("downloads keep SVG internal and expose PNG, JPG, and WebP only", async () => {
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const printQa = await readJson("pipeline/manifests/predeploy-print-qa-results.json");

  assert.match(browserDownloads, /prepareOnePagePrintPdf|printOnePagePdf/);
  assert.match(browserDownloads, /iLoveColoringPage\.com/);
  assert.match(downloadMenu, /Download PNG/);
  assert.match(downloadMenu, /Download JPG/);
  assert.match(downloadMenu, /Download WebP/);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}\n${imageCard}`, /Download SVG|SVG download|downloadSvg\b/i);
  assert.equal(printQa.summary.svgDownloadAbsent, true);
  assert.deepEqual(printQa.summary.publicDownloadFormats.sort(), ["JPG", "PNG", "WebP"].sort());
});

test("static export, app/api absence, SEO assets, and JSON-LD stay intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const packageJson = JSON.parse(await readText("package.json"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const seo = await readJson("pipeline/manifests/predeploy-local-seo-qa-results.json");
  const browserQa = await readJson("pipeline/manifests/predeploy-local-browser-qa-results.json");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(packageJson.scripts?.build || "", /next build/);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.ok(publicFiles.some((file) => normalizePath(file) === "public/image-sitemap.xml"));
  assert.ok(publicFiles.some((file) => normalizePath(file).startsWith("public/og/")));
  assert.equal(seo.summary.imageSitemapWebpEntryCount, 6352);
  assert.equal(seo.summary.svgUrlsInImageSitemap, 0);
  assert.equal(seo.summary.pngOrThumbUrlsInImageSitemap, 0);
  assert.equal(seo.summary.perImageRoutesFound, false);
  assert.equal(seo.summary.localhostOrPrivateUrlsFound, false);
  assert.equal(seo.summary.sampledPagesHaveJsonLd, true);
  assert.equal(browserQa.summary.runtimeAvailableRecords, 6352);
  assert.equal(browserQa.summary.runtimeIndexableHubs, 131);
});

test("trust, ad, and acceptance gates block live ads but allow local deploy readiness only after blockers pass", async () => {
  const trust = await readJson("pipeline/manifests/predeploy-trust-legal-local-review.json");
  const ads = await readJson("pipeline/manifests/predeploy-ad-placeholder-local-qa.json");
  const gate = await readJson("pipeline/manifests/predeploy-local-acceptance-gate.json");

  assert.equal(trust.summary.contactEmail, "admin@ilovecoloringpage.com");
  assert.equal(trust.summary.fakeAddressOrPhonePresent, false);
  assert.equal(trust.summary.legalReviewStillRecommended, true);
  assert.equal(ads.summary.adWellsVisibleByDefault, true);
  assert.equal(ads.summary.liveAdSenseScriptPresent, false);
  assert.equal(ads.summary.adClientIdsPresent, false);
  assert.equal(ads.summary.adsInsideNav, false);
  assert.equal(ads.summary.adsInsideGalleryGrid, false);
  assert.equal(gate.print_pdf_output_passed, true);
  assert.equal(gate.print_one_page_passed, true);
  assert.equal(gate.no_blank_print_pages, true);
  assert.equal(gate.no_svg_download, true);
  assert.equal(gate.no_app_api, true);
  assert.equal(gate.static_export_passed, true);
  assert.equal(gate.ready_for_netlify_deploy, true);
  assert.equal(gate.ready_for_live_ads_round, false);
  assert.deepEqual(gate.blockers, []);
});

test("repo safety boundaries remain untouched and public media is limited to approved XML and OG assets", async () => {
  const sourceText = await readProjectText(["app", "src", "pipeline/manifests/predeploy-local-context-check.json"]);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const imagesStatus = await gitStatusFor("images");
  const ilovesvgStatus = await gitStatusFor("ilovesvg");
  const envStatus = await gitStatusFor(".env.local");

  assert.doesNotMatch(sourceText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.equal(imagesStatus.trim(), "");
  assert.equal(ilovesvgStatus.trim(), "");
  assert.equal(envStatus.trim(), "");
  assert.equal(publicFiles.every(isApprovedPublicFile), true);
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
      if (normalizePath(file).startsWith("src/generated/coloring/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function isApprovedPublicFile(filePath) {
  const normalized = normalizePath(filePath);
  return (
    normalized === "public/image-sitemap.xml" ||
    /^public\/og\/.+\.jpg$/i.test(normalized)
  );
}
