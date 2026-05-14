import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/live-prod-rerun-context-check.json",
  "pipeline/manifests/live-prod-deploy-commit-check.json",
  "pipeline/manifests/live-prod-rerun-http-results.json",
  "pipeline/manifests/live-prod-rerun-browser-qa-results.json",
  "pipeline/manifests/live-prod-rerun-download-print-results.json",
  "pipeline/manifests/live-prod-rerun-sampled-asset-check-results.json",
  "pipeline/manifests/live-prod-rerun-sitemap-robots-check.json",
  "pipeline/manifests/live-prod-rerun-metadata-check.json",
  "pipeline/manifests/live-prod-rerun-ad-layout-check.json",
  "pipeline/manifests/live-prod-rerun-acceptance-gate.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/live-prod-rerun-context-check.md",
  "pipeline/reports/live-prod-deploy-commit-check.md",
  "pipeline/reports/live-prod-rerun-http-report.md",
  "pipeline/reports/live-prod-rerun-browser-qa-report.md",
  "pipeline/reports/live-prod-rerun-download-print-report.md",
  "pipeline/reports/live-prod-rerun-sampled-asset-check-report.md",
  "pipeline/reports/live-prod-rerun-sitemap-robots-check.md",
  "pipeline/reports/live-prod-rerun-metadata-check.md",
  "pipeline/reports/live-prod-rerun-ad-layout-check.md",
  "pipeline/reports/live-prod-rerun-acceptance-gate.md",
];

test("live production rerun manifests and reports exist and parse", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    JSON.parse(await readText(relativePath));
  }

  for (const relativePath of REQUIRED_REPORTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    assert.ok((await readText(relativePath)).trim().length > 0, `${relativePath} should not be empty`);
  }

  const http = await readJson("pipeline/manifests/live-prod-rerun-http-results.json");
  const browser = await readJson("pipeline/manifests/live-prod-rerun-browser-qa-results.json");
  const downloadPrint = await readJson("pipeline/manifests/live-prod-rerun-download-print-results.json");
  const sampled = await readJson("pipeline/manifests/live-prod-rerun-sampled-asset-check-results.json");
  const sitemapRobots = await readJson("pipeline/manifests/live-prod-rerun-sitemap-robots-check.json");
  const metadata = await readJson("pipeline/manifests/live-prod-rerun-metadata-check.json");
  const adLayout = await readJson("pipeline/manifests/live-prod-rerun-ad-layout-check.json");
  const gate = await readJson("pipeline/manifests/live-prod-rerun-acceptance-gate.json");

  assert.equal(typeof http.summary.nonRootRoutesReachable, "boolean");
  assert.equal(typeof browser.summary.webpGalleryPreviewsRender, "boolean");
  assert.equal(typeof downloadPrint.passed, "boolean");
  assert.equal(sampled.summary.sampledRecords >= 150, true);
  assert.equal(typeof sitemapRobots.passed, "boolean");
  assert.equal(typeof metadata.passed, "boolean");
  assert.equal(typeof adLayout.passed, "boolean");
  assert.equal(typeof gate.production_deploy_current, "boolean");
  assert.equal(gate.ready_for_live_ads_round, false);
});

test("static-export and runtime safety boundaries remain intact", async () => {
  const projectText = await readProjectText(["app", "src", "next.config.mjs", "netlify.toml"]);
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const nextConfig = await readText("next.config.mjs");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));

  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.doesNotMatch(`${downloadMenu}\n${browserDownloads}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.match(`${downloadMenu}\n${browserDownloads}`, /label:\s*"PNG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"png"/);
  assert.match(`${downloadMenu}\n${browserDownloads}`, /label:\s*"JPG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"jpg"/);
  assert.match(`${downloadMenu}\n${browserDownloads}`, /label:\s*"WebP"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"webp"/);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)), false);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /opengraph-image|twitter-image|ImageResponse/i);
  assert.equal(await gitStatusFor("images"), "");
  assert.equal(await gitStatusFor("ilovesvg"), "");
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
      else results.push(path.relative(REPO_ROOT, absolute).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
    if (!existsSync(absoluteRoot)) continue;
    const files = (await import("node:fs")).statSync(absoluteRoot).isFile()
      ? [relativeRoot]
      : await listFilesIfExists(absoluteRoot);
    for (const file of files) {
      if (!/\.(?:ts|tsx|css|json|md|mjs|toml)$/.test(file)) continue;
      if (file.startsWith("src/generated/coloring/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout.trim();
}
