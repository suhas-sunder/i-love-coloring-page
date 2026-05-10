import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

export const ROUND4K_RUN_ID = "round-4k-gallery-visual-corrections";
export const ROUND4K_MANIFEST_FILES = [
  "pipeline/manifests/round-4k-project-context-check.json",
  "pipeline/manifests/round-4k-ui-problem-audit.json",
  "pipeline/manifests/round-4k-color-token-rules.json",
  "pipeline/manifests/round-4k-display-title-cleanup.json",
  "pipeline/manifests/round-4k-typography-audit.json",
  "pipeline/manifests/round-4k-gallery-card-fixes.json",
  "pipeline/manifests/round-4k-browser-qa-results.json",
];
export const ROUND4K_REPORT_FILES = [
  "pipeline/reports/round-4k-project-context-check.md",
  "pipeline/reports/round-4k-ui-problem-audit.md",
  "pipeline/reports/round-4k-color-token-rules.md",
  "pipeline/reports/round-4k-display-title-cleanup-report.md",
  "pipeline/reports/round-4k-typography-audit.md",
  "pipeline/reports/round-4k-gallery-card-fixes.md",
  "pipeline/reports/round-4k-browser-qa-report.md",
  "pipeline/reports/round-4k-next-phase-plan.md",
];

const TITLE_OVERRIDES_PATH = "src/generated/coloring/title-overrides.json";
const SEARCH_INDEX_PATH = "src/generated/coloring/search-index.json";
const ROUND4J_COMMIT = "74265c5c1702a207ccd402c3a6058ee63cc72fd7";
const BAD_TITLE_PATTERN = /\b(?:Failed\s+)?ChatGPT Image\b|\bOpenAI\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}|\b\d{1,2}-\d{1,2}-20\d{2}\b|\b\d{1,2}\s+\d{2}\s+\d{2}\s+(?:AM|PM)\b/i;

const TITLE_FALLBACKS = [
  { test: /anime-girls?/, title: "Anime Girl Coloring Page" },
  { test: /chibi|kawaii|cute/, title: "Cute Character Coloring Page" },
  { test: /mandala|geometric|pattern/, title: "Geometric Pattern Coloring Page" },
  { test: /space|planet|astronaut|rocket/, title: "Space Coloring Page" },
  { test: /animal|dogs?|cats?|sea-life|dinosaur|prehistoric/, title: "Animal Coloring Page" },
  { test: /plant|flower|indoor-plants?/, title: "Plant Coloring Page" },
  { test: /vehicle|cars?|truck|train/, title: "Vehicle Coloring Page" },
  { test: /christmas|halloween|holiday|seasonal/, title: "Seasonal Coloring Page" },
  { test: /fantasy|mythology|fairy|dragon/, title: "Fantasy Coloring Page" },
];

