import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = process.cwd();
const EXPECTED_AVAILABLE_RECORDS = 6352;
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/live-routing-project-context-check.json",
  "pipeline/manifests/live-routing-config-audit.json",
  "pipeline/manifests/live-routing-http-results.json",
  "pipeline/manifests/live-routing-local-export-results.json",
  "pipeline/manifests/live-routing-sitemap-local-check.json",
  "pipeline/manifests/live-routing-runtime-build-check.json",
  "pipeline/manifests/live-routing-fix-actions.json",
  "pipeline/manifests/live-routing-post-fix-live-check.json",
  "pipeline/manifests/live-routing-acceptance-gate.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/live-routing-project-context-check.md",
  "pipeline/reports/live-routing-config-audit.md",
  "pipeline/reports/live-routing-http-report.md",
  "pipeline/reports/live-routing-local-export-report.md",
  "pipeline/reports/live-routing-sitemap-local-check.md",
  "pipeline/reports/live-routing-runtime-build-check.md",
  "pipeline/reports/live-routing-fix-actions.md",
  "pipeline/reports/live-routing-post-fix-live-check.md",
  "pipeline/reports/live-routing-acceptance-gate.md",
];

test("live routing manifests and reports exist and parse", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    JSON.parse(await readText(relativePath));
  }

  for (const relativePath of REQUIRED_REPORTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    assert.ok((await readText(relativePath)).trim().length > 0, `${relativePath} should not be empty`);
  }

  const localExport = await readJson("pipeline/manifests/live-routing-local-export-results.json");
  const sitemap = await readJson("pipeline/manifests/live-routing-sitemap-local-check.json");
  const gate = await readJson("pipeline/manifests/live-routing-acceptance-gate.json");

  assert.equal(typeof localExport.summary.localStaticExportRoutesPassed, "boolean");
  assert.equal(typeof sitemap.summary.localSitemapCurrent, "boolean");
  assert.equal(typeof gate.ready_to_resume_live_production_qa, "boolean");
});

test("static export routing remains frontend-only and public-safe", async () => {
  const nextConfig = await readText("next.config.mjs");
  const netlifyConfig = await readText("netlify.toml");
  const packageJson = await readJson("package.json");
  const projectText = await readProjectText(["app", "src", "next.config.mjs", "netlify.toml"]);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(packageJson.scripts.build, "next build");
  assert.match(netlifyConfig, /publish\s*=\s*"out"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)), false);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /opengraph-image|twitter-image|ImageResponse/i);
  assert.doesNotMatch(projectText, /image-sitemap|ImageSitemap/i);
});

test("sitemap excludes per-image routes, Phase 2 hubs, and image sitemap output", async () => {
  const generatedSitemap = await readJson("src/generated/coloring/runtime-site-map.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const localSitemap = await readJson("pipeline/manifests/live-routing-sitemap-local-check.json");

  const sitemapPaths = generatedSitemap.entries.map((entry) => entry.path);
  const phase2Routes = hubs.backlogHubs.map((hub) => `/coloring-pages/${hub.slug}`);
  const sectionOnlyRoutes = hubs.sectionOnlyTopics.map((topic) => `/coloring-pages/${topic.slug}`);

  assert.equal(sitemapPaths.includes("/coloring-pages"), true);
  assert.equal(sitemapPaths.some((route) => /#asset-/.test(route)), false);
  assert.equal(sitemapPaths.some((route) => /\/image-sitemap/i.test(route)), false);
  assert.equal(phase2Routes.some((route) => sitemapPaths.includes(route)), false);
  assert.equal(sectionOnlyRoutes.some((route) => sitemapPaths.includes(route)), false);
  assert.equal(localSitemap.summary.noPerImageRoutes, true);
  assert.equal(localSitemap.summary.noPhase2HubRoutes, true);
  assert.equal(localSitemap.summary.noSectionOnlyTopicRoutes, true);
  assert.equal(localSitemap.summary.noImageSitemap, true);
});

test("runtime switch and user-facing download boundaries remain intact", async () => {
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const assetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const rootHub = (await readJson("src/generated/coloring/runtime-hubs.json")).hubs.find((hub) => hub.route === "/coloring-pages");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const assets = await readText("src/lib/coloring/assets.ts");

  assert.equal(available.summary.itemCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(assetPaths.summary.recordCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(rootHub.assetCount, EXPECTED_AVAILABLE_RECORDS);
  assert.match(`${downloadMenu}\n${browserDownloads}`, /label:\s*"PNG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"png"/);
  assert.match(`${downloadMenu}\n${browserDownloads}`, /label:\s*"JPG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"jpg"/);
  assert.match(`${downloadMenu}\n${browserDownloads}`, /label:\s*"WebP"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"webp"/);
  assert.doesNotMatch(`${downloadMenu}\n${browserDownloads}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.match(siteConfig, new RegExp(escapeRegExp(SITE_URL)));
  assert.match(siteConfig, new RegExp(escapeRegExp(ASSET_BASE_URL)));
  assert.match(siteConfig, new RegExp(escapeRegExp(CONTACT_EMAIL)));
  assert.match(assets, new RegExp(escapeRegExp(ASSET_BASE_URL)));
});

test("routing config does not introduce self-redirect rules", async () => {
  const configAudit = await readJson("pipeline/manifests/live-routing-config-audit.json");
  const fixActions = await readJson("pipeline/manifests/live-routing-fix-actions.json");
  const netlifyConfig = await readText("netlify.toml");

  assert.equal(configAudit.summary.netlifyPublishDirectory, "out");
  assert.equal(configAudit.summary.netlifyBuildCommand, "npm run build");
  assert.equal(configAudit.summary.staticExportConfigured, true);
  assert.equal(configAudit.summary.selfRedirectRulePresent, false);

  if (fixActions.summary.routingConfigChanged) {
    assert.doesNotMatch(netlifyConfig, /from\s*=\s*"([^"]+)"[\s\S]{0,160}to\s*=\s*"\1"/);
  }
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
