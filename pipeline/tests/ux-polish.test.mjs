import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_RUNTIME_HUBS = 131;

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/ux-polish-context-check.json",
  "pipeline/manifests/ux-polish-current-ux-audit.json",
  "pipeline/manifests/ux-polish-card-interaction-results.json",
  "pipeline/manifests/ux-polish-print-results.json",
  "pipeline/manifests/ux-polish-hero-results.json",
  "pipeline/manifests/ux-polish-more-menu-results.json",
  "pipeline/manifests/ux-polish-browser-qa-results.json",
  "pipeline/manifests/ux-polish-print-qa-results.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/ux-polish-context-check.md",
  "pipeline/reports/ux-polish-current-ux-audit.md",
  "pipeline/reports/ux-polish-card-interaction-report.md",
  "pipeline/reports/ux-polish-print-report.md",
  "pipeline/reports/ux-polish-hero-report.md",
  "pipeline/reports/ux-polish-more-menu-report.md",
  "pipeline/reports/ux-polish-browser-qa-report.md",
  "pipeline/reports/ux-polish-print-qa-report.md",
];

test("UX polish artifacts exist and parse", async () => {
  for (const relativePath of [...REQUIRED_MANIFESTS, ...REQUIRED_REPORTS]) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
  }

  for (const relativePath of REQUIRED_MANIFESTS) {
    JSON.parse(await readText(relativePath));
  }
});

test("context still matches the accepted runtime and deferred work stays deferred", async () => {
  const context = await readJson("pipeline/manifests/ux-polish-context-check.json");
  const nextConfig = await readText("next.config.mjs");
  const projectText = await readProjectText(["app", "src"]);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));

  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.currentBranch, "ver-5-deployed-may-13-2026");
  assert.equal(context.summary.commit9629cccExists, true);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(context.summary.runtimeAvailableRecords, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(context.summary.runtimeIndexableHubs, EXPECTED_RUNTIME_HUBS);
  assert.equal(context.summary.svgInternalOnly, true);
  assert.deepEqual(context.summary.publicDownloadFormats, ["PNG", "JPG", "WebP"]);
  assert.equal(context.summary.imageSitemapPresent, false);
  assert.equal(context.summary.openGraphImageGenerationPresent, false);
  assert.equal(context.summary.jsonLdExpansionDeferred, true);
  assert.equal(context.summary.liveAdsenseCodePresent, false);
  assert.equal(context.summary.adWellsVisibleByDefault, true);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)), false);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /ImageResponse|opengraph-image|twitter-image|imageSitemap|Image Sitemap/i);
});

test("image cards wire image activation to print and keep compact raster formats", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const assetImage = await readText("src/components/coloring/AssetImage.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const componentsCss = await readText("src/styles/components.css");
  const source = `${imageCard}\n${assetImage}\n${downloadMenu}\n${browserDownloads}\n${componentsCss}`;

  assert.match(imageCard, /className="gallery-item-media-button"/);
  assert.match(imageCard, /type="button"[\s\S]*onClick=\{printImage\}/);
  assert.doesNotMatch(imageCard, /<a className="gallery-item-media-link"[\s\S]*href=\{itemHref\}/);
  assert.match(assetImage, /interactive\?: boolean/);
  assert.match(componentsCss, /\.gallery-item-media-button/);
  assert.match(componentsCss, /cursor:\s*pointer/);
  assert.match(imageCard, />\s*Print\s*</);
  assert.match(downloadMenu, />\s*Formats\s*</);
  assert.doesNotMatch(downloadMenu, />\s*Download\s*<\/summary>/);
  assert.match(source, /label: "PNG"/);
  assert.match(source, /label: "JPG"/);
  assert.match(source, /label: "WebP"/);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.doesNotMatch(source, /Download SVG|>SVG<|downloadSvg|svgDownload/i);
});

test("print prep has polished fallback, timeout protection, and print CSS", async () => {
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");

  assert.match(browserDownloads, /PRINT_PREPARE_TIMEOUT_MS/);
  assert.match(browserDownloads, /writePreparingDocument/);
  assert.match(browserDownloads, /writePrintFailureDocument/);
  assert.match(browserDownloads, /I Love Coloring Page/);
  assert.match(browserDownloads, /Preparing print file/);
  assert.match(browserDownloads, /@page/);
  assert.match(browserDownloads, /print-shell|print-artwork|print-brand/);
  assert.match(browserDownloads, /setTimeout\(showFailure,\s*PRINT_PREPARE_TIMEOUT_MS\)/);
  assert.match(browserDownloads, /window\.print\(\)/);
  assert.doesNotMatch(browserDownloads, /stack|error\.message|Download SVG/i);
});

