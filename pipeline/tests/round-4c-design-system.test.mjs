import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const ROUND4C_MANIFESTS = [
  "pipeline/manifests/round-4c-current-ui-audit.json",
  "pipeline/manifests/round-4c-design-system.json",
  "pipeline/manifests/round-4c-typography.json",
  "pipeline/manifests/round-4c-component-rules.json",
];

const EXPECTED_STYLE_FILES = [
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/styles/layout.css",
  "src/styles/components.css",
];

const ALLOWED_HEX_FILES = new Set([
  normalizePath("src/styles/tokens.css"),
]);

test("Round 4C JSON manifests parse and lock the Indigo Paper source of truth", async () => {
  const manifests = {};
  for (const manifestPath of ROUND4C_MANIFESTS) {
    manifests[manifestPath] = await readJson(manifestPath);
    assert.equal(manifests[manifestPath].runId, "round-4c-public-gallery-visual-system", manifestPath);
  }

  const designSystem = manifests["pipeline/manifests/round-4c-design-system.json"];
  const componentRules = manifests["pipeline/manifests/round-4c-component-rules.json"];

  assert.equal(designSystem.name, "Indigo Paper");
  assert.equal(designSystem.colors.canvas, "#FBFAF7");
  assert.equal(designSystem.colors.ink, "#1B1F3B");
  assert.equal(designSystem.effects.gradients, "forbidden");
  assert.equal(designSystem.effects.focusVisibleOutline, "required");
  assert.deepEqual(componentRules.buttonVariants, ["primary", "secondary", "ghost", "subtle", "disabled"]);
  assert.ok(componentRules.forbiddenPatterns.includes("nested cards"));
});

test("design-system style files exist and expose expected token families", async () => {
  for (const styleFile of EXPECTED_STYLE_FILES) {
    await access(path.join(REPO_ROOT, styleFile));
  }

  const tokens = await readText("src/styles/tokens.css");
  for (const token of [
    "--color-canvas",
    "--color-surface",
    "--color-surface-strong",
    "--color-ink",
    "--color-text",
    "--color-text-muted",
    "--color-primary",
    "--color-secondary",
    "--color-accent",
    "--color-focus",
    "--font-ui",
    "--font-display",
    "--space-4",
    "--space-8",
    "--space-128",
    "--radius-sm",
    "--radius-pill",
    "--shadow-button",
  ]) {
    assert.match(tokens, new RegExp(escapeRegExp(token)), token);
  }
});

test("Google fonts are configured through next/font/google without runtime font CSS", async () => {
  const layout = await readText("app/layout.tsx");
  const typography = await readJson("pipeline/manifests/round-4c-typography.json");

  assert.match(layout, /next\/font\/google/);
  assert.match(layout, /\bFigtree\b/);
  assert.match(layout, /--font-figtree/);

  const frauncesDocumentedUnused = typography.fonts.display?.intentionallyUnused === true;
  assert.ok(/\bFraunces\b/.test(layout) || frauncesDocumentedUnused, "Fraunces must be configured or explicitly documented as unused");
  if (!frauncesDocumentedUnused) {
    assert.match(layout, /--font-fraunces/);
  }

  const sourceFiles = await listFiles(path.join(REPO_ROOT, "app"), [".ts", ".tsx", ".css"]);
  sourceFiles.push(...await listFiles(path.join(REPO_ROOT, "src"), [".ts", ".tsx", ".css"]));
  for (const file of sourceFiles) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+url\([^)]*font/i, path.relative(REPO_ROOT, file));
  }
});

