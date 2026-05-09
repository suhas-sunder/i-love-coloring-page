import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const SOURCE_IMAGES_DIR = path.join(REPO_ROOT, "images");
const ILOVE_SVG_DIR = path.join(REPO_ROOT, "ilovesvg");
const PIPELINE_DIR = path.join(REPO_ROOT, "pipeline");
const MANIFEST_DIR = path.join(PIPELINE_DIR, "manifests");
const REPORT_DIR = path.join(PIPELINE_DIR, "reports");

const REQUIRED_PIPELINE_DIRS = [
  "pipeline/manifests",
  "pipeline/reports",
  "pipeline/samples",
  "pipeline/bakeoffs",
  "pipeline/review/anatomy",
  "pipeline/review/conversion",
  "pipeline/review/duplicates",
  "pipeline/review/manual-signoff",
  "pipeline/production/assets",
  "pipeline/production/thumbs",
  "pipeline/production/data",
];

const HUMAN_ADJACENT_TERMS = [
  "anime",
  "girl",
  "girls",
  "boy",
  "boys",
  "chibi",
  "people",
  "person",
  "human",
  "portrait",
  "princess",
  "fairy",
  "fairies",
  "mermaid",
  "superhero",
  "hero",
  "character",
  "humanoid",
  "doll",
  "witch",
  "wizard",
  "angel",
  "elf",
  "elves",
  "gnome",
  "medieval",
  "midieval",
  "fantasy",
  "mythology",
  "horror",
];

const ROUTE_PRESET_FILE_TERMS = [
  "png-to-svg",
  "transparent-png-to-svg",
  "black-and-white-png",
  "black-and-white-image",
  "line-art",
  "drawing",
  "sketch",
  "scan",
  "outline",
  "photo-to-svg-outline",
];

const RELEVANT_PRESET_TERMS = [
  "line",
  "lineart",
  "line-art",
  "drawing",
  "draw",
  "sketch",
  "scan",
  "scanned",
  "outline",
  "stroke",
  "centerline",
  "black-and-white",
  "bw",
  "ink",
  "pencil",
  "clean",
  "thin",
  "thick",
  "cartoon",
  "technical",
  "diagram",
  "coloring",
  "png",
];

const SETTINGS_KEYS = [
  "traceMode",
  "strokeOutputMode",
  "preprocess",
  "threshold",
  "turdSize",
  "optTolerance",
  "turnPolicy",
  "blurSigma",
  "edgeBoost",
  "maxTraceSide",
  "minIslandPx",
  "holeFillPx",
  "gapCloseStrength",
  "edgeThreshold",
  "edgeThickness",
  "centerlineMaxTraceSide",
  "centerlineStrokeWidth",
  "centerlineSimplifyTolerance",
  "centerlineMinPathLength",
  "colorLayerCount",
  "layerMaxTraceSide",
  "minRegionPercent",
  "layerOptTolerance",
  "layerTurdSize",
  "layerTurnPolicy",
  "posterize",
  "removeWhite",
  "removeTransparent",
  "transparent",
  "bgColor",
  "lineColor",
  "requestedPaletteCount",
  "layerBuildMode",
  "layerOverlapPx",
  "gapFill",
  "groupBy",
  "paletteAlgorithm",
  "paletteDistance",
  "colorMergeTolerance",
  "posterizeStrength",
  "sortLayersBy",
  "fillStrokeWidth",
  "fillStrokeColor",
];

export function readPngDimensionsFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) return null;
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

export function formatCategorySlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function detectHumanAdjacentCategory(...parts) {
  const haystack = parts
    .filter(Boolean)
    .map((part) => formatCategorySlug(part))
    .join("-");
  return HUMAN_ADJACENT_TERMS.some((term) => haystack.includes(formatCategorySlug(term)));
}

export function inferSampleSignals(entry) {
  const rel = String(entry.sourceRelativePath || "").toLowerCase();
  const size = Number(entry.fileSizeBytes || 0);
  const width = Number(entry.dimensions?.width || 0);
  const height = Number(entry.dimensions?.height || 0);
  const pixels = width * height;
  const signals = [];

  if (
    /\b(simple|easy|minimal|basic|cute|single)\b/.test(rel) ||
    size < 80_000 ||
    pixels < 800_000
  ) {
    signals.push("simple_scene");
  }
  if (
    /\b(complex|scene|detailed|detail|ornate|mandala|geometry|pattern|cards)\b/.test(rel) ||
    size > 1_500_000 ||
    pixels > 3_000_000
  ) {
    signals.push("complex_scene");
  }
  if (/\b(thin|fine|delicate|outline|line)\b/.test(rel) || size < 90_000) {
    signals.push("thin_line_candidate");
  }
  if (
    /\b(high-detail|detailed|detail|intricate|mandala|geometry|pattern)\b/.test(rel) ||
    size > 2_500_000 ||
    pixels > 5_000_000
  ) {
    signals.push("high_detail");
  }
  if (/\b(thick|bold|inked|heavy)\b/.test(rel) || size > 900_000) {
    signals.push("thick_line_candidate");
  }

  if (signals.includes("simple_scene") && signals.includes("complex_scene")) {
    return signals.filter((signal) => signal !== "simple_scene");
  }

  return signals.length ? signals : ["baseline"];
}