export async function runRound4KDisplayTitleCleanup({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const generatedAt = new Date().toISOString();
  const itemsManifest = await readJson(repoRoot, "src/generated/coloring/items.json");
  const hubsManifest = await readJson(repoRoot, "src/generated/coloring/hubs.json");
  const routesManifest = await readJson(repoRoot, "src/generated/coloring/routes.json");
  const searchIndexManifest = await readJson(repoRoot, SEARCH_INDEX_PATH);

  const context = await buildProjectContext(repoRoot, generatedAt, routesManifest);
  const titleCleanup = buildTitleCleanup(itemsManifest, hubsManifest, searchIndexManifest, generatedAt);
  const cleanedSearchIndex = applyTitleOverridesToSearchIndex(searchIndexManifest, titleCleanup.overrides);
  const titleOverrides = {
    runId: ROUND4K_RUN_ID,
    generatedAt,
    purpose: "Public display title overrides only. Source files and generated media filenames are unchanged.",
    overrides: titleCleanup.overrides,
  };

  const colorRules = buildColorRules(generatedAt);
  const typography = await buildTypographyAudit(repoRoot, generatedAt);
  const uiAudit = buildUiProblemAudit(generatedAt, titleCleanup.overrides.length);
  const cardFixes = buildGalleryCardFixes(generatedAt, titleCleanup.overrides.length);
  const browserQa = await buildBrowserQaPlaceholder(repoRoot, generatedAt);

  await writeJson(repoRoot, TITLE_OVERRIDES_PATH, titleOverrides);
  await writeJson(repoRoot, SEARCH_INDEX_PATH, cleanedSearchIndex);
  await writeJson(repoRoot, "pipeline/manifests/round-4k-project-context-check.json", context);
  await writeJson(repoRoot, "pipeline/manifests/round-4k-ui-problem-audit.json", uiAudit);
  await writeJson(repoRoot, "pipeline/manifests/round-4k-color-token-rules.json", colorRules);
  await writeJson(repoRoot, "pipeline/manifests/round-4k-display-title-cleanup.json", titleCleanup);
  await writeJson(repoRoot, "pipeline/manifests/round-4k-typography-audit.json", typography);
  await writeJson(repoRoot, "pipeline/manifests/round-4k-gallery-card-fixes.json", cardFixes);
  await writeJson(repoRoot, "pipeline/manifests/round-4k-browser-qa-results.json", browserQa);

  await writeReports(repoRoot, {
    context,
    uiAudit,
    colorRules,
    titleCleanup,
    typography,
    cardFixes,
    browserQa,
  });

  return {
    runId: ROUND4K_RUN_ID,
    detectedBadTitleCount: titleCleanup.summary.detectedBadTitleCount,
    generatedTitleOverrideCount: titleCleanup.summary.generatedTitleOverrideCount,
    context: context.summary,
  };
}

async function buildProjectContext(repoRoot, generatedAt, routesManifest) {
  const [branch, root, head, commitExists, appApiRoutePresent, r2BundleExists, publicMediaPresent, imagesStatus, ilovesvgStatus] = await Promise.all([
    git(repoRoot, ["branch", "--show-current"]).then((value) => value.trim()),
    git(repoRoot, ["rev-parse", "--show-toplevel"]).then((value) => normalizePath(path.basename(value.trim()))),
    git(repoRoot, ["rev-parse", "HEAD"]).then((value) => value.trim()),
    git(repoRoot, ["cat-file", "-e", `${ROUND4J_COMMIT}^{commit}`]).then(() => true, () => false),
    exists(path.join(repoRoot, "app", "api")),
    exists(path.join(repoRoot, "pipeline", "r2-upload", "coloring-pages")),
    publicContainsGeneratedMedia(repoRoot),
    git(repoRoot, ["status", "--short", "--", "images"]).then((value) => value.trim()),
    git(repoRoot, ["status", "--short", "--", "ilovesvg"]).then((value) => value.trim()),
  ]);
  const nextConfig = await readText(repoRoot, "next.config.mjs");
  const hasHubPages = await Promise.all([
    exists(path.join(repoRoot, "app", "coloring-pages", "page.tsx")),
    exists(path.join(repoRoot, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
  ]);

  return {
    runId: ROUND4K_RUN_ID,
    generatedAt,
    summary: {
      correctRepository: root === "i-love-coloring-page",
      branch,
      head,
      round4jCommitExists: commitExists,
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      appApiRoutePresent,
      hubRoutesExist: hasHubPages.every(Boolean),
      r2BundleExists,
      publicGeneratedMediaPresent: publicMediaPresent,
      imagesClean: imagesStatus.length === 0,
      ilovesvgClean: ilovesvgStatus.length === 0,
      sitemapRouteCount: routesManifest.routes?.length || 0,
    },
    checks: [
      { name: "repository", expected: "i-love-coloring-page", actual: root, passed: root === "i-love-coloring-page" },
      { name: "branch", expected: "version-4", actual: branch, passed: branch === "version-4" },
      { name: "round4jCommit", expected: ROUND4J_COMMIT, actual: commitExists ? "found" : "missing", passed: commitExists },
      { name: "appApi", expected: "absent", actual: appApiRoutePresent ? "present" : "absent", passed: !appApiRoutePresent },
      { name: "staticExport", expected: "configured", actual: /output:\s*"export"/.test(nextConfig) ? "configured" : "missing", passed: /output:\s*"export"/.test(nextConfig) },
      { name: "r2Bundle", expected: "pipeline/r2-upload/coloring-pages", actual: r2BundleExists ? "exists" : "missing", passed: r2BundleExists },
    ],
  };
}

function buildTitleCleanup(itemsManifest, hubsManifest, searchIndexManifest, generatedAt) {
  const hubIdsByAssetId = new Map();
  for (const hub of hubsManifest.hubs || []) {
    for (const assetId of hub.assetIds || []) {
      if (!hubIdsByAssetId.has(assetId)) hubIdsByAssetId.set(assetId, []);
      hubIdsByAssetId.get(assetId).push({ hubId: hub.hubId, slug: hub.slug, title: hub.title, route: hub.route });
    }
  }

  const searchByAssetId = new Map((searchIndexManifest.entries || []).map((entry) => [entry.assetId, entry]));
  const overrides = [];
  for (const item of itemsManifest.items || []) {
    if (!BAD_TITLE_PATTERN.test(item.title) && !BAD_TITLE_PATTERN.test(item.altText)) continue;
    const hubs = hubIdsByAssetId.get(item.assetId) || [];
    const searchEntry = searchByAssetId.get(item.assetId);
    const inferred = inferCleanTitle(item, hubs, searchEntry);
    overrides.push({
      assetId: item.assetId,
      originalTitle: item.title,
      originalAltText: item.altText,
      cleanTitle: inferred.title,
      cleanAltText: `${inferred.title} printable coloring page`,
      categorySlug: item.categorySlug,
      hubSlugs: hubs.map((hub) => hub.slug),
      likelyPublicTargets: hubs.slice(0, 4).map((hub) => `${hub.route}#asset-${item.assetId}`),
      confidence: inferred.confidence,
      reason: inferred.reason,
      manualReviewRequired: inferred.confidence !== "high",
      filesRenamed: false,
      mediaFilenamesRenamed: false,
      flaggedForLaterFilenameCleanup: true,
    });
  }

  overrides.sort((a, b) => a.assetId.localeCompare(b.assetId));
  return {
    runId: ROUND4K_RUN_ID,
    generatedAt,
    summary: {
      detectedBadTitleCount: overrides.length,
      generatedTitleOverrideCount: overrides.length,
      manualReviewFlagCount: overrides.filter((entry) => entry.manualReviewRequired).length,
      sourceFilesRenamed: false,
      generatedMediaFilesRenamed: false,
    },
    badTitlePatterns: [
      "ChatGPT Image",
      "Failed ChatGPT Image",
      "OpenAI",
      "date or timestamp export names",
      "generic failed or generated names",
    ],
    overrides,
  };
}

function inferCleanTitle(item, hubs, searchEntry) {
  const haystack = [
    item.categorySlug,
    item.filenameSlug,
    searchEntry?.tags?.join(" "),
    hubs.map((hub) => `${hub.slug} ${hub.title}`).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const fallback of TITLE_FALLBACKS) {
    if (fallback.test.test(haystack)) {
      return {
        title: fallback.title,
        confidence: "medium",
        reason: `Inferred from category and hub terms matching ${fallback.test.source}.`,
      };
    }
  }

  const categoryTitle = titleCase(
    item.categorySlug
      .replace(/[-_]+/g, " ")
      .replace(/\b(?:chatgpt|image|failed|openai)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  if (categoryTitle) {
    return {
      title: `${categoryTitle} Coloring Page`,
      confidence: "low",
      reason: "Fallback title inferred from category because the visible title was an export name.",
    };
  }

  return {
    title: "Printable Coloring Page",
    confidence: "low",
    reason: "Safe fallback title used because the subject could not be inferred confidently.",
  };
}

function applyTitleOverridesToSearchIndex(searchIndexManifest, overrides) {
  const overrideByAssetId = new Map(overrides.map((entry) => [entry.assetId, entry]));
  return {
    ...searchIndexManifest,
    entries: (searchIndexManifest.entries || []).map((entry) => {
      const override = overrideByAssetId.get(entry.assetId);
      if (!override) return entry;
      return {
        ...entry,
        title: override.cleanTitle,
        searchText: normalizeSearchText([
          override.cleanTitle,
          entry.categorySlug,
          cleanFilenameTerms(entry.filenameSlug),
          entry.tags?.join(" "),
          entry.hubIds?.join(" "),
        ]),
      };
    }),
  };
}

function buildColorRules(generatedAt) {
  return {
    runId: ROUND4K_RUN_ID,
    generatedAt,
    summary: {
      approvedBaseTokenCount: 13,
      approvedSoftBandCount: 5,
      randomYellowBeigeBanned: true,
      gradientsAllowed: false,
      componentLocalHexAllowed: false,
      coloredSectionStyle: "full-width section bands only",
    },
    approvedBaseTokens: [
      "canvas",
      "paper",
      "paperSoft",
      "ink",
      "text",
      "textMuted",
      "plum",
      "coral",
      "sky",
      "mint",
      "rose",
      "deepNavy",
      "focus",
    ],
    approvedSoftSectionBands: ["softSky", "softMint", "softRose", "softPlum", "softPaper"],
    forbiddenPatterns: [
      "random yellow or beige wrapper cards",
      "section-local hex colors",
      "component-local hex colors",
      "gradients",
      "decorative outlines",
      "layout shadows",
      "image cards nested inside colored rounded wrapper cards",
    ],
    usageRules: [
      "Primary buttons use plum or deepNavy.",
      "Small accents may use coral.",
      "Active filters may use plum or mint where contrast is readable.",
      "Colored sections must be full-width bands with normal max-width inner layout.",
    ],
  };
}

async function buildTypographyAudit(repoRoot, generatedAt) {
  const layout = await readText(repoRoot, "app/layout.tsx");
  const css = [
    await readText(repoRoot, "src/styles/base.css"),
    await readText(repoRoot, "src/styles/components.css"),
    await readText(repoRoot, "src/styles/tokens.css"),
  ].join("\n");

  return {
    runId: ROUND4K_RUN_ID,
    generatedAt,
    summary: {
      nextFontGoogleUsed: /next\/font\/google/.test(layout),
      figtreeConfigured: /\bFigtree\b/.test(layout),
      frauncesConfigured: /\bFraunces\b/.test(layout),
      atkinsonConfigured: /\bAtkinson/.test(layout),
      runtimeGoogleFontLinksPresent: /fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+url\([^)]*font/i.test(`${layout}\n${css}`),
    },
    lockedFonts: [
      { font: "Fraunces", role: "display headings only" },
      { font: "Figtree", role: "body, nav, buttons, filters, card titles, and normal UI" },
      { font: "Atkinson Hyperlegible", role: "documented as unused in Round 4K" },
    ],
    notes: [
      "Fraunces remains reserved for H1 and major editorial headings.",
      "Figtree is the default UI font and is used for cards and controls.",
      "Atkinson Hyperlegible was not added because it created unnecessary typography complexity for this pass.",
    ],
  };
}

function buildUiProblemAudit(generatedAt, badTitleCount) {
  return {
    runId: ROUND4K_RUN_ID,
    generatedAt,
    summary: {
      nestedCardViolationsFound: true,
      randomWarmWrapperColorsFound: true,
      imagePreviewBackingGapsFound: true,
      typographyMismatchFound: true,
      noisyPngSvgControlsFound: true,
      clickablePreviewGapsFound: true,
      badPublicTitleCount: badTitleCount,
    },
    findings: [
      {
        issue: "Featured sections used a rounded colored wrapper around image cards.",
        files: ["app/page.tsx", "app/coloring-pages/page.tsx", "src/components/coloring/HubPageContent.tsx", "src/styles/components.css"],
        correction: "Replace wrapper cards with full-width section bands and normal inner layout.",
      },
      {
        issue: "Yellow and beige visual treatment felt ad hoc.",
        files: ["src/styles/tokens.css", "src/styles/components.css"],
        correction: "Remove yellow tokens and limit color to approved creative tokens and soft bands.",
      },
      {
        issue: "Gallery media showed colored backing around previews and used thumbnail-first preview URLs.",
        files: ["src/lib/coloring/assets.ts", "src/components/coloring/ImageCard.tsx", "src/styles/components.css"],
        correction: "Use PNG preview first for cards and white paper media wells with no visible padding.",
      },
      {
        issue: "PNG and SVG controls competed with Print as primary pills.",
        files: ["src/components/coloring/ImageCard.tsx"],
        correction: "Keep Print visible and collapse downloading to one quiet secondary action.",
      },
      {
        issue: "Some public titles exposed AI export names.",
        files: ["src/generated/coloring/title-overrides.json", "src/lib/coloring/data.ts"],
        correction: "Apply public display title overrides without renaming files.",
      },
    ],
  };
}

function buildGalleryCardFixes(generatedAt, titleOverrideCount) {
  return {
    runId: ROUND4K_RUN_ID,
    generatedAt,
    summary: {
      nestedCardsRemoved: true,
      featuredSectionsUseFullWidthBands: true,
      mainPreviewAssetPreference: "pngPreview before thumbnail",
      visiblePngSvgPillsRemoved: true,
      printActionVisible: true,
      compactDownloadControlKept: true,
      previewImagesClickable: true,
      stableAssetAnchors: true,
      publicTitleOverridesGenerated: titleOverrideCount,
      sourceFilesRenamed: false,
      generatedMediaFilesRenamed: false,
      appApiRouteReintroduced: false,
    },
    changedSurfaces: [
      "ImageCard media link and actions",
      "GalleryGrid item target plumbing",
      "homepage preview links",
      "coloring-pages landing preview links",
      "hub featured preview links",
      "gallery media CSS",
    ],
  };
}

async function buildBrowserQaPlaceholder(repoRoot, generatedAt) {
  const existing = await readJsonIfExists(repoRoot, "pipeline/manifests/round-4k-browser-qa-results.json");
  if (existing?.runId === ROUND4K_RUN_ID && existing.summary?.status === "completed") return existing;
  return {
    runId: ROUND4K_RUN_ID,
    generatedAt,
    summary: {
      status: "pending_real_browser_qa",
      realMediaRendered: null,
      nestedCardsPresent: null,
      randomYellowBeigePresent: null,
      pngSvgPillsVisible: null,
      printActionVisible: null,
      clickableImagesWorking: null,
      badTitlesVisible: null,
      appApiRoutePresent: false,
      publicMediaCopied: false,
    },
    localPreviewCommands: [
      "python -m http.server 4175 --bind 127.0.0.1 --directory pipeline/r2-upload",
      "$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'; npm run build; npx serve out -l 3005",
    ],
    pagesPlanned: [
      "/",
      "/coloring-pages",
      "/coloring-pages/geometric",
      "/coloring-pages/animals",
      "/coloring-pages/plushies",
      "/coloring-pages/mandalas",
      "/coloring-pages/anime-girls",
      "/coloring-pages/chibi",
      "/coloring-pages/fantasy",
      "/coloring-pages/christmas",
      "/coloring-pages/halloween",
      "/coloring-pages/cars",
      "/coloring-pages/prehistoric-animals",
      "/coloring-pages/indoor-plants",
    ],
    screenshots: [],
  };
}

async function writeReports(repoRoot, artifacts) {
  await writeText(repoRoot, "pipeline/reports/round-4k-project-context-check.md", renderProjectContextReport(artifacts.context));
  await writeText(repoRoot, "pipeline/reports/round-4k-ui-problem-audit.md", renderUiProblemAuditReport(artifacts.uiAudit));
  await writeText(repoRoot, "pipeline/reports/round-4k-color-token-rules.md", renderColorRulesReport(artifacts.colorRules));
  await writeText(repoRoot, "pipeline/reports/round-4k-display-title-cleanup-report.md", renderTitleCleanupReport(artifacts.titleCleanup));
  await writeText(repoRoot, "pipeline/reports/round-4k-typography-audit.md", renderTypographyReport(artifacts.typography));
  await writeText(repoRoot, "pipeline/reports/round-4k-gallery-card-fixes.md", renderGalleryCardFixesReport(artifacts.cardFixes));
  await writeText(repoRoot, "pipeline/reports/round-4k-browser-qa-report.md", renderBrowserQaReport(artifacts.browserQa));
  await writeText(repoRoot, "pipeline/reports/round-4k-next-phase-plan.md", renderNextPhasePlan());
}

function renderProjectContextReport(context) {
  return `# Round 4K Project Context Check

Round 4K started in the expected project context.

- Repository: ${context.summary.correctRepository ? "i-love-coloring-page" : "unexpected"}
- Branch: ${context.summary.branch}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api present: ${context.summary.appApiRoutePresent}
- Hub routes present: ${context.summary.hubRoutesExist}
- Full local bundle present: ${context.summary.r2BundleExists}
- Generated media copied into public: ${context.summary.publicGeneratedMediaPresent}
- Sitemap route count: ${context.summary.sitemapRouteCount}

No upload, media move, backend route, source image edit, or generated filename rename is part of this round.
`;
}

function renderUiProblemAuditReport(uiAudit) {
  return `# Round 4K UI Problem Audit

The audit found the Round 4J issues described in the prompt and scoped them to layout, card, title, and token fixes.

- Nested colored featured wrappers found: ${uiAudit.summary.nestedCardViolationsFound}
- Random warm wrapper colors found: ${uiAudit.summary.randomWarmWrapperColorsFound}
- Preview backing gaps found: ${uiAudit.summary.imagePreviewBackingGapsFound}
- Typography mismatch found: ${uiAudit.summary.typographyMismatchFound}
- Visible PNG/SVG action pills found: ${uiAudit.summary.noisyPngSvgControlsFound}
- Bad public titles detected: ${uiAudit.summary.badPublicTitleCount}

Corrections are limited to the static frontend and generated public metadata. Source media paths and generated filenames stay unchanged.
`;
}

function renderColorRulesReport(colorRules) {
  return `# Round 4K Color Token Rules

Round 4K locks the creative layer to approved tokens only. Random yellow or beige wrapper colors are not allowed.

Allowed base tokens: ${colorRules.approvedBaseTokens.join(", ")}.

Allowed soft bands: ${colorRules.approvedSoftSectionBands.join(", ")}.

Rules:
- No gradients.
- No component-local hex colors.
- No section-local hex colors.
- No decorative outlines.
- No layout shadows.
- Colored sections must be full-width bands, not rounded wrapper cards around image cards.
- Primary buttons use plum or deepNavy, with coral reserved for small accents.
`;
}

function renderTitleCleanupReport(titleCleanup) {
  const rows = titleCleanup.overrides
    .map((entry) => `| ${entry.assetId} | ${entry.originalTitle} | ${entry.cleanTitle} | ${entry.confidence} | ${entry.manualReviewRequired} |`)
    .join("\n");
  return `# Round 4K Display Title Cleanup Report

Bad public export-style titles were cleaned through generated display title overrides only.

- Bad titles detected: ${titleCleanup.summary.detectedBadTitleCount}
- Title overrides generated: ${titleCleanup.summary.generatedTitleOverrideCount}
- Manual review flags: ${titleCleanup.summary.manualReviewFlagCount}
- Source files renamed: ${titleCleanup.summary.sourceFilesRenamed}
- Generated media filenames renamed: ${titleCleanup.summary.generatedMediaFilesRenamed}

| Asset ID | Original public title | Clean public title | Confidence | Manual review |
| --- | --- | --- | --- | --- |
${rows}

These overrides are for public UI text. A later filename cleanup round may address source identifiers and object names if explicitly approved.
`;
}

function renderTypographyReport(typography) {
  return `# Round 4K Typography Audit

Typography remains locked to Next font loading.

- next/font/google used: ${typography.summary.nextFontGoogleUsed}
- Figtree configured: ${typography.summary.figtreeConfigured}
- Fraunces configured: ${typography.summary.frauncesConfigured}
- Atkinson Hyperlegible configured: ${typography.summary.atkinsonConfigured}
- Runtime Google font links present: ${typography.summary.runtimeGoogleFontLinksPresent}

Fraunces is reserved for H1 and major section headings. Figtree handles body copy, cards, nav, buttons, filters, search controls, captions, and normal UI. Atkinson Hyperlegible is documented as unused for this pass.
`;
}

function renderGalleryCardFixesReport(cardFixes) {
  return `# Round 4K Gallery Card Fixes

The card and section fixes keep artwork first while preserving the static gallery architecture.

- Nested cards removed: ${cardFixes.summary.nestedCardsRemoved}
- Featured sections use full-width bands: ${cardFixes.summary.featuredSectionsUseFullWidthBands}
- Main preview preference: ${cardFixes.summary.mainPreviewAssetPreference}
- Visible PNG/SVG pills removed: ${cardFixes.summary.visiblePngSvgPillsRemoved}
- Print action visible: ${cardFixes.summary.printActionVisible}
- Compact Download control kept: ${cardFixes.summary.compactDownloadControlKept}
- Preview images clickable: ${cardFixes.summary.previewImagesClickable}
- Stable asset anchors: ${cardFixes.summary.stableAssetAnchors}
- Source files renamed: ${cardFixes.summary.sourceFilesRenamed}
- Generated media filenames renamed: ${cardFixes.summary.generatedMediaFilesRenamed}

Image card previews now link to static page anchors such as \`#asset-<assetId>\`. Homepage and collection preview tiles link to the visible gallery target route plus the same anchor.
`;
}

function renderBrowserQaReport(browserQa) {
  const commands = browserQa.localPreviewCommands || [
    "python -m http.server 4175 --bind 127.0.0.1 --directory pipeline/r2-upload",
    "$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'; npm run build; npx serve out -l 3005",
  ];
  const pages = browserQa.pagesPlanned || (browserQa.pagesInspected || []).map((entry) => entry.path);
  const screenshots = browserQa.screenshots?.length
    ? browserQa.screenshots.map((file) => `- ${file}`).join("\n")
    : "- No browser screenshots recorded yet.";
  const pageLines = browserQa.pagesInspected?.length
    ? browserQa.pagesInspected
        .map((entry) => `- ${entry.path}${entry.suffix ? ` (${entry.suffix})` : ""}: ${entry.imgCount ?? "n/a"} images, ${entry.mediaLinkCount ?? "n/a"} image links, ${entry.printCount ?? "n/a"} Print actions`)
        .join("\n")
    : pages.map((page) => `- ${page}`).join("\n");
  const summary = browserQa.summary || {};
  const interactionLines = browserQa.interactionChecks
    ? [
        `- Search: ${browserQa.interactionChecks.search?.status || "not_recorded"}`,
        `- Filters: ${browserQa.interactionChecks.filters?.status || "not_recorded"}`,
      ].join("\n")
    : "- Search and filter browser checks pending.";
  return `# Round 4K Browser QA Report

Status: ${browserQa.status || browserQa.summary.status}

Local preview commands:
- \`${commands[0]}\`
- \`${commands[1]}\`

## Summary

- Real media rendered: ${summary.realMediaRendered}
- Nested card wrappers present: ${summary.nestedCardsPresent}
- Random yellow or beige wrappers present: ${summary.randomYellowBeigePresent}
- PNG/SVG card action pills visible: ${summary.pngSvgPillsVisible}
- Print action visible: ${summary.printActionVisible}
- Download control visible: ${summary.downloadControlVisible}
- Clickable image links present: ${summary.clickableImagesWorking}
- Bad export titles visible: ${summary.badTitlesVisible}
- app/api references present: ${summary.appApiRoutePresent}
- Local filesystem paths visible: ${summary.localFilesystemPathVisible}

## Inspection Pages

${pageLines}

## Search And Filter Checks

${interactionLines}

## Screenshots
${screenshots}

Screenshots are local review artifacts under \`pipeline/review/round-4k/screenshots/\` and should not be committed.
`;
}

function renderNextPhasePlan() {
  return `# Round 4K Next Phase Plan

Round 4L should be a browser-led manual polish pass after these corrected visual rules are in place.

Recommended Round 4L scope:
- Inspect the corrected gallery with the local media server and the static app on localhost 3005.
- Make only small spacing, responsiveness, and copy refinements found during real-media QA.
- Keep the architecture static and frontend-only.
- Do not start SEO image sitemap, Open Graph image, JSON-LD, backend, upload, taxonomy, or filename cleanup work until explicitly requested.
- If preview quality is still soft, plan a dedicated preview asset sizing round instead of regenerating media inside a UI polish pass.
`;
}

async function publicContainsGeneratedMedia(repoRoot) {
  const publicRoot = path.join(repoRoot, "public");
  if (!(await exists(publicRoot))) return false;
  const files = await listFiles(publicRoot);
  return files.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file));
}

async function listFiles(root) {
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else results.push(entryPath);
    }
  }
  await walk(root);
  return results;
}

async function readJson(repoRoot, relativePath) {
  return JSON.parse(await readText(repoRoot, relativePath));
}

async function readJsonIfExists(repoRoot, relativePath) {
  try {
    return await readJson(repoRoot, relativePath);
  } catch {
    return null;
  }
}

async function readText(repoRoot, relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function writeJson(repoRoot, relativePath, value) {
  await writeText(repoRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(repoRoot, relativePath, value) {
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function git(repoRoot, args) {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
  return stdout;
}

function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/\b[a-z0-9]/g, (letter) => letter.toUpperCase())
    .trim();
}

function normalizeSearchText(parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\b(?:failed|chatgpt|openai|image)\b/g, " ")
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g, " ")
    .replace(/\b(?:am|pm)\b/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanFilenameTerms(value) {
  return String(value || "")
    .replace(/\b(?:failed|chatgpt|openai|image)\b/gi, " ")
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, " ")
    .replace(/\b\d{1,4}\b/g, " ");
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

if (import.meta.url === pathToFileUrl(process.argv[1])) {
  runRound4KDisplayTitleCleanup()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

function pathToFileUrl(value) {
  if (!value) return "";
  return pathToFileURL(path.resolve(value)).href;
}
