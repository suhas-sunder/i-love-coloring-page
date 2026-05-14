import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const REPO_ROOT = process.cwd();
const GENERATED_AT = new Date().toISOString();
const WIDTH = 1200;
const HEIGHT = 630;
const SITE_URL = "https://www.ilovecoloringpage.com";

async function main() {
  const data = await readJson("pipeline/manifests/og-image-data.json");
  const build = await readJson("pipeline/manifests/og-image-build-results.json");
  const generated = await readJson("src/generated/coloring/og-images.json");
  const publicOgFiles = await listFilesIfExists(path.join(REPO_ROOT, "public", "og"));
  const sourceText = await readProjectText(["app", "src"], { excludeGenerated: true });

  const expectedOutputPaths = new Set(data.routes.map((route) => normalizePath(route.outputPath)));
  const foundOutputPaths = new Set(publicOgFiles.map(normalizePath));
  const missing = [...expectedOutputPaths].filter((file) => !foundOutputPaths.has(file));
  const unexpected = [...foundOutputPaths].filter((file) => !expectedOutputPaths.has(file));
  const invalid = [];
  const sizeRecords = [];

  for (const relativePath of publicOgFiles) {
    const normalized = normalizePath(relativePath);
    try {
      const absolutePath = path.join(REPO_ROOT, normalized);
      const metadata = await sharp(absolutePath).metadata();
      const fileStat = await stat(absolutePath);
      sizeRecords.push({ path: normalized, bytes: fileStat.size, width: metadata.width, height: metadata.height, format: metadata.format });
      if (metadata.width !== WIDTH || metadata.height !== HEIGHT || metadata.format !== "jpeg" || fileStat.size <= 0) {
        invalid.push({ path: normalized, reason: "invalid_dimensions_format_or_size", metadata, bytes: fileStat.size });
      }
      if (!normalized.startsWith("public/og/")) invalid.push({ path: normalized, reason: "outside_public_og" });
      if (/\.svg$/i.test(normalized)) invalid.push({ path: normalized, reason: "svg_output" });
    } catch (error) {
      invalid.push({ path: normalized, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const allSerialized = JSON.stringify({ data, build, generated, publicOgFiles });
  const metadataResults = buildMetadataResults(generated, sourceText);
  const validation = {
    generatedAt: GENERATED_AT,
    phase: "og-image",
    summary: {
      validationPassed:
        missing.length === 0 &&
        unexpected.length === 0 &&
        invalid.length === 0 &&
        generated.summary.generatedImageCount === data.summary.expectedImageCount &&
        !/localhost|127\.0\.0\.1/i.test(allSerialized) &&
        !/r2\.dev/i.test(allSerialized),
      expectedImageCount: data.summary.expectedImageCount,
      generatedImageCount: publicOgFiles.length,
      missingImageCount: missing.length,
      invalidImageCount: invalid.length,
      unexpectedImageCount: unexpected.length,
      width: WIDTH,
      height: HEIGHT,
      noSvgOutput: publicOgFiles.every((file) => !/\.svg$/i.test(file)),
      noPathsOutsidePublicOg: publicOgFiles.every((file) => normalizePath(file).startsWith("public/og/")),
      noLocalhostReferences: !/localhost|127\.0\.0\.1/i.test(allSerialized),
      noR2DevReferences: !/r2\.dev/i.test(allSerialized),
      noGeneratedImageCountExplosion: publicOgFiles.length === data.summary.expectedImageCount,
      maxFileSizeBytes: Math.max(...sizeRecords.map((record) => record.bytes), 0),
      averageFileSizeBytes: Math.round(sizeRecords.reduce((sum, record) => sum + record.bytes, 0) / Math.max(sizeRecords.length, 1)),
    },
    missing,
    unexpected,
    invalid,
    sizeRecords,
  };

  await writeJson("pipeline/manifests/og-image-validation-results.json", validation);
  await writeText("pipeline/reports/og-image-validation-report.md", renderValidationReport(validation));
  await writeJson("pipeline/manifests/og-image-metadata-results.json", metadataResults);
  await writeText("pipeline/reports/og-image-metadata-report.md", renderMetadataReport(metadataResults));
  console.log(`Validated ${publicOgFiles.length} OG files with ${invalid.length} invalid files and ${missing.length} missing files.`);
  if (!validation.summary.validationPassed || !metadataResults.summary.metadataUpdated) process.exitCode = 1;
}

function buildMetadataResults(generated, sourceText) {
  const metadataByPath = generated.metadataByPath || {};
  const routes = generated.routes || [];
  const nonMirrorHubRoutes = routes.filter((route) => route.kind === "hub");
  const allHubRoutesReferenceOgImages = nonMirrorHubRoutes.every((route) => metadataByPath[route.path]?.ogImagePath === route.ogImagePath);
  const serialized = JSON.stringify(generated);

  return {
    generatedAt: GENERATED_AT,
    phase: "og-image",
    summary: {
      metadataUpdated: /ogImagesJson/.test(sourceText) && /summary_large_image/.test(sourceText),
      homepageReferencesOgImage: metadataByPath["/"]?.ogImagePath === "/og/home.jpg",
      coloringPagesReferencesOgImage: metadataByPath["/coloring-pages"]?.ogImagePath === "/og/coloring-pages.jpg",
      allHubRoutesReferenceOgImages,
      routeMetadataCount: Object.keys(metadataByPath).length,
      twitterLargeImageCardConfigured: /summary_large_image/.test(sourceText),
      openGraphImagesConfigured: /images:\s*\[/.test(sourceText) || /images:\s*ogImage/.test(sourceText),
      metadataBaseUsesWww: sourceText.includes(SITE_URL),
      noLocalhostInMetadata: !/localhost|127\.0\.0\.1/i.test(serialized),
      noR2DevInMetadata: !/r2\.dev/i.test(serialized),
      noSvgImageReferences: !/\.svg/i.test(serialized),
      perImagePageMetadataCreated: false,
      staticExportCompatible: true,
    },
    sampledRoutes: ["/", "/coloring-pages", "/coloring-pages/t-rex", "/coloring-pages/dragons", "/coloring-pages/christmas"].map((routePath) => ({
      path: routePath,
      metadata: metadataByPath[routePath] || null,
    })),
  };
}

function renderValidationReport(payload) {
  return [
    "# OG Image Validation Report",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `- Validation passed: ${payload.summary.validationPassed}`,
    `- Expected image count: ${payload.summary.expectedImageCount}`,
    `- Generated image count: ${payload.summary.generatedImageCount}`,
    `- Missing images: ${payload.summary.missingImageCount}`,
    `- Invalid images: ${payload.summary.invalidImageCount}`,
    `- Unexpected images: ${payload.summary.unexpectedImageCount}`,
    `- Dimensions: ${payload.summary.width} x ${payload.summary.height}`,
    `- No SVG output: ${payload.summary.noSvgOutput}`,
    `- No localhost references: ${payload.summary.noLocalhostReferences}`,
    `- No r2.dev references: ${payload.summary.noR2DevReferences}`,
    `- Max file size: ${payload.summary.maxFileSizeBytes.toLocaleString()} bytes`,
    `- Average file size: ${payload.summary.averageFileSizeBytes.toLocaleString()} bytes`,
    "",
    "## Invalid Files",
    "",
    ...(payload.invalid.length ? payload.invalid.map((entry) => `- ${entry.path}: ${entry.reason}`) : ["- None"]),
  ].join("\n");
}

function renderMetadataReport(payload) {
  return [
    "# OG Image Metadata Report",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `- Metadata updated: ${payload.summary.metadataUpdated}`,
    `- Homepage OG image: ${payload.summary.homepageReferencesOgImage}`,
    `- /coloring-pages OG image: ${payload.summary.coloringPagesReferencesOgImage}`,
    `- Hub route OG images: ${payload.summary.allHubRoutesReferenceOgImages}`,
    `- Route metadata count: ${payload.summary.routeMetadataCount}`,
    `- Twitter summary large image configured: ${payload.summary.twitterLargeImageCardConfigured}`,
    `- No localhost in metadata: ${payload.summary.noLocalhostInMetadata}`,
    `- No r2.dev in metadata: ${payload.summary.noR2DevInMetadata}`,
    `- No SVG image references: ${payload.summary.noSvgImageReferences}`,
    "",
    "## Sample Routes",
    "",
    ...payload.sampledRoutes.map((entry) => `- ${entry.path}: ${entry.metadata?.ogImagePath || "missing"}`),
  ].join("\n");
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${value.trimEnd()}\n`);
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root)];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results.map(normalizePath);
}

async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      const normalized = normalizePath(file);
      if (!/\.(?:ts|tsx|css|json|mjs)$/.test(normalized)) continue;
      if (options.excludeGenerated && normalized.startsWith("src/generated/")) continue;
      chunks.push(await readFile(path.join(REPO_ROOT, normalized), "utf8"));
    }
  }
  return chunks.join("\n");
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

await main();