export function selectSampleCandidates(entries, requestedTarget = 250) {
  const eligible = entries
    .filter((entry) => entry.extension === ".png" && entry.appearsReadable)
    .slice()
    .sort(compareEntryStable);
  const target = Math.min(Math.max(0, requestedTarget), eligible.length);
  if (target === 0) return [];

  const groups = new Map();
  for (const entry of eligible) {
    const key = entry.category;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => stablePathHash(a.sourceRelativePath).localeCompare(stablePathHash(b.sourceRelativePath)));
  }

  const allocations = new Map();
  const categories = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  for (const category of categories) {
    allocations.set(category, 0);
  }

  for (const category of categories) {
    if (totalAllocated(allocations) >= target) break;
    allocations.set(category, 1);
  }

  while (totalAllocated(allocations) < target) {
    let bestCategory = null;
    let bestScore = -Infinity;
    for (const category of categories) {
      const group = groups.get(category) || [];
      const allocated = allocations.get(category) || 0;
      if (allocated >= group.length) continue;
      const humanWeight = group.some((entry) => entry.likelyHumanAdjacent) ? 2.35 : 1;
      const scarcityWeight = group.length < 20 ? 0.55 : 1;
      const score = (humanWeight * scarcityWeight * Math.sqrt(group.length)) / (allocated + 1);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
    if (!bestCategory) break;
    allocations.set(bestCategory, (allocations.get(bestCategory) || 0) + 1);
  }

  const selected = [];
  for (const category of categories) {
    const group = groups.get(category) || [];
    selected.push(...pickEvenly(group, allocations.get(category) || 0));
  }

  return selected
    .sort(compareEntryStable)
    .map((entry, index) => ({
      sourceRelativePath: entry.sourceRelativePath,
      category: entry.category,
      nestedCategory: entry.nestedCategory,
      filename: entry.filename,
      fileSizeBytes: entry.fileSizeBytes,
      dimensions: entry.dimensions,
      likelyHumanAdjacent: entry.likelyHumanAdjacent,
      selectionSignals: inferSampleSignals(entry),
      samplePriority: index + 1,
      notes: entry.likelyHumanAdjacent
        ? ["Oversampled for later anatomy QA."]
        : ["Included for category coverage and conversion bakeoff variety."],
    }));
}

async function main() {
  await ensurePipelineDirectories();

  const sharp = loadSharp();
  const folderLayout = await detectFolderLayout();
  const imageInventory = await buildImageInventory(sharp);
  const categorySummary = buildCategorySummary(imageInventory, folderLayout.emptyFolders);
  const conversionPresetInventory = await buildConversionPresetInventory();
  const sampleCandidates = selectSampleCandidates(imageInventory, 250);
  const pipelineAssumptions = await buildPipelineAssumptions({
    folderLayout,
    imageInventory,
    categorySummary,
    conversionPresetInventory,
    sampleCandidates,
    sharpAvailable: Boolean(sharp),
  });

  await writeJson(path.join(MANIFEST_DIR, "image-inventory.json"), {
    generatedAt: "2026-05-09",
    sourceRoot: "images",
    totalFiles: imageInventory.length,
    totalPngImages: imageInventory.filter((entry) => entry.extension === ".png").length,
    entries: imageInventory,
  });
  await writeJson(path.join(MANIFEST_DIR, "category-summary.json"), {
    generatedAt: "2026-05-09",
    categoryCount: categorySummary.length,
    categories: categorySummary,
  });
  await writeJson(path.join(MANIFEST_DIR, "conversion-preset-inventory.json"), {
    generatedAt: "2026-05-09",
    iloveSvgRoot: "ilovesvg",
    presetCount: conversionPresetInventory.length,
    presets: conversionPresetInventory,
  });
  await writeJson(path.join(MANIFEST_DIR, "sample-candidates.json"), {
    generatedAt: "2026-05-09",
    requestedTargetSize: 250,
    actualSampleSize: sampleCandidates.length,
    strategy:
      "Stratified by category, with higher allocation for likely human-adjacent categories and deterministic path-hash selection.",
    candidates: sampleCandidates,
  });
  await writeJson(path.join(MANIFEST_DIR, "pipeline-assumptions.json"), pipelineAssumptions);

  await writeFile(
    path.join(REPORT_DIR, "round-1-inventory-report.md"),
    buildRoundOneReport({
      folderLayout,
      imageInventory,
      categorySummary,
      conversionPresetInventory,
      sampleCandidates,
      pipelineAssumptions,
    }),
    "utf8",
  );
}

async function ensurePipelineDirectories() {
  for (const relativeDir of REQUIRED_PIPELINE_DIRS) {
    await mkdir(path.join(REPO_ROOT, relativeDir), { recursive: true });
  }
}

function loadSharp() {
  try {
    const requireFromIloveSvg = createRequire(path.join(ILOVE_SVG_DIR, "package.json"));
    return requireFromIloveSvg("sharp");
  } catch {
    return null;
  }
}

