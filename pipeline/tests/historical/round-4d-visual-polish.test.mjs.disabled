import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const ROUND4D_MANIFESTS = [
  "pipeline/manifests/round-4d-visual-qa-findings.json",
  "pipeline/manifests/round-4d-page-polish-actions.json",
];

const ALLOWED_HEX_FILES = new Set([normalizePath("src/styles/tokens.css")]);

test("Round 4D manifests parse and record browser visual QA", async () => {
  for (const manifestPath of ROUND4D_MANIFESTS) {
    const manifest = await readJson(manifestPath);
    assert.equal(manifest.runId, "round-4d-public-gallery-visual-polish", manifestPath);
  }

  const findings = await readJson("pipeline/manifests/round-4d-visual-qa-findings.json");
  assert.equal(findings.preview.port, 3009);
  assert.equal(findings.summary.pagesInspected, 16);
  assert.equal(findings.summary.viewportPasses, 48);
  assert.equal(findings.summary.finalHorizontalOverflowCount, 0);
  assert.equal(findings.summary.finalBrokenMediaCount, 0);
  assert.equal(findings.summary.sitemapRouteCount, 65);
  assert.ok(findings.screenshotPolicy.ignoredByGit);
});

test("Round 4D visual constraints remain enforced in CSS and source files", async () => {
  const cssFiles = [
    ...await listFiles(path.join(REPO_ROOT, "app"), [".css"]),
    ...await listFiles(path.join(REPO_ROOT, "src"), [".css"]),
  ];

  for (const cssFile of cssFiles) {
    const relative = normalizePath(path.relative(REPO_ROOT, cssFile));
    const css = await readFile(cssFile, "utf8");
    assert.doesNotMatch(css, /linear-gradient|radial-gradient/i, relative);

    for (const declaration of collectDeclarations(css, "box-shadow")) {
      assert.match(declaration.value, /^none$|^var\(--shadow-button/, `${relative}: ${declaration.selector}`);
      assert.match(declaration.selector, /\.button|:focus-visible/, `${relative}: ${declaration.selector}`);
    }

    for (const declaration of collectDeclarations(css, "border")) {
      assert.match(declaration.value, /^0$|^none$/, `${relative}: ${declaration.selector}`);
    }

    for (const declaration of collectDeclarations(css, "outline")) {
      assert.match(declaration.selector, /:focus-visible/, `${relative}: ${declaration.selector}`);
      assert.doesNotMatch(declaration.value, /^none$/, `${relative}: ${declaration.selector}`);
    }
  }

  const sourceFiles = [
    ...await listFiles(path.join(REPO_ROOT, "app"), [".ts", ".tsx", ".css"]),
    ...await listFiles(path.join(REPO_ROOT, "src"), [".ts", ".tsx", ".css"]),
  ];

  for (const file of sourceFiles) {
    const relative = normalizePath(path.relative(REPO_ROOT, file));
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+url\([^)]*font/i, relative);
    if (!ALLOWED_HEX_FILES.has(relative)) {
      assert.doesNotMatch(text, /#[0-9a-f]{3,8}\b/i, relative);
    }
  }
});

test("focus-visible, governed buttons, and compact gallery actions remain present", async () => {
  const componentsCss = await readText("src/styles/components.css");
  const buttonSource = await readText("src/components/ui/Button.tsx");
  const imageCardSource = await readText("src/components/coloring/ImageCard.tsx");

  assert.match(componentsCss, /:focus-visible/);
  assert.match(componentsCss, /\.button[\s\S]*cursor:\s*pointer/);
  assert.match(componentsCss, /\.button-primary/);
  assert.match(componentsCss, /\.button-secondary/);
  assert.match(componentsCss, /\.button-ghost/);
  assert.match(componentsCss, /\.button-subtle/);
  assert.match(buttonSource, /"primary" \| "secondary" \| "ghost" \| "subtle"/);
  assert.match(imageCardSource, /aria-label=\{`Download /);
  assert.doesNotMatch(imageCardSource, />\s*PNG\s*</);
  assert.doesNotMatch(imageCardSource, />\s*SVG\s*</);
  assert.match(imageCardSource, /Print/);
});

test("asset resolver remains centralized and frontend-only after Round 4F", async () => {
  const assetsSource = await readText("src/lib/coloring/assets.ts");

  assert.match(assetsSource, /NEXT_PUBLIC_COLORING_ASSET_BASE_URL/);
  assert.doesNotMatch(assetsSource, /NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY|\/api\/coloring-assets/);

  const sourceFiles = [
    ...await listFiles(path.join(REPO_ROOT, "app"), [".ts", ".tsx"]),
    ...await listFiles(path.join(REPO_ROOT, "src"), [".ts", ".tsx"]),
  ];

  for (const file of sourceFiles) {
    const relative = normalizePath(path.relative(REPO_ROOT, file));
    const text = await readFile(file, "utf8");
    if (relative !== "src/lib/coloring/assets.ts") {
      assert.doesNotMatch(text, /NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY|COLORING_ENABLE_LOCAL_ASSET_PROXY|\/api\/coloring-assets/, relative);
    }
  }
});

test("gallery routes, sitemap count, Phase 1 scope, and no per-image pages are preserved", async () => {
  const hubs = await readJson("src/generated/coloring/hubs.json");
  const items = await readJson("src/generated/coloring/items.json");
  const routes = await readJson("src/generated/coloring/routes.json");
  const sitemap = await readJson("src/generated/coloring/site-map.json");

  assert.equal(hubs.summary.phase1Only, true);
  assert.equal(hubs.summary.noPerImageRoutes, true);
  assert.equal(items.summary.itemCount, 6557);
  assert.equal(items.summary.noSourceImagePathsInClientData, true);
  assert.equal(routes.routes.length, 65);
  assert.equal(routes.phase2RoutesExcluded, true);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(sitemap.entries.length, 65);
  assert.equal(routes.routes.some((route) => /\/image\/|\[assetId\]|\[image/.test(route.path)), false);

  const appFiles = await listFiles(path.join(REPO_ROOT, "app"), [".ts", ".tsx"]);
  const relativeAppFiles = appFiles.map((file) => normalizePath(path.relative(REPO_ROOT, file)));
  assert.equal(relativeAppFiles.some((file) => /\/\[assetId\]\/|\/\[image/.test(file)), false);
  assert.equal(relativeAppFiles.some((file) => /\/image\//.test(file)), false);

  for (const hub of hubs.hubs.filter((hub) => hub.assetCount > 500)) {
    assert.ok(hub.galleryPageSize <= 60, hub.slug);
    assert.ok(hub.previewAssetIds.length <= hub.galleryPageSize, hub.slug);
  }
});

test("source images are unchanged and production assets are not copied into public", async () => {
  const inventory = await readJson("pipeline/manifests/image-inventory.json");
  for (const entry of inventory.entries) {
    const sourceStat = await stat(path.join(REPO_ROOT, ...entry.sourceRelativePath.split("/")));
    assert.equal(Number(sourceStat.size), Number(entry.fileSizeBytes), entry.sourceRelativePath);
  }

  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  assert.equal(publicFiles.some((file) => /pipeline[\\/]+production/i.test(file)), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);
});

test("Round 4D screenshots stay local review artifacts", async () => {
  const gitignore = await readText(".gitignore");
  assert.match(gitignore, /pipeline\/review\/\*\*/);
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFiles(root, extensions) {
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if ([".git", ".next", "node_modules", "images", "ilovesvg"].includes(entry.name)) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (extensions.includes(path.extname(entry.name))) {
        results.push(entryPath);
      }
    }
  }
  await walk(root);
  return results;
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }
  return (await listFiles(root, [".png", ".svg", ".jpg", ".jpeg", ".webp", ".json"])).map((file) => path.relative(root, file));
}

function collectDeclarations(css, property) {
  const declarations = [];
  const escapedProperty = escapeRegExp(property);
  for (const block of css.split("}")) {
    const [selectorPart, body = ""] = block.split("{");
    if (!selectorPart || !body) continue;
    const selector = selectorPart.trim();
    const regex = new RegExp(`(^|;)\\s*${escapedProperty}\\s*:\\s*([^;]+)`, "gi");
    let match;
    while ((match = regex.exec(body))) {
      declarations.push({ selector, value: match[2].trim() });
    }
  }
  return declarations;
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
