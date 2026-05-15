import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = process.cwd();

test("side rail placeholders render in compact wide desktop range without changing ad surfaces", async () => {
  const css = await readText("src/styles/components.css");
  const adRail = await readText("src/components/ads/AdRail.tsx");
  const adSlot = await readText("src/components/ads/AdSlot.tsx");
  const forbiddenSurfaces = await readProjectText([
    "src/components/site/SiteHeader.tsx",
    "src/components/site/MoreHubMenu.tsx",
    "src/components/site/MobileNav.tsx",
    "src/components/coloring/ImageCard.tsx",
    "src/components/coloring/GalleryGrid.tsx",
  ]);

  assert.match(css, /--ad-wide-min-viewport:\s*1740px/);
  assert.match(css, /--ad-rail-compact-min-viewport:\s*1536px/);
  assert.match(css, /@media \(min-width:\s*1536px\) and \(max-width:\s*1739px\)[\s\S]*\.ad-rail[\s\S]*display:\s*block/);
  assert.match(css, /--ad-rail-width:\s*clamp\(120px,\s*calc\(\(100vw - var\(--layout-max\)\) \/ 2 - var\(--ad-rail-gap\)\),\s*160px\)/);
  assert.match(css, /@media \(max-width:\s*1739px\)[\s\S]*\.ad-rail[\s\S]*display:\s*none/);
  assert.match(css, /@media \(min-width:\s*1740px\)[\s\S]*\.ad-rail[\s\S]*display:\s*block/);
  assert.match(adRail, /ad-rail-left/);
  assert.match(adRail, /ad-rail-right/);
  assert.match(adSlot, /aria-label="Advertisement"/);
  assert.doesNotMatch(forbiddenSurfaces, /AdSlot|AdRail|data-ad-placeholder|Advertisement|adsbygoogle|ca-pub-/i);
});

test("project boundaries remain intact for ad rail fix", async () => {
  const source = await readProjectText(["app", "src"]);
  const nextConfig = await readText("next.config.mjs");

  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.doesNotMatch(source, /Download SVG|SVG download|downloadSvg/i);
  assert.match(source, /Download PNG/);
  assert.match(source, /Download JPG/);
  assert.match(source, /Download WebP/);
  assert.doesNotMatch(source, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
});

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function readProjectText(relativeRoots) {
  const { readdir, stat } = await import("node:fs/promises");
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const root = path.join(REPO_ROOT, relativeRoot);
    if (!existsSync(root)) continue;
    const rootStat = await stat(root);
    if (rootStat.isFile()) {
      chunks.push(await readFile(root, "utf8"));
      continue;
    }
    for (const filePath of await walk(root)) {
      if (/\.(tsx?|jsx?|css|mjs|cjs|json)$/.test(filePath)) chunks.push(await readFile(filePath, "utf8"));
    }
  }
  return chunks.join("\n");

  async function walk(directory) {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".next", "out"].includes(entry.name)) continue;
        files.push(...(await walk(absolute)));
      } else if ((await stat(absolute)).isFile()) {
        files.push(absolute);
      }
    }
    return files;
  }
}