async function detectFolderLayout() {
  const nextAppRoots = await findNextAppRoots(REPO_ROOT);
  const topLevel = await safeReadDir(REPO_ROOT);
  const imageTopLevelCategories = (await safeReadDir(SOURCE_IMAGES_DIR))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  return {
    repositoryRoot: toRepoRelative(REPO_ROOT),
    iloveSvgRepo: (await exists(path.join(ILOVE_SVG_DIR, "package.json"))) ? "ilovesvg" : null,
    sourceImages: (await exists(SOURCE_IMAGES_DIR)) ? "images" : null,
    nextAppRoots,
    nextAppDetected: nextAppRoots.length > 0,
    topLevelEntries: topLevel
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    imageTopLevelCategories,
    emptyFolders: await findEmptyFolders(SOURCE_IMAGES_DIR),
  };
}

async function buildImageInventory(sharp) {
  const files = await listFiles(SOURCE_IMAGES_DIR);
  const entries = [];
  for (const filePath of files) {
    const sourceRelativePath = toRepoRelative(filePath);
    const sourceRelativeToImages = slash(path.relative(SOURCE_IMAGES_DIR, filePath));
    const parts = sourceRelativeToImages.split("/");
    const filename = parts[parts.length - 1];
    const category = parts.length > 1 ? parts[0] : "(root)";
    const nestedParts = parts.slice(1, -1);
    const nestedCategory = nestedParts.length ? nestedParts.join("/") : null;
    const extension = path.extname(filename).toLowerCase();
    const stats = await stat(filePath);
    const metadata = await readImageMetadata(filePath, sharp);
    const likelyHumanAdjacent = detectHumanAdjacentCategory(category, nestedCategory);
    const warnings = [];
    const notes = [];

    if (extension !== ".png") warnings.push(extension ? "non_png_file" : "missing_extension");
    if (!metadata.readable) warnings.push("unreadable_or_unrecognized_image");
    if (stats.size > 8 * 1024 * 1024) warnings.push("unusually_large_file");
    if (stats.size > 0 && stats.size < 50 * 1024) warnings.push("unusually_small_file");
    if (metadata.dimensions) {
      const { width, height } = metadata.dimensions;
      const pixels = width * height;
      if (width < 512 || height < 512) warnings.push("unusually_small_dimensions");
      if (width > 3500 || height > 3500 || pixels > 10_000_000) {
        warnings.push("large_dimensions");
      }
    }
    if (likelyHumanAdjacent) {
      notes.push("Likely human-adjacent category. Queue for stricter anatomy review.");
    }

    entries.push({
      sourceRelativePath,
      category,
      nestedCategory,
      filename,
      extension,
      isPng: extension === ".png",
      fileSizeBytes: stats.size,
      dimensions: metadata.dimensions,
      detectedFormat: metadata.format,
      appearsReadable: metadata.readable,
      likelyHumanAdjacent,
      warnings,
      notes,
    });
  }

  const duplicateNameCounts = countDuplicateFilenames(entries);
  for (const entry of entries) {
    const count = duplicateNameCounts.get(entry.filename.toLowerCase()) || 0;
    if (count > 1) {
      entry.warnings.push(`duplicate_filename:${count}`);
    }
  }

  return entries.sort(compareEntryStable);
}

async function readImageMetadata(filePath, sharp) {
  let headerDimensions = null;
  try {
    const header = await readFile(filePath);
    headerDimensions = readPngDimensionsFromBuffer(header);
  } catch {
    headerDimensions = null;
  }

  if (sharp) {
    try {
      const metadata = await sharp(filePath, { limitInputPixels: false }).metadata();
      const width = Number(metadata.width || 0);
      const height = Number(metadata.height || 0);
      return {
        readable: width > 0 && height > 0,
        dimensions: width > 0 && height > 0 ? { width, height } : headerDimensions,
        format: metadata.format || null,
      };
    } catch {
      return {
        readable: Boolean(headerDimensions),
        dimensions: headerDimensions,
        format: headerDimensions ? "png-header-only" : null,
      };
    }
  }

  return {
    readable: Boolean(headerDimensions),
    dimensions: headerDimensions,
    format: headerDimensions ? "png-header-only" : null,
  };
}

