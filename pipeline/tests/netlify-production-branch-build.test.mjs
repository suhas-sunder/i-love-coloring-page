import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = process.cwd();
const REQUIRED_MANIFESTS = [
  "pipeline/manifests/netlify-branch-fix-context-check.json",
  "pipeline/manifests/netlify-branch-fix-version4-validation.json",
  "pipeline/manifests/netlify-branch-fix-version1-audit.json",
  "pipeline/manifests/netlify-branch-fix-merge-results.json",
  "pipeline/manifests/netlify-branch-fix-version1-validation.json",
  "pipeline/manifests/netlify-branch-fix-netlify-config.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/netlify-branch-fix-context-check.md",
  "pipeline/reports/netlify-branch-fix-version4-validation.md",
  "pipeline/reports/netlify-branch-fix-version1-audit.md",
  "pipeline/reports/netlify-branch-fix-merge-results.md",
  "pipeline/reports/netlify-branch-fix-version1-validation.md",
  "pipeline/reports/netlify-branch-fix-netlify-config.md",
];

test("Netlify branch-fix manifests and reports exist and parse", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    JSON.parse(await readText(relativePath));
  }

  for (const relativePath of REQUIRED_REPORTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    assert.ok((await readText(relativePath)).trim().length > 0, `${relativePath} should not be empty`);
  }
});

test("Netlify production branch build shape is static export and frontend-only", async () => {
  const nextConfig = await readText("next.config.mjs");
  const netlifyToml = await readText("netlify.toml");
  const packageJson = await readJson("package.json");
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const assetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const siteIdentity = await readText("src/config/siteIdentity.ts");
  const assets = await readText("src/lib/coloring/assets.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const projectText = await readProjectText(["app", "src", "next.config.mjs", "netlify.toml"]);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));

  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(netlifyToml, /command\s*=\s*"npm run build"/);
  assert.match(netlifyToml, /publish\s*=\s*"out"/);
  assert.match(packageJson.scripts?.build, /next build/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "sitemap.ts")), true);
  assert.equal(available.summary.itemCount, 6352);
  assert.equal(assetPaths.summary.recordCount, 6352);
  assert.match(siteIdentity, /https:\/\/www\.ilovecoloringpage\.com/);
  assert.match(siteConfig, /https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages/);
  assert.match(siteIdentity, /admin@ilovecoloringpage\.com/);
  assert.match(siteConfig, /import \{ siteIdentity \}/);
  assert.match(assets, /https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages/);
  assert.doesNotMatch(siteConfig, /throw new Error|process\.exit/);
  assert.doesNotMatch(`${downloadMenu}\n${browserDownloads}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.match(`${downloadMenu}\n${browserDownloads}`, /label:\s*"PNG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"png"/);
  assert.match(`${downloadMenu}\n${browserDownloads}`, /label:\s*"JPG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"jpg"/);
  assert.match(`${downloadMenu}\n${browserDownloads}`, /label:\s*"WebP"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"webp"/);
  assert.doesNotMatch(projectText, /opengraph-image|twitter-image|ImageResponse/i);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)), false);
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

  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push(path.relative(REPO_ROOT, absolute).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return files;
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
