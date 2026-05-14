import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const REPO_ROOT = process.cwd();
const GENERATED_AT = new Date().toISOString();
const DATA_PATH = "pipeline/manifests/og-image-data.json";
const GENERATED_METADATA_PATH = "src/generated/coloring/og-images.json";
const PUBLIC_OG_ROOT = path.join(REPO_ROOT, "public", "og");
const WIDTH = 1200;
const HEIGHT = 630;
const CARD_BACKGROUND = "#f8f7fb";
const NAVY = "#17213f";
const MUTED = "#5b6175";
const ACCENT = "#9f4f67";
const CORAL = "#cc6d5a";
const FRAME = "#d9d2e3";
const WHITE = "#ffffff";

const args = parseArgs(process.argv.slice(2));

async function main() {
  const data = await readJson(DATA_PATH);
  if (args.clean) await rm(PUBLIC_OG_ROOT, { recursive: true, force: true });
  await mkdir(PUBLIC_OG_ROOT, { recursive: true });

  const selectedRoutes = typeof args.limit === "number" ? data.routes.slice(0, args.limit) : data.routes;
  const failures = [];
  const generated = [];

  for (const route of selectedRoutes) {
    try {
      const outputAbsolutePath = path.join(REPO_ROOT, route.outputPath);
      await mkdir(path.dirname(outputAbsolutePath), { recursive: true });
      await renderOgImage(route, outputAbsolutePath);
      const fileStat = await stat(outputAbsolutePath);
      generated.push({
        path: route.path,
        title: route.title,
        ogImagePath: route.ogImagePath,
        outputPath: route.outputPath,
        bytes: fileStat.size,
        previewAssetIds: route.previewItems.map((item) => item.assetId),
      });
    } catch (error) {
      failures.push({
        path: route.path,
        ogImagePath: route.ogImagePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const publicFiles = await listFilesIfExists(PUBLIC_OG_ROOT);
  const manifest = buildGeneratedMetadataManifest(data, generated, failures, publicFiles);
  await writeJson(GENERATED_METADATA_PATH, manifest);

  const buildResults = {
    generatedAt: GENERATED_AT,
    phase: "og-image",
    summary: {
      ogImagesCreated: failures.length === 0 && generated.length === selectedRoutes.length,
      expectedImageCount: data.summary.expectedImageCount,
      generatedImageCount: generated.length,
      failedRouteCount: failures.length,
      outputFormat: data.summary.outputFormat,
      width: data.summary.width,
      height: data.summary.height,
      cleanRun: args.clean,
      limitApplied: args.limit ?? null,
      publicOgFileCount: publicFiles.length,
      generatedMetadataPath: GENERATED_METADATA_PATH,
      outputRoot: "public/og",
    },
    generated,
    failures,
  };

  await writeJson("pipeline/manifests/og-image-build-results.json", buildResults);
  await writeText("pipeline/reports/og-image-build-report.md", renderBuildReport(buildResults));
  console.log(`Generated ${generated.length} OG image files with ${failures.length} failures.`);
  if (failures.length) process.exitCode = 1;
}

async function renderOgImage(route, outputPath) {
  const base = sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: CARD_BACKGROUND,
    },
  }).jpeg({ quality: 86, mozjpeg: true });

  const composites = [
    { input: Buffer.from(createBaseOverlaySvg(route)), top: 0, left: 0 },
  ];

  const framePositions = getFramePositions(route.previewItems.length);
  for (let index = 0; index < route.previewItems.length && index < framePositions.length; index += 1) {
    const item = route.previewItems[index];
    const frame = framePositions[index];
    composites.push({ input: Buffer.from(createFrameSvg(frame.width, frame.height)), top: frame.top, left: frame.left });

    const localPath = path.join(REPO_ROOT, item.localWebpPath);
    if (!existsSync(localPath)) continue;
    const image = await sharp(await readFile(localPath))
      .rotate()
      .flatten({ background: WHITE })
      .resize({
        width: frame.width - 34,
        height: frame.height - 34,
        fit: "inside",
        withoutEnlargement: true,
        background: WHITE,
      })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    const metadata = await sharp(image).metadata();
    const imageLeft = frame.left + Math.round((frame.width - (metadata.width || frame.width)) / 2);
    const imageTop = frame.top + Math.round((frame.height - (metadata.height || frame.height)) / 2);
    composites.push({ input: image, top: imageTop, left: imageLeft });
  }

  composites.push({ input: Buffer.from(createTopOverlaySvg(route)), top: 0, left: 0 });

  await base.composite(composites).jpeg({ quality: 86, mozjpeg: true }).toFile(outputPath);
}

function createBaseOverlaySvg(route) {
  const titleLines = wrapText(route.title, 18, 3);
  const subtitleLines = wrapText(route.subtitle || "Printable coloring pages", 42, 2);
  const descriptionLines = wrapText(route.description || "", 54, 2);
  const titleMarkup = titleLines.map((line, index) => `<tspan x="74" dy="${index === 0 ? 0 : 58}">${escapeXml(line)}</tspan>`).join("");
  const subtitleMarkup = subtitleLines.map((line, index) => `<tspan x="78" dy="${index === 0 ? 0 : 26}">${escapeXml(line)}</tspan>`).join("");
  const descriptionMarkup = descriptionLines.map((line, index) => `<tspan x="78" dy="${index === 0 ? 0 : 24}">${escapeXml(line)}</tspan>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${CARD_BACKGROUND}"/>
  <rect x="44" y="44" width="6" height="542" rx="3" fill="${ACCENT}"/>
  <circle cx="1032" cy="118" r="64" fill="#f1e8ee"/>
  <circle cx="1110" cy="512" r="42" fill="#f3ece4"/>
  <text x="74" y="98" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="${ACCENT}" letter-spacing="0">I Love Coloring Page</text>
  <text x="74" y="178" font-family="Georgia, 'Times New Roman', serif" font-size="${titleLines.length > 2 ? 54 : 60}" font-weight="700" fill="${NAVY}" letter-spacing="0">${titleMarkup}</text>
  <text x="78" y="${titleLines.length > 2 ? 372 : 338}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" fill="${CORAL}" letter-spacing="0">${subtitleMarkup}</text>
  <text x="78" y="${titleLines.length > 2 ? 450 : 414}" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${MUTED}" letter-spacing="0">${descriptionMarkup}</text>
  <text x="78" y="568" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="${NAVY}" letter-spacing="0">Printable pages with real gallery previews</text>
</svg>`;
}

function createTopOverlaySvg(route) {
  const previewLabel = route.assetCount ? `${Number(route.assetCount).toLocaleString()} pages` : "Printable pages";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect x="818" y="552" width="290" height="38" rx="19" fill="${WHITE}" stroke="${FRAME}" stroke-width="2"/>
  <text x="963" y="577" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="${NAVY}" letter-spacing="0">${escapeXml(previewLabel)}</text>
</svg>`;
}

function createFrameSvg(width, height) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="${WHITE}" stroke="${FRAME}" stroke-width="3"/>
  <rect x="11" y="11" width="${width - 22}" height="${height - 22}" rx="9" fill="${WHITE}" stroke="#ebe7f1" stroke-width="1"/>
</svg>`;
}

function getFramePositions(count) {
  const all = [
    { left: 610, top: 58, width: 184, height: 238 },
    { left: 820, top: 42, width: 190, height: 252 },
    { left: 1032, top: 68, width: 138, height: 220 },
    { left: 675, top: 334, width: 186, height: 238 },
    { left: 888, top: 316, width: 190, height: 252 },
  ];
  if (count <= 3) return [all[0], all[1], all[3]];
  return all;
}

function buildGeneratedMetadataManifest(data, generated, failures, publicFiles) {
  const generatedByOutput = new Map(generated.map((entry) => [entry.outputPath, entry]));
  const routes = data.routes.map((route) => ({
    path: route.path,
    id: route.id,
    kind: route.kind,
    slug: route.slug,
    hubId: route.hubId,
    title: route.title,
    description: route.description,
    canonicalUrl: route.canonicalUrl,
    ogImagePath: route.ogImagePath,
    ogImageUrl: route.ogImageUrl,
    width: route.width,
    height: route.height,
    alt: route.alt,
    outputPath: route.outputPath,
    generated: generatedByOutput.has(route.outputPath),
  }));

  const metadataByPath = {};
  for (const route of routes) {
    if (route.kind === "hubRootMirror") continue;
    metadataByPath[route.path] = {
      title: route.title,
      description: route.description,
      canonicalUrl: route.canonicalUrl,
      ogImagePath: route.ogImagePath,
      ogImageUrl: route.ogImageUrl,
      width: route.width,
      height: route.height,
      alt: route.alt,
    };
  }

  return {
    generatedAt: GENERATED_AT,
    phase: "og-image",
    summary: {
      expectedImageCount: data.summary.expectedImageCount,
      generatedImageCount: generated.length,
      metadataRouteCount: Object.keys(metadataByPath).length,
      failedRouteCount: failures.length,
      publicOgFileCount: publicFiles.length,
      width: WIDTH,
      height: HEIGHT,
      format: "jpg",
      routeLevelOnly: true,
      perImageRoutesCreated: false,
    },
    defaults: {
      siteName: "I Love Coloring Page",
      fallbackPath: "/og/home.jpg",
      fallbackUrl: "https://www.ilovecoloringpage.com/og/home.jpg",
      width: WIDTH,
      height: HEIGHT,
      alt: "I Love Coloring Page social preview image",
    },
    metadataByPath,
    routes,
  };
}

function renderBuildReport(payload) {
  const examples = payload.generated
    .filter((entry) => ["/", "/coloring-pages", "/coloring-pages/t-rex", "/coloring-pages/dragons"].includes(entry.path))
    .map((entry) => `- ${entry.path}: ${entry.outputPath} (${entry.bytes.toLocaleString()} bytes)`);

  return [
    "# OG Image Build Report",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `- OG images created: ${payload.summary.ogImagesCreated}`,
    `- Expected image count: ${payload.summary.expectedImageCount}`,
    `- Generated image count: ${payload.summary.generatedImageCount}`,
    `- Failed route count: ${payload.summary.failedRouteCount}`,
    `- Output format: ${payload.summary.outputFormat.toUpperCase()}`,
    `- Dimensions: ${payload.summary.width} x ${payload.summary.height}`,
    `- Output root: ${payload.summary.outputRoot}`,
    `- Generated metadata path: ${payload.summary.generatedMetadataPath}`,
    "",
    "## Sample Files",
    "",
    ...examples,
    "",
    "## Failures",
    "",
    ...(payload.failures.length ? payload.failures.map((failure) => `- ${failure.path}: ${failure.message}`) : ["- None"]),
  ].join("\n");
}

function wrapText(value, maxChars, maxLines) {
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (words.join(" ").length > lines.join(" ").length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = `${last.replace(/[.,;:!?]+$/, "")}...`;
  }

  return lines.length ? lines : ["Printable Coloring Pages"];
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseArgs(argv) {
  const parsed = { clean: false, limit: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--clean") parsed.clean = true;
    else if (arg === "--limit") parsed.limit = Number.parseInt(argv[++index] || "", 10);
    else if (arg.startsWith("--limit=")) parsed.limit = Number.parseInt(arg.split("=")[1] || "", 10);
  }
  if (!Number.isFinite(parsed.limit)) parsed.limit = null;
  return parsed;
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

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

await main();