function countDuplicateFilenames(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const key = entry.filename.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function buildCategorySummary(entries, emptyFolders) {
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.category)) {
      grouped.set(entry.category, []);
    }
    grouped.get(entry.category).push(entry);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, categoryEntries]) => {
      const pngEntries = categoryEntries.filter((entry) => entry.extension === ".png");
      const nestedFolders = new Set(
        categoryEntries
          .map((entry) => entry.nestedCategory)
          .filter(Boolean)
          .map((nested) => String(nested).split("/")[0]),
      );
      const humanAdjacent = categoryEntries.some((entry) => entry.likelyHumanAdjacent);
      const categoryEmptyFolders = emptyFolders.filter((folder) =>
        folder === `images/${category}` || folder.startsWith(`images/${category}/`),
      );
      const nonPngCount = categoryEntries.length - pngEntries.length;
      const readablePngCount = pngEntries.filter((entry) => entry.appearsReadable).length;
      const notes = [];
      if (humanAdjacent) notes.push("Higher-risk anatomy QA category.");
      if (nonPngCount) notes.push(`${nonPngCount} non-PNG file(s) detected.`);
      if (readablePngCount !== pngEntries.length) {
        notes.push(`${pngEntries.length - readablePngCount} PNG file(s) may be unreadable.`);
      }
      if (categoryEmptyFolders.length) {
        notes.push(`${categoryEmptyFolders.length} empty folder(s) detected.`);
      }
      if (pngEntries.length < 10) {
        notes.push("Too small for a major public hub unless combined with a broader category.");
      }

      return {
        categoryName: category,
        categorySlug: formatCategorySlug(category),
        imageCount: pngEntries.length,
        readablePngCount,
        totalFileCount: categoryEntries.length,
        nonPngFileCount: nonPngCount,
        nestedFolderCount: nestedFolders.size,
        emptyFolderCount: categoryEmptyFolders.length,
        likelyPublicHubCandidate: pngEntries.length >= 20,
        humanAdjacentRisk: humanAdjacent,
        notes,
      };
    });
}

