import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/live-production-project-context-check.json",
  "pipeline/manifests/live-production-public-config-audit.json",
  "pipeline/manifests/live-production-no-env-build-results.json",
  "pipeline/manifests/live-production-deployment-check.json",
  "pipeline/manifests/live-production-browser-qa-results.json",
  "pipeline/manifests/live-production-download-print-qa-results.json",
  "pipeline/manifests/live-production-sampled-asset-check-results.json",
  "pipeline/manifests/live-production-sitemap-robots-check.json",
  "pipeline/manifests/live-production-metadata-check.json",
  "pipeline/manifests/live-production-ad-layout-check.json",
  "pipeline/manifests/live-production-acceptance-gate.json",
];

test("live production verification manifests parse and preserve conservative gates", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    JSON.parse(await readText(relativePath));
  }

  const configAudit = await readJson("pipeline/manifests/live-production-public-config-audit.json");
  const noEnvBuild = await readJson("pipeline/manifests/live-production-no-env-build-results.json");
  const sampled = await readJson("pipeline/manifests/live-production-sampled-asset-check-results.json");
  const browser = await readJson("pipeline/manifests/live-production-browser-qa-results.json");
  const acceptance = await readJson("pipeline/manifests/live-production-acceptance-gate.json");

  assert.equal(configAudit.summary.publicSafeDefaultsPassed, true);
  assert.equal(configAudit.summary.uploadCredentialNamesInAppRuntime, false);
  assert.equal(noEnvBuild.summary.passed, true);
  assert.equal(noEnvBuild.summary.siteUrlDefaultUsed, true);
  assert.equal(noEnvBuild.summary.assetBaseDefaultUsed, true);
  assert.equal(noEnvBuild.summary.contactEmailDefaultUsed, true);
  assert.equal(sampled.summary.sampledRecords >= 150, true);
  assert.equal(sampled.summary.passed, true);
  assert.equal(sampled.summary.pngSubstituteUsed, false);
  assert.equal(browser.summary.svgUserDownloadAbsent, true);
  assert.equal(acceptance.ready_for_live_ads_round, false);
});

test("public-safe site config defaults do not require Netlify public env vars", async () => {
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const assets = await readText("src/lib/coloring/assets.ts");
  const netlify = await readText("netlify.toml");
  const envExample = await readText(".env.example");

  assert.match(siteConfig, new RegExp(escapeRegExp(SITE_URL)));
  assert.match(siteConfig, new RegExp(escapeRegExp(ASSET_BASE_URL)));
  assert.match(siteConfig, new RegExp(escapeRegExp(CONTACT_EMAIL)));
  assert.doesNotMatch(siteConfig, /LOCAL_SITE_URL\s*=\s*"http:\/\/localhost:3005"/);
  assert.match(assets, new RegExp(escapeRegExp(ASSET_BASE_URL)));
  assert.doesNotMatch(netlify, /Required Netlify environment variables:[\s\S]*NEXT_PUBLIC_SITE_URL/);
  assert.match(envExample, /Optional public overrides/i);
});

test("runtime boundaries remain frontend-only and credential-safe", async () => {
  const projectText = await readProjectText(["app", "src", "next.config.mjs", "netlify.toml"]);
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const nextConfig = await readText("next.config.mjs");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));

  assert.doesNotMatch(projectText, /R2_ACCOUNT_ID|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|CLOUDFLARE_R2_ACCESS_KEY_ID|CLOUDFLARE_R2_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(`${downloadMenu}\n${browserDownloads}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.match(nextConfig, /output:\s*"export"/);
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
    if ((await import("node:fs")).statSync(absoluteRoot).isFile()) {
      chunks.push(await readText(relativeRoot));
      continue;
    }
    for (const file of await listFilesIfExists(absoluteRoot)) {
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