test("hero quick links and related collection panels point to real sections and routes", async () => {
  const hubHero = await readText("src/components/coloring/HubHero.tsx");
  const hubPage = await readText("src/components/coloring/HubPageContent.tsx");
  const landing = await readText("app/coloring-pages/page.tsx");
  const home = await readText("app/page.tsx");
  const related = await readText("src/components/coloring/RelatedHubs.tsx");
  const source = `${hubHero}\n${hubPage}\n${landing}\n${home}\n${related}`;

  assert.match(hubHero, /quickLinks/);
  assert.match(hubHero, /hero-related-links/);
  assert.match(source, /href="#gallery"/);
  assert.match(source, /href="#related-collections"/);
  assert.match(source, /href="#about-this-collection"/);
  assert.match(source, /id="gallery"/);
  assert.match(source, /id="related-collections"/);
  assert.match(source, /id="about-this-collection"/);
  assert.doesNotMatch(source, /hero-preview-grid/);

  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const routePaths = new Set(routes.routes.map((route) => route.path));
  for (const href of collectHrefLiterals(source).filter((href) => href.startsWith("/coloring-pages"))) {
    const [routePath] = href.split("#");
    assert.equal(routePaths.has(routePath), true, `${href} should point to a generated route`);
  }
});

test("More menu has intent groups instead of one broad dump and mobile search remains", async () => {
  const siteNav = await readText("src/lib/navigation/siteNav.ts");
  const moreHubMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const mobileNav = await readText("src/components/site/MobileNav.tsx");

  for (const label of [
    "Popular",
    "Seasonal",
    "Animals & Nature",
    "Fantasy & Characters",
    "Food & Cute Objects",
    "Vehicles & Places",
    "Patterns & Detailed",
    "Kids & Easy",
  ]) {
    assert.match(siteNav, new RegExp(escapeRegExp(label)));
  }
  assert.doesNotMatch(siteNav, /"More Collections"/);
  assert.match(siteNav, /More Specific Collections/);
  assert.match(moreHubMenu, /Search hub pages/);
  assert.match(mobileNav, /Search mobile hub pages|MoreHubMenu/);

  const grouping = await readJson("pipeline/manifests/ux-polish-more-menu-results.json");
  assert.equal(grouping.groupCount >= 6, true);
  assert.equal(grouping.fallbackCount <= 12, true);
  assert.equal(grouping.largestGroupCount < 60, true);
});

test("browser and print QA manifests report the requested UX checks", async () => {
  const browserQa = await readJson("pipeline/manifests/ux-polish-browser-qa-results.json");
  const printQa = await readJson("pipeline/manifests/ux-polish-print-qa-results.json");

  assert.equal(browserQa.summary.browserQaPassed, true);
  assert.equal(browserQa.summary.imageClickStartsPrintFlow, true);
  assert.equal(browserQa.summary.printDoesNotHang, true);
  assert.equal(browserQa.summary.pngDownloadWorks, true);
  assert.equal(browserQa.summary.jpgDownloadWorks, true);
  assert.equal(browserQa.summary.webpDownloadWorks, true);
  assert.equal(browserQa.summary.svgDownloadAbsent, true);
  assert.equal(browserQa.summary.moreMenuGrouped, true);
  assert.equal(browserQa.summary.mobileMenuWorks, true);
  assert.equal(browserQa.summary.adDensityUnchanged, true);
  assert.equal(browserQa.summary.noHorizontalOverflow, true);

  assert.equal(printQa.summary.printQaPassed, true);
  assert.equal(printQa.summary.samplesChecked >= 5, true);
  assert.equal(printQa.summary.finalOutputClean, true);
  assert.equal(printQa.summary.noInfinitePreparingState, true);
  assert.equal(printQa.summary.svgDownloadAbsent, true);
});

test("static export, source-image boundaries, and nested reference repo remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const projectText = await readProjectText(["app", "src"]);
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)), false);
  assert.doesNotMatch(projectText, /Download SVG|SVG download|downloadSvg|svgDownload/i);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
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
  return results.map((file) => file.replace(/\\/g, "/"));
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|mjs)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/runtime-available-items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function collectHrefLiterals(source) {
  return [...source.matchAll(/href=["']([^"']+)["']/g)].map((match) => match[1]);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