async function buildConversionPresetInventory() {
  if (!(await exists(ILOVE_SVG_DIR))) return [];

  const routeDir = path.join(ILOVE_SVG_DIR, "app", "routes");
  const files = [];
  const presetAdditionsFile = path.join(
    ILOVE_SVG_DIR,
    "app",
    "client",
    "lib",
    "converter",
    "presetAdditions.ts",
  );
  if (await exists(presetAdditionsFile)) files.push(presetAdditionsFile);

  for (const filePath of await listFiles(routeDir)) {
    const base = path.basename(filePath).toLowerCase();
    if (!base.endsWith(".tsx")) continue;
    if (ROUTE_PRESET_FILE_TERMS.some((term) => base.includes(term))) {
      files.push(filePath);
    }
  }

  const presets = [];
  for (const filePath of files.sort((a, b) => a.localeCompare(b))) {
    const text = await readFile(filePath, "utf8");
    const relativeFile = toRepoRelative(filePath);
    const arrays = extractPresetArrays(text, filePath);
    for (const array of arrays) {
      for (const block of array.objects) {
        const id = extractStringProperty(block.text, "id");
        const label = extractStringProperty(block.text, "label");
        if (!id && !label) continue;
        const category = extractStringProperty(block.text, "category");
        const backendIntensity = extractStringProperty(block.text, "backendIntensity");
        const settingsBlock = extractObjectPropertyBlock(block.text, "settings");
        const relevantParameters = extractSettings(settingsBlock || "");
        const routeSlug = relativeFile.startsWith("ilovesvg/app/routes/")
          ? `/${path.basename(relativeFile, ".tsx")}`
          : null;
        const suitability = assessPresetSuitability({ id, label, category, relevantParameters });
        if (!suitability.include) continue;

        presets.push({
          presetName: label || id,
          presetId: id || null,
          whereDefined: {
            file: relativeFile,
            line: block.line,
            arrayName: array.name,
          },
          sourceKind: routeSlug ? "route-local-preset" : "shared-preset-addition",
          route: routeSlug,
          category: category || null,
          backendIntensity: backendIntensity || null,
          relevantParameters,
          commandOrFunctionNeededToInvoke: routeSlug
            ? `POST multipart/form-data to ${routeSlug} with file plus these settings, or use the route UI preset selector.`
            : "Imported through extendTracePresets(PRESETS, { includeStrokePresets: true }) or extendTracePresets(PRESETS).",
          appearsSuitableForColoringPageConversion: suitability.suitable,
          notes: suitability.notes,
        });
      }
    }
  }

  const seen = new Set();
  return presets
    .filter((preset) => {
      const key = `${preset.whereDefined.file}:${preset.whereDefined.line}:${preset.presetId || preset.presetName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const byFile = a.whereDefined.file.localeCompare(b.whereDefined.file);
      if (byFile) return byFile;
      return a.whereDefined.line - b.whereDefined.line;
    });
}

function extractPresetArrays(text, filePath) {
  const arrays = [];
  const names = path.basename(filePath) === "presetAdditions.ts"
    ? ["TRACE_PRESET_ADDITIONS", "STROKE_TRACE_PRESET_ADDITIONS"]
    : ["PRESETS"];

  for (const name of names) {
    const match = new RegExp(`(?:export\\s+)?const\\s+${escapeRegExp(name)}\\b[\\s\\S]*?=\\s*\\[`, "m").exec(text);
    if (!match) continue;
    const bracketIndex = match.index + match[0].lastIndexOf("[");
    const arrayText = extractBalanced(text, bracketIndex, "[", "]");
    if (!arrayText) continue;
    const objects = extractTopLevelObjects(arrayText.content, bracketIndex + 1, text);
    arrays.push({ name, objects });
  }

  return arrays;
}

function extractTopLevelObjects(content, contentStartOffset, fullText) {
  const objects = [];
  let index = 0;
  while (index < content.length) {
    const open = findNextTopLevelChar(content, "{", index);
    if (open < 0) break;
    const balanced = extractBalanced(content, open, "{", "}");
    if (!balanced) break;
    const absoluteOpen = contentStartOffset + open;
    objects.push({
      text: balanced.contentWithBraces,
      line: lineNumberAt(fullText, absoluteOpen),
    });
    index = balanced.end + 1;
  }
  return objects;
}

function extractBalanced(text, start, openChar, closeChar) {
  if (text[start] !== openChar) return null;
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return {
          start,
          end: index,
          content: text.slice(start + 1, index),
          contentWithBraces: text.slice(start, index + 1),
        };
      }
    }
  }

  return null;
}

function findNextTopLevelChar(text, target, startIndex) {
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (!braceDepth && !bracketDepth && !parenDepth && char === target) return index;
    if (char === "{") braceDepth += 1;
    else if (char === "}") braceDepth -= 1;
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth -= 1;
    else if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth -= 1;
  }

  return -1;
}

function extractStringProperty(block, property) {
  const match = new RegExp(`\\b${escapeRegExp(property)}\\s*:\\s*["']([^"']+)["']`).exec(block);
  return match ? match[1] : null;
}

function extractObjectPropertyBlock(block, property) {
  const match = new RegExp(`\\b${escapeRegExp(property)}\\s*:`).exec(block);
  if (!match) return null;
  const openIndex = block.indexOf("{", match.index + match[0].length);
  if (openIndex < 0) return null;
  const balanced = extractBalanced(block, openIndex, "{", "}");
  return balanced?.contentWithBraces || null;
}

function extractSettings(settingsBlock) {
  const out = {};
  for (const key of SETTINGS_KEYS) {
    const match = new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*([^,}\\n]+)`).exec(settingsBlock);
    if (!match) continue;
    out[key] = parseSettingValue(match[1]);
  }
  return out;
}

function parseSettingValue(raw) {
  const value = String(raw || "").trim().replace(/\s+as\s+[^,}]+$/, "");
  if (/^["'].*["']$/.test(value)) return value.slice(1, -1);
  if (value === "true") return true;
  if (value === "false") return false;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return value;
}

function assessPresetSuitability({ id, label, category, relevantParameters }) {
  const haystack = `${id || ""} ${label || ""} ${category || ""}`.toLowerCase();
  const hasRelevantTerm = RELEVANT_PRESET_TERMS.some((term) => haystack.includes(term));
  const isStroke = relevantParameters.strokeOutputMode === "centerline" || haystack.includes("stroke");
  const isLayered = relevantParameters.traceMode === "layered";
  const isColorHeavy =
    isLayered ||
    Number(relevantParameters.colorLayerCount || 0) > 0 ||
    Number(relevantParameters.requestedPaletteCount || 0) > 0;

  if (!hasRelevantTerm && !isStroke && !isColorHeavy) {
    return { include: false, suitable: false, notes: ["Not relevant to line-art or PNG-to-SVG discovery."] };
  }

  const notes = [];
  let suitable = true;
  if (isStroke) notes.push("Centerline or stroke preset, useful to test against clean line art.");
  if (/line|drawing|sketch|scan|outline|ink|pencil|cartoon|black|bw/.test(haystack)) {
    notes.push("Line-art-like preset, likely useful for coloring-page bakeoffs.");
  }
  if (isColorHeavy) {
    suitable = false;
    notes.push("Layered or color-preserving preset. Keep as comparison, but not a primary coloring-page candidate.");
  }
  if (!notes.length) notes.push("General PNG/SVG preset. Include as a baseline comparison.");

  return { include: true, suitable, notes };
}

async function buildPipelineAssumptions({
  folderLayout,
  imageInventory,
  categorySummary,
  conversionPresetInventory,
  sampleCandidates,
  sharpAvailable,
}) {
  const packageJson = await readJsonIfExists(path.join(ILOVE_SVG_DIR, "package.json"));
  const scripts = packageJson?.scripts || {};
  const dependencies = {
    potrace: packageJson?.dependencies?.potrace || null,
    sharp: packageJson?.dependencies?.sharp || null,
    wasm_vtracer: packageJson?.dependencies?.wasm_vtracer || null,
  };

  const nonPngFiles = imageInventory
    .filter((entry) => entry.extension !== ".png")
    .map((entry) => entry.sourceRelativePath)
    .sort((a, b) => a.localeCompare(b));
  const unreadableFiles = imageInventory
    .filter((entry) => !entry.appearsReadable)
    .map((entry) => entry.sourceRelativePath)
    .sort((a, b) => a.localeCompare(b));
  const duplicateFilenameGroups = summarizeDuplicateFilenames(imageInventory);

  const assumptions = {
    generatedAt: "2026-05-09",
    folderLocationsFound: {
      repositoryRoot: ".",
      iloveSvgRepo: folderLayout.iloveSvgRepo,
      sourceImagesFolder: folderLayout.sourceImages,
      nextAppRoots: folderLayout.nextAppRoots,
    },
    nextJsStatus: folderLayout.nextAppDetected
      ? "A Next.js app root was detected."
      : "No Next.js app root was detected in the outer workspace.",
    commandsDiscovered: {
      iloveSvgPackageScripts: Object.fromEntries(
        Object.entries(scripts)
          .filter(([name]) =>
            [
              "dev",
              "start",
              "build",
              "test",
              "test:trace-engine",
              "test:trace-quality",
              "test:hybrid-browser",
              "test:preset-performance",
              "typecheck",
            ].includes(name),
          )
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
      roundOneValidation: [
        "node --test pipeline/tests/generate-round-1-manifests.test.mjs",
        "node pipeline/scripts/generate-round-1-manifests.mjs",
        "node -e \"const fs=require('fs'); for (const f of ['image-inventory','category-summary','conversion-preset-inventory','sample-candidates','pipeline-assumptions']) JSON.parse(fs.readFileSync('pipeline/manifests/'+f+'.json','utf8'))\"",
      ],
    },
    conversionSystemFound: {
      framework: "React Router app inside ilovesvg, not a Next.js app.",
      keyDependencies: dependencies,
      keyRoutes: await findRelevantRouteFiles(),
      keyUtilities: [
        "ilovesvg/app/shared/tracing/serverFallback.server.ts",
        "ilovesvg/app/utils/imagePreprocess.server.ts",
        "ilovesvg/app/utils/potraceCompat.ts",
        "ilovesvg/app/utils/svgLayerTrace.server.ts",
        "ilovesvg/app/shared/tracing/centerlineTrace.ts",
        "ilovesvg/app/client/lib/converter/presetAdditions.ts",
        "ilovesvg/app/client/lib/converter/settings.ts",
        "ilovesvg/app/utils/converterSettings.server.ts",
      ],
      presetCountInventoried: conversionPresetInventory.length,
      directBatchReuseAssessment:
        "Not directly reusable as a clean batch CLI yet. Current conversion is embedded in route actions and browser/client fetch flow. A later adapter should import the shared server utilities and selected preset settings without route UI, rate-limit, or multipart concerns.",
      singlePngConversionPath:
        "Existing app path is to run the ilovesvg server, open /png-to-svg-converter or a related line-art route, upload one PNG, select a preset, and download SVG. Programmatic batch conversion needs a wrapper around shared tracing utilities.",
    },
    imageCorpusFindings: {
      totalFiles: imageInventory.length,
      pngImageCount: imageInventory.filter((entry) => entry.extension === ".png").length,
      categoryCount: categorySummary.length,
      nonPngFileCount: nonPngFiles.length,
      nonPngFiles,
      unreadableFileCount: unreadableFiles.length,
      unreadableFiles,
      emptyFolders: folderLayout.emptyFolders,
      duplicateFilenameGroupCount: duplicateFilenameGroups.length,
      duplicateFilenameGroups: duplicateFilenameGroups.slice(0, 100),
      humanAdjacentCategories: categorySummary
        .filter((category) => category.humanAdjacentRisk)
        .map((category) => category.categoryName),
    },
    sampleStrategy: {
      requestedTargetSize: 250,
      actualSampleSize: sampleCandidates.length,
      includesEveryCategory: true,
      oversamplesHumanAdjacentCategories: true,
      sourceFilesCopied: false,
    },
    missingInformation: [
      "No final conversion preset policy has been selected.",
      "No visual QA rubric thresholds have been approved yet.",
      "No Next.js public gallery app exists in this workspace yet.",
      "No production asset naming or public URL policy has been finalized.",
    ],
    risks: [
      "Human and humanoid categories may contain anatomy defects that are not detectable from filenames or metadata.",
      "Duplicate filenames across categories require metadata-driven asset IDs before production export.",
      "Some folders are very small and should be merged into broader hubs unless content quality justifies a niche page.",
      "The I Love SVG repo is dirty. Reuse should avoid overwriting its current uncommitted work.",
      "The existing converter has no standalone batch CLI. Batch conversion should start with a small wrapper and a bakeoff batch only.",
    ],
    recommendedNextStep:
      "Round 2 should run a small preset bakeoff on the sample manifest only, write conversion outputs under pipeline/bakeoffs, and produce conversion plus anatomy review manifests before any production asset generation.",
    sharpAvailableForInventory: sharpAvailable,
  };

  return assumptions;
}

async function findRelevantRouteFiles() {
  const routeDir = path.join(ILOVE_SVG_DIR, "app", "routes");
  const files = await listFiles(routeDir);
  return files
    .filter((filePath) => {
      const base = path.basename(filePath).toLowerCase();
      return base.endsWith(".tsx") && ROUTE_PRESET_FILE_TERMS.some((term) => base.includes(term));
    })
    .map(toRepoRelative)
    .sort((a, b) => a.localeCompare(b));
}

function summarizeDuplicateFilenames(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.filename.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry.sourceRelativePath);
  }
  return [...groups.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([filename, paths]) => ({
      filename,
      count: paths.length,
      examples: paths.slice().sort((a, b) => a.localeCompare(b)).slice(0, 12),
    }))
    .sort((a, b) => b.count - a.count || a.filename.localeCompare(b.filename));
}

function buildRoundOneReport({
  folderLayout,
  imageInventory,
  categorySummary,
  conversionPresetInventory,
  sampleCandidates,
  pipelineAssumptions,
}) {
  const pngCount = imageInventory.filter((entry) => entry.extension === ".png").length;
  const highRisk = categorySummary.filter((category) => category.humanAdjacentRisk);
  const nonPng = imageInventory.filter((entry) => entry.extension !== ".png");
  const unreadable = imageInventory.filter((entry) => !entry.appearsReadable);
  const duplicateGroups = pipelineAssumptions.imageCorpusFindings.duplicateFilenameGroups;
  const duplicateGroupCount = pipelineAssumptions.imageCorpusFindings.duplicateFilenameGroupCount;
  const likelySuitablePresetCount = conversionPresetInventory.filter(
    (preset) => preset.appearsSuitableForColoringPageConversion,
  ).length;

  return `# Round 1 Inventory Report

Generated: 2026-05-09

## Detected Folder Layout

- Workspace root: \`.\`
- I Love SVG repo: \`${folderLayout.iloveSvgRepo || "not found"}\`
- Source images folder: \`${folderLayout.sourceImages || "not found"}\`
- Next.js app root: ${
    folderLayout.nextAppDetected
      ? folderLayout.nextAppRoots.map((root) => `\`${root}\``).join(", ")
      : "not detected in the outer workspace"
  }