test("CSS avoids gradients and unmanaged color, border, outline, and shadow patterns", async () => {
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
      assert.match(declaration.selector, /\.button|\.gallery-action|:focus-visible/, `${relative}: ${declaration.selector}`);
    }

    for (const declaration of collectDeclarations(css, "border")) {
      assert.match(declaration.value, /^0$|^none$/, `${relative}: ${declaration.selector}`);
    }

    for (const declaration of collectDeclarations(css, "outline")) {
      assert.match(declaration.selector, /:focus-visible/, `${relative}: ${declaration.selector}`);
      assert.doesNotMatch(declaration.value, /^none$/, `${relative}: ${declaration.selector}`);
    }
  }

  const scannedFiles = [
    ...await listFiles(path.join(REPO_ROOT, "app"), [".ts", ".tsx", ".css"]),
    ...await listFiles(path.join(REPO_ROOT, "src"), [".ts", ".tsx", ".css"]),
  ];

  for (const file of scannedFiles) {
    const relative = normalizePath(path.relative(REPO_ROOT, file));
    if (ALLOWED_HEX_FILES.has(relative)) continue;
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /#[0-9a-f]{3,8}\b/i, relative);
  }
});

test("button and interactive styles expose governed variants, hover, and focus-visible states", async () => {
  const buttonSource = await readText("src/components/ui/Button.tsx");
  const componentsCss = await readText("src/styles/components.css");

  for (const variant of ["primary", "secondary", "ghost", "subtle"]) {
    assert.match(buttonSource, new RegExp(`"${variant}"`), variant);
    assert.match(componentsCss, new RegExp(`\\.button-${variant}\\b`), variant);
  }

  assert.match(componentsCss, /\.button[\s\S]*cursor:\s*pointer/);
  assert.match(componentsCss, /:hover/);
  assert.match(componentsCss, /:focus-visible/);
  assert.match(componentsCss, /\.button-disabled|\.button:disabled/);
});

test("public-facing copy avoids internal pipeline wording", async () => {
  const sourceFiles = [
    "app/page.tsx",
    "app/coloring-pages/page.tsx",
    "app/coloring-pages/[hubSlug]/page.tsx",
    "src/components/coloring/GalleryGrid.tsx",
    "src/components/coloring/HubHero.tsx",
  ];
  const forbiddenVisiblePhrases = [
    "approved production metadata",
    "approved gallery data",
    "approved pages",
    "hub-based",
    "public hubs",
    "View all hubs",
    "Try another hub",
    "indexable image detail",
    "No image detail pages",
    "route stays focused",
  ];

  for (const sourceFile of sourceFiles) {
    const text = await readText(sourceFile);
    for (const phrase of forbiddenVisiblePhrases) {
      assert.equal(text.includes(phrase), false, `${sourceFile}: ${phrase}`);
    }
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

test("gallery routes, generated data, and no per-image-page behavior are preserved", async () => {
  const hubs = await readJson("src/generated/coloring/hubs.json");
  const items = await readJson("src/generated/coloring/items.json");
  const routes = await readJson("src/generated/coloring/routes.json");

  assert.equal(hubs.summary.phase1Only, true);
  assert.equal(hubs.summary.noPerImageRoutes, true);
  assert.equal(items.summary.itemCount, 6557);
  assert.equal(items.summary.noSourceImagePathsInClientData, true);
  assert.equal(routes.rootRoute, "/coloring-pages");
  assert.equal(routes.routePattern, "/coloring-pages/[hubSlug]");
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(routes.phase2RoutesExcluded, true);
  assert.equal(routes.routes.some((route) => /\/image\/|\[assetId\]|\[image/.test(route.path)), false);

  const appFiles = await listFiles(path.join(REPO_ROOT, "app"), [".ts", ".tsx"]);
  const relativeAppFiles = appFiles.map((file) => normalizePath(path.relative(REPO_ROOT, file)));
  assert.equal(relativeAppFiles.some((file) => /\/\[assetId\]\/|\/\[image/.test(file)), false);
  assert.equal(relativeAppFiles.some((file) => /\/image\//.test(file)), false);

  const largeHub = hubs.hubs.find((hub) => hub.assetCount > 500);
  assert.ok(largeHub, "expected at least one large hub");
  assert.ok(largeHub.galleryPageSize <= 60, largeHub.slug);
  assert.ok(largeHub.previewAssetIds.length <= largeHub.galleryPageSize, largeHub.slug);
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
