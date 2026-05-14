import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/final-live-context-check.json",
  "pipeline/manifests/final-live-deployment-freshness.json",
  "pipeline/manifests/final-live-http-results.json",
  "pipeline/manifests/final-live-sitemap-gsc-results.json",
  "pipeline/manifests/final-live-metadata-jsonld-results.json",
  "pipeline/manifests/final-live-browser-qa-results.json",
  "pipeline/manifests/final-trust-content-review.json",
  "pipeline/manifests/final-gsc-submission-readiness.json",
  "pipeline/manifests/final-live-sampled-asset-check-results.json",
  "pipeline/manifests/final-live-acceptance-gate.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/final-live-context-check.md",
  "pipeline/reports/final-live-deployment-freshness.md",
  "pipeline/reports/final-live-http-report.md",
  "pipeline/reports/final-live-sitemap-gsc-report.md",
  "pipeline/reports/final-live-metadata-jsonld-report.md",
  "pipeline/reports/final-live-browser-qa-report.md",
  "pipeline/reports/final-trust-content-review.md",
  "pipeline/reports/final-gsc-submission-guide.md",
  "pipeline/reports/final-live-sampled-asset-check-report.md",
  "pipeline/reports/final-live-acceptance-gate.md",
];

test("final live manifests and reports parse and exist", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    JSON.parse(await readText(relativePath));
  }

  for (const relativePath of REQUIRED_REPORTS) {
    const report = await readText(relativePath);
    assert.ok(report.trim().length > 0, `${relativePath} should not be empty`);
  }
});

test("final live acceptance gate records deploy and GSC readiness decisions", async () => {
  const gate = await readJson("pipeline/manifests/final-live-acceptance-gate.json");
  const gsc = await readJson("pipeline/manifests/final-gsc-submission-readiness.json");

  assert.equal(typeof gate.production_site_reachable, "boolean");
  assert.equal(typeof gate.production_deploy_current, "boolean");
  assert.equal(typeof gate.route_check_passed, "boolean");
  assert.equal(typeof gate.regular_sitemap_passed, "boolean");
  assert.equal(typeof gate.image_sitemap_passed, "boolean");
  assert.equal(typeof gate.robots_passed, "boolean");
  assert.equal(typeof gate.og_metadata_passed, "boolean");
  assert.equal(typeof gate.jsonld_passed, "boolean");
  assert.equal(typeof gate.browser_qa_passed, "boolean");
  assert.equal(typeof gate.sampled_asset_check_passed, "boolean");
  assert.equal(typeof gate.print_pdf_passed, "boolean");
  assert.equal(typeof gate.downloads_passed, "boolean");
  assert.equal(typeof gate.trust_content_review_passed, "boolean");
  assert.equal(typeof gate.gsc_submission_ready, "boolean");
  assert.equal(gate.live_ads_skipped, true);
  assert.equal(gate.optional_later_work_skipped, true);
  assert.equal(gate.ready_for_live_ads_round, false);
  assert.ok(Array.isArray(gate.blockers));
  if (!gate.production_deploy_current) {
    assert.ok(gate.blockers.some((blocker) => /deploy|commit|production/i.test(blocker)), "stale production must be documented as a blocker");
  }

  assert.equal(gsc.ready_for_owner_gsc_submission, gate.ready_for_owner_gsc_submission);
  assert.equal(typeof gsc.canonicals_ready, "boolean");
  assert.ok(Array.isArray(gsc.blockers));
});

test("SVG remains internal-only and PNG, JPG, and WebP controls remain", async () => {
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserQa = await readJson("pipeline/manifests/final-live-browser-qa-results.json");

  assert.match(downloadMenu, /Download PNG/);
  assert.match(downloadMenu, /Download JPG/);
  assert.match(downloadMenu, /Download WebP/);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg\b|svgDownload/i);
  assert.equal(browserQa.summary.svgDownloadAbsent, true);
  if (browserQa.summary.downloadsPassed) {
    assert.equal(browserQa.summary.pngDownloadWorks, true);
    assert.equal(browserQa.summary.jpgDownloadWorks, true);
    assert.equal(browserQa.summary.webpDownloadWorks, true);
  } else {
    const gate = await readJson("pipeline/manifests/final-live-acceptance-gate.json");
    assert.ok(gate.blockers.includes("downloads_passed") || gate.production_deploy_current === false);
  }
});

test("static export, app/api absence, image sitemap, OG images, and JSON-LD stay intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const packageJson = JSON.parse(await readText("package.json"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const metadata = await readJson("pipeline/manifests/final-live-metadata-jsonld-results.json");
  const sitemap = await readJson("pipeline/manifests/final-live-sitemap-gsc-results.json");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(packageJson.scripts?.build || "", /next build/);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.ok(publicFiles.some((file) => normalizePath(file) === "public/image-sitemap.xml"));
  assert.ok(publicFiles.some((file) => normalizePath(file).startsWith("public/og/")));
  assert.equal(typeof sitemap.summary.imageSitemapWebpEntryCount, "number");
  assert.equal(sitemap.summary.imageSitemapSvgUrlCount, 0);
  assert.equal(sitemap.summary.imageSitemapPngOrThumbUrlCount, 0);
  if (sitemap.summary.imageSitemapPassed) assert.equal(sitemap.summary.imageSitemapWebpEntryCount, 6352);
  if (!sitemap.summary.imageSitemapPassed) assert.ok(sitemap.blockers.some((blocker) => /image sitemap/i.test(blocker)));
  if (metadata.summary.jsonLdPassed) assert.equal(metadata.summary.jsonLdScriptsExist, true);
  if (!metadata.summary.jsonLdPassed) assert.ok(metadata.blockers.some((blocker) => /JSON-LD/i.test(blocker)));
  if (metadata.summary.ogMetadataPassed) assert.equal(metadata.summary.ogImagesPresent, true);
  if (!metadata.summary.ogMetadataPassed) assert.ok(metadata.blockers.some((blocker) => /metadata|OG/i.test(blocker)));
});

test("live AdSense remains absent and source boundaries are untouched", async () => {
  const sourceText = await readProjectText(["app", "src"]);
  const imagesStatus = await gitStatusFor("images");
  const ilovesvgStatus = await gitStatusFor("ilovesvg");
  const envStatus = await gitStatusFor(".env.local");

  assert.doesNotMatch(sourceText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.equal(imagesStatus.trim(), "");
  assert.equal(ilovesvgStatus.trim(), "");
  assert.equal(envStatus.trim(), "");
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(existsSync(path.join(REPO_ROOT, "src", "app", "api")), false);
});

test("public media remains limited to approved XML and OG assets", async () => {
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
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
  const command = process.platform === "win32" ? "git.exe" : "git";
  const { stdout } = await execFileAsync(command, ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
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