The outer workspace currently contains source material and the nested I Love SVG repo. It does not currently contain a Next.js app root. The clean expected structure for a later app would keep \`pipeline/\` at the repository root, keep immutable sources in \`images/\`, and place any future Next.js app in the root or a clear \`site/\` directory with public assets copied only after preset policy and QA are locked.

## Image Inventory

- Total files under \`images/\`: ${imageInventory.length}
- PNG images: ${pngCount}
- Categories: ${categorySummary.length}
- Non-PNG or missing-extension files: ${nonPng.length}
- Likely unreadable or unrecognized files: ${unreadable.length}
- Empty folders: ${folderLayout.emptyFolders.length}
- Duplicate filename groups: ${pipelineAssumptions.imageCorpusFindings.duplicateFilenameGroupCount}

## Category Counts

| Category | PNG images | Nested folders | Hub candidate | Human-adjacent risk | Notes |
| --- | ---: | ---: | --- | --- | --- |
${categorySummary
  .map(
    (category) =>
      `| ${escapeMarkdownTable(category.categoryName)} | ${category.imageCount} | ${category.nestedFolderCount} | ${category.likelyPublicHubCandidate ? "yes" : "no"} | ${category.humanAdjacentRisk ? "yes" : "no"} | ${escapeMarkdownTable(category.notes.join(" "))} |`,
  )
  .join("\n")}

## Human-Adjacent And Higher-Risk Categories

${highRisk.length ? highRisk.map((category) => `- ${category.categoryName}: ${category.imageCount} PNG images`).join("\n") : "- None detected from folder names."}

These categories need stricter anatomy review in later rounds. Filename and folder metadata cannot catch warped hands, extra fingers, extra toes, extra limbs, or malformed humanoid details.

## Source File Anomalies

- Non-PNG files: ${nonPng.length ? nonPng.map((entry) => `\`${entry.sourceRelativePath}\``).join(", ") : "none"}
- Unreadable or unrecognized files: ${unreadable.length ? unreadable.map((entry) => `\`${entry.sourceRelativePath}\``).join(", ") : "none"}
- Duplicate filename groups: ${duplicateGroupCount}. See \`pipeline/manifests/pipeline-assumptions.json\` for examples.

## Existing Conversion System

The I Love SVG repo is a React Router app, not a standalone converter package. The relevant conversion stack found in round 1 is:

- Routes: PNG, line-art, drawing, scan, sketch, black-and-white, outline, and related converter routes under \`ilovesvg/app/routes/\`
- Shared server utilities: \`serverFallback.server.ts\`, \`imagePreprocess.server.ts\`, \`potraceCompat.ts\`, \`svgLayerTrace.server.ts\`, and \`centerlineTrace.ts\`
- Preset catalogs: route-local \`PRESETS\` arrays plus \`TRACE_PRESET_ADDITIONS\` and \`STROKE_TRACE_PRESET_ADDITIONS\`
- Dependencies: \`sharp\`, \`potrace\`, and \`wasm_vtracer\`
- Discovered scripts: \`npm run test:trace-engine\`, \`npm run test:trace-quality\`, \`npm run test:hybrid-browser\`, \`npm run test:preset-performance\`, \`npm run typecheck\`

Inventoried conversion presets: ${conversionPresetInventory.length}
Likely coloring-page candidates or useful bakeoff baselines: ${likelySuitablePresetCount}

## Single PNG Conversion Path

The existing app can convert one PNG through its route UI: run the I Love SVG server, open a route such as \`/png-to-svg-converter\`, \`/line-art-to-svg-converter\`, \`/drawing-to-svg-converter\`, \`/scan-to-svg-converter\`, or \`/sketch-to-svg-converter\`, upload one PNG, select a preset, and download the SVG.

Direct batch reuse is not clean yet. The conversion logic is embedded in route actions and client fetch behavior. A later wrapper should import the shared server utilities and selected preset settings directly, then write outputs under \`pipeline/bakeoffs/\` for small batches only.

## Proposed Round 2 Sample Strategy

- Proposed sample size: ${sampleCandidates.length}
- Include examples from every category.
- Oversample human-adjacent categories for anatomy QA.
- Include deterministic metadata signals for simple scenes, complex scenes, thin-line candidates, thick-line candidates, and high-detail candidates when detectable.
- Do not copy files in round 1. Round 2 should read \`pipeline/manifests/sample-candidates.json\` and write bakeoff outputs separately.

## Recommended Public Next.js Structure

Use hub and gallery pages:

- \`/coloring-pages\`
- \`/coloring-pages/animals\`
- \`/coloring-pages/christmas\`
- \`/coloring-pages/<category>\` for categories with enough quality content and clear intent
- Optional subhubs only when nested folders have enough content and distinct search intent

Do not create indexable pages per image. Individual images should become assets plus metadata records. A future coloring dashboard or mode should live separately from indexable SEO gallery pages.

## Risks And Assumptions

${pipelineAssumptions.risks.map((risk) => `- ${risk}`).join("\n")}

## Exact Round 2 Prompt Recommendation

\`\`\`text
Round 2 only: using pipeline/manifests/sample-candidates.json, run a small conversion bakeoff on the proposed sample set. Do not process the full corpus. Do not write production assets. Use the I Love SVG conversion utilities through a small adapter if needed, test only a limited set of line-art, drawing, scan, and centerline presets, write outputs under pipeline/bakeoffs, and create conversion plus anatomy review manifests under pipeline/review. Compare output quality for clean coloring-page use without choosing a final production preset yet.
\`\`\`
`;
}

async function findNextAppRoots(rootDir) {
  const candidates = [];
  const dirs = await listDirectoriesBreadthFirst(rootDir, 3, new Set([".git", "node_modules", "images", "build", "output"]));
  for (const dir of [rootDir, ...dirs]) {
    const packageJsonPath = path.join(dir, "package.json");
    const hasNextConfig = (
      await Promise.all([
        exists(path.join(dir, "next.config.js")),
        exists(path.join(dir, "next.config.mjs")),
        exists(path.join(dir, "next.config.ts")),
      ])
    ).some(Boolean);
    const packageJson = await readJsonIfExists(packageJsonPath);
    const hasNextDep = Boolean(
      packageJson?.dependencies?.next ||
        packageJson?.devDependencies?.next ||
        packageJson?.scripts?.dev?.includes("next"),
    );
    if (hasNextConfig || hasNextDep) candidates.push(toRepoRelative(dir));
  }
  return candidates.sort((a, b) => a.localeCompare(b));
}

async function listDirectoriesBreadthFirst(rootDir, maxDepth, ignoredNames) {
  const out = [];
  const queue = [{ dir: rootDir, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) continue;
    for (const entry of await safeReadDir(current.dir)) {
      if (!entry.isDirectory() || ignoredNames.has(entry.name)) continue;
      const dir = path.join(current.dir, entry.name);
      out.push(dir);
      queue.push({ dir, depth: current.depth + 1 });
    }
  }
  return out;
}

async function findEmptyFolders(rootDir) {
  if (!(await exists(rootDir))) return [];
  const folders = [];
  async function visit(dir) {
    const entries = await safeReadDir(dir);
    let descendantFileCount = 0;
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        descendantFileCount += await visit(full);
      } else if (entry.isFile()) {
        descendantFileCount += 1;
      }
    }
    if (descendantFileCount === 0) folders.push(toRepoRelative(dir));
    return descendantFileCount;
  }
  await visit(rootDir);
  return folders.sort((a, b) => a.localeCompare(b));
}

async function listFiles(rootDir) {
  if (!(await exists(rootDir))) return [];
  const out = [];
  async function visit(dir) {
    const entries = await safeReadDir(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  await visit(rootDir);
  return out.sort((a, b) => toRepoRelative(a).localeCompare(toRepoRelative(b)));
}

async function safeReadDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pickEvenly(items, count) {
  if (count <= 0) return [];
  if (count >= items.length) return items.slice();
  if (count === 1) return [items[0]];
  const picked = [];
  const used = new Set();
  for (let index = 0; index < count; index += 1) {
    const targetIndex = Math.round((index * (items.length - 1)) / (count - 1));
    let cursor = targetIndex;
    while (used.has(cursor) && cursor < items.length - 1) cursor += 1;
    while (used.has(cursor) && cursor > 0) cursor -= 1;
    used.add(cursor);
    picked.push(items[cursor]);
  }
  return picked;
}

function totalAllocated(allocations) {
  let total = 0;
  for (const value of allocations.values()) total += value;
  return total;
}

function compareEntryStable(a, b) {
  return a.sourceRelativePath.localeCompare(b.sourceRelativePath);
}

function stablePathHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function toRepoRelative(filePath) {
  const relative = path.relative(REPO_ROOT, filePath);
  return relative ? slash(relative) : ".";
}

function slash(value) {
  return String(value).replace(/\\/g, "/");
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeMarkdownTable(value) {
  return String(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

if (import.meta.url === `file://${slash(__filename)}` || process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
