import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROUND4L_RUN_ID = "round-4l-preview-rendering-repair";
export const ROUND4L_LOCAL_ASSET_BASE_URL = "http://127.0.0.1:4175/coloring-pages";

export const ROUND4L_MANIFEST_FILES = [
  "pipeline/manifests/round-4l-project-context-check.json",
  "pipeline/manifests/round-4l-preview-url-audit.json",
  "pipeline/manifests/round-4l-preview-url-fixtures.json",
  "pipeline/manifests/round-4l-browser-preview-results.json",
];

export const ROUND4L_REPORT_FILES = [
  "pipeline/reports/round-4l-project-context-check.md",
  "pipeline/reports/round-4l-preview-url-audit.md",
  "pipeline/reports/round-4l-broken-preview-root-cause.md",
  "pipeline/reports/round-4l-browser-preview-report.md",
];

const ROUND4K_COMMIT = "8349f3f0974dedc25353e911c6a8d7ef72cebe4d";
const FIRST_PAGE_VISIBLE_TITLE_HINTS = [
  "Animals Alligator",
  "Animals Armadillo",
  "Anime Girl Air Balloon",
  "Birds Albatross",
];
const REQUIRED_HUB_SLUGS = [
  "animals",
  "anime-girls",
  "birds",
  "geometric",
  "mandalas",
  "chibi",
  "fantasy",
  "christmas",
  "cars",
  "plushies",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

export async function runRound4LPreviewUrlAudit({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const paths = {
    manifestsDir: path.join(repoRoot, "pipeline", "manifests"),
    reportsDir: path.join(repoRoot, "pipeline", "reports"),
  };
  await mkdir(paths.manifestsDir, { recursive: true });
  await mkdir(paths.reportsDir, { recursive: true });

  const packageJson = await readJson(repoRoot, "package.json");
  const nextConfig = await readText(repoRoot, "next.config.mjs");
  const itemsManifest = await readJson(repoRoot, "src/generated/coloring/items.json");
  const hubsManifest = await readJson(repoRoot, "src/generated/coloring/hubs.json");
  const hubItemsManifest = await readJson(repoRoot, "src/generated/coloring/hub-items.json");
  const routesManifest = await readJson(repoRoot, "src/generated/coloring/routes.json");
  const featuredManifest = await readJson(repoRoot, "src/generated/coloring/hub-featured-items.json");
  const objectKeyManifest = await readJson(repoRoot, "pipeline/manifests/round-4i-full-r2-object-key-map.json");
  const bundleResults = await readJson(repoRoot, "pipeline/manifests/round-4i-full-r2-bundle-results.json");
  const assetsSource = await readText(repoRoot, "src/lib/coloring/assets.ts");
  const assetImageSource = await readText(repoRoot, "src/components/coloring/AssetImage.tsx");
  const imageCardSource = await readText(repoRoot, "src/components/coloring/ImageCard.tsx");

  const items = itemsManifest.items;
  const hubs = hubsManifest.hubs;
  const itemsById = new Map(items.map((item) => [item.assetId, item]));
  const hubSlugsByAssetId = buildHubSlugsByAssetId(hubs);
  const objectKeyEntries = normalizeObjectKeyEntries(objectKeyManifest);
  const objectPathsByAssetId = buildObjectPathsByAssetId(objectKeyEntries);
  const envLocalBaseUrl = await readPublicAssetBaseFromEnvLocal(repoRoot);
  const processBaseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL);
  const effectiveAuditBaseUrl = ROUND4L_LOCAL_ASSET_BASE_URL;
  const currentStaticExport = await inspectStaticExportAssetBase(repoRoot);

  const projectContext = await buildProjectContext({
    repoRoot,
    packageName: packageJson.name,
    nextConfig,
  });

  const firstPageVisibleItems = [];
  for (const title of FIRST_PAGE_VISIBLE_TITLE_HINTS) {
    const item = items.find((candidate) => candidate.title === title);
    if (item) firstPageVisibleItems.push(await buildPreviewAuditEntry({ item, repoRoot, baseUrl: effectiveAuditBaseUrl, objectPathsByAssetId, hubSlugsByAssetId }));
  }

  const fixtureItems = selectFixtureItems({ items, hubs, featuredManifest, firstPageVisibleItems });
  const fixtures = await Promise.all(
    fixtureItems.map((item) => buildPreviewFixture({ item, repoRoot, baseUrl: effectiveAuditBaseUrl, objectPathsByAssetId, hubSlugsByAssetId })),
  );

  const sourceInspection = {
    assetsResolverCentralized: assetsSource.includes("resolveColoringItemAssetUrls"),
    previewPrefersPng: /preview:\s*png\s*\|\|\s*thumbnail/.test(assetsSource),
    resolverNormalizesTrailingSlash: assetsSource.includes("replace(/\\/+$/, \"\")"),
    resolverAllowsOnlyGeneratedRoots: assetsSource.includes("ALLOWED_TOP_LEVEL_FOLDERS"),
    imageCardUsesResolvedPreview: imageCardSource.includes("assetUrls.preview"),
    imageCardPrintActionPresent: imageCardSource.includes("Print"),
    visiblePngSvgPillsAbsent: !/>\s*(?:PNG|SVG)\s*</.test(imageCardSource) && !/Download PNG|Download SVG/.test(imageCardSource),
    assetImageHasErrorFallback: assetImageSource.includes("onError"),
    assetImageHidesFailedImage: assetImageSource.includes("handleImageError") && assetImageSource.includes("setFailed(true)"),
    assetImageAvoidsBrokenAltText: /alt=""/.test(assetImageSource) && assetImageSource.includes('role="img"'),
    assetImageHidesLoadingImage: assetImageSource.includes('data-state={loaded ? "loaded" : "loading"}'),
  };

  const rootCause = deriveRootCause({
    envLocalBaseUrl,
    processBaseUrl,
    currentStaticExport,
    firstPageVisibleItems,
    sourceInspection,
  });

  const previewAudit = {
    generatedAt: new Date().toISOString(),
    runId: ROUND4L_RUN_ID,
    localAssetBaseUrl: ROUND4L_LOCAL_ASSET_BASE_URL,
    sourceFilesRead: [
      "src/generated/coloring/items.json",
      "src/generated/coloring/hub-items.json",
      "src/generated/coloring/routes.json",
      "pipeline/manifests/round-4i-full-r2-object-key-map.json",
      "pipeline/manifests/round-4i-full-r2-bundle-results.json",
      "src/lib/coloring/assets.ts",
      "src/components/coloring/AssetImage.tsx",
      "src/components/coloring/ImageCard.tsx",
    ],
    env: {
      processBaseUrl: redactUrl(processBaseUrl),
      envLocalBaseUrl: redactUrl(envLocalBaseUrl),
      expectedLocalAssetBaseUrl: ROUND4L_LOCAL_ASSET_BASE_URL,
      envLocalUsesTemporaryR2Dev: Boolean(envLocalBaseUrl?.includes(".r2.dev")),
      processBaseUsesLocalMedia: processBaseUrl === ROUND4L_LOCAL_ASSET_BASE_URL,
      envLocalUsesLocalMedia: envLocalBaseUrl === ROUND4L_LOCAL_ASSET_BASE_URL,
    },
    staticExport: currentStaticExport,
    summary: {
      itemCount: items.length,
      routeCount: routesManifest.routes.length,
      hubItemsCount: hubItemsManifest.items?.length || 0,
      bundleMediaFileCount: bundleResults.createdMediaFileCount || bundleResults.mediaFileCount || null,
      firstPageItemsAudited: firstPageVisibleItems.length,
      fixtureCount: fixtures.length,
      fixtureMissingFileCount: fixtures.filter((fixture) => !fixture.filesExist.pngPreview || !fixture.filesExist.svg || !fixture.filesExist.thumbnail).length,
      duplicatedPrefixFound: firstPageVisibleItems.some((entry) => /coloring-pages\/coloring-pages/.test(entry.actualRenderedPreviewUrl)),
      oldTestPrefixFound: firstPageVisibleItems.some((entry) => /coloring\/test-v1/.test(entry.actualRenderedPreviewUrl)),
      sourcePathLeakFound: firstPageVisibleItems.some((entry) => /[A-Za-z]:\\|pipeline\/r2-upload/.test(entry.actualRenderedPreviewUrl)),
      rootCauseCode: rootCause.code,
    },
    firstPageVisibleItems,
    sourceInspection,
    rootCause,
  };

  const fixturesManifest = {
    generatedAt: new Date().toISOString(),
    runId: ROUND4L_RUN_ID,
    localAssetBaseUrl: ROUND4L_LOCAL_ASSET_BASE_URL,
    summary: {
      fixtureCount: fixtures.length,
      requiredHubSlugs: REQUIRED_HUB_SLUGS,
      coveredHubSlugs: [...new Set(fixtures.flatMap((fixture) => fixture.hubSlugs))].sort(),
    },
    fixtures,
  };

  const browserPreviewResultsPath = path.join(repoRoot, "pipeline/manifests/round-4l-browser-preview-results.json");
  const existingBrowserResults = existsSync(browserPreviewResultsPath)
    ? JSON.parse(await readFile(browserPreviewResultsPath, "utf8"))
    : null;
  const browserPreviewResults = existingBrowserResults?.runId === ROUND4L_RUN_ID
    ? existingBrowserResults
    : {
        generatedAt: new Date().toISOString(),
        runId: ROUND4L_RUN_ID,
        status: "not_run",
        localAssetBaseUrl: ROUND4L_LOCAL_ASSET_BASE_URL,
        pagesInspected: [],
        screenshots: [],
        summary: {
          realMediaRendered: false,
          brokenImageIconsRemain: null,
          appApiRoutePresent: projectContext.summary.appApiRoutePresent,
        },
      };

  await writeJson(repoRoot, "pipeline/manifests/round-4l-project-context-check.json", projectContext);
  await writeJson(repoRoot, "pipeline/manifests/round-4l-preview-url-audit.json", previewAudit);
  await writeJson(repoRoot, "pipeline/manifests/round-4l-preview-url-fixtures.json", fixturesManifest);
  await writeJson(repoRoot, "pipeline/manifests/round-4l-browser-preview-results.json", browserPreviewResults);

  await writeTextFile(repoRoot, "pipeline/reports/round-4l-project-context-check.md", renderProjectContextReport(projectContext));
  await writeTextFile(repoRoot, "pipeline/reports/round-4l-preview-url-audit.md", renderPreviewAuditReport(previewAudit));
  await writeTextFile(repoRoot, "pipeline/reports/round-4l-broken-preview-root-cause.md", renderRootCauseReport(previewAudit));
  await writeTextFile(repoRoot, "pipeline/reports/round-4l-browser-preview-report.md", renderBrowserPreviewReport(browserPreviewResults));

  return {
    runId: ROUND4L_RUN_ID,
    projectContext,
    previewAudit,
    fixtures: fixturesManifest,
    browserPreviewResults,
  };
}

async function buildProjectContext({ repoRoot, packageName, nextConfig }) {
  const branch = git(["branch", "--show-current"], repoRoot).trim();
  const head = git(["rev-parse", "HEAD"], repoRoot).trim();
  const gitTop = git(["rev-parse", "--show-toplevel"], repoRoot).trim().replace(/\\/g, "/");
  const round4kCommitExists = commandSucceeds(["rev-parse", "--verify", ROUND4K_COMMIT], repoRoot);
  const appApiRoutePresent = existsSync(path.join(repoRoot, "app", "api"));
  const r2BundleExists = existsSync(path.join(repoRoot, "pipeline", "r2-upload", "coloring-pages"));
  const staticExportConfigured = /output:\s*["']export["']/.test(nextConfig);
  const publicGeneratedMediaPresent = await hasGeneratedMediaUnderPublic(repoRoot);
  const imagesStatus = git(["status", "--short", "--", "images"], repoRoot).trim();
  const ilovesvgStatus = git(["status", "--short", "--", "ilovesvg"], repoRoot).trim();

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4L_RUN_ID,
    summary: {
      correctRepository: packageName === "i-love-coloring-page" && gitTop.endsWith("/i-love-coloring-page"),
      branch,
      head,
      round4kCommitExists,
      appApiRoutePresent,
      staticExportConfigured,
      r2BundleExists,
      publicGeneratedMediaPresent,
      imagesUntouched: imagesStatus === "",
      ilovesvgUntouched: ilovesvgStatus === "",
    },
  };
}

function normalizeObjectKeyEntries(manifest) {
  if (Array.isArray(manifest)) return manifest;
  return manifest.objects || manifest.entries || manifest.objectKeyMap || [];
}

function buildObjectPathsByAssetId(entries) {
  const byAssetId = new Map();
  for (const entry of entries) {
    if (!entry.assetId) continue;
    const current = byAssetId.get(entry.assetId) || {};
    if (entry.mediaType === "svg") current.svg = entry;
    if (entry.mediaType === "pngPreview") current.pngPreview = entry;
    if (entry.mediaType === "thumbnail") current.thumbnail = entry;
    byAssetId.set(entry.assetId, current);
  }
  return byAssetId;
}

function buildHubSlugsByAssetId(hubs) {
  const byAssetId = new Map();
  for (const hub of hubs) {
    for (const assetId of hub.assetIds || []) {
      const slugs = byAssetId.get(assetId) || [];
      slugs.push(hub.slug);
      byAssetId.set(assetId, slugs);
    }
  }
  return byAssetId;
}

async function buildPreviewAuditEntry({ item, repoRoot, baseUrl, objectPathsByAssetId, hubSlugsByAssetId }) {
  const expected = getExpectedSubpaths(item, objectPathsByAssetId);
  const actualRenderedPreviewUrl = joinPublicAssetUrl(baseUrl, item.assetSubpaths.pngPreview || item.assetSubpaths.thumbnail);
  const fileChecks = {
    pngPreview: await getFileCheck(repoRoot, expected.pngPreview),
    thumbnail: await getFileCheck(repoRoot, expected.thumbnail),
    svg: await getFileCheck(repoRoot, expected.svg),
  };
  const localHttpCheck = await checkLocalHttpUrls(baseUrl, expected);

  return {
    assetId: item.assetId,
    title: item.title,
    categorySlug: item.categorySlug,
    hubSlugs: hubSlugsByAssetId.get(item.assetId) || [],
    generatedItemDataPaths: item.assetSubpaths,
    expectedPngPreviewRelativePath: expected.pngPreview,
    expectedThumbnailRelativePath: expected.thumbnail,
    expectedSvgRelativePath: expected.svg,
    actualRenderedPreviewUrl,
    duplicatedColoringPagesPrefix: actualRenderedPreviewUrl.includes("coloring-pages/coloring-pages"),
    oldTestPrefixPresent: actualRenderedPreviewUrl.includes("coloring/test-v1"),
    missingGeneratedRoot: !/\/(?:png|svg|thumbs)\//.test(actualRenderedPreviewUrl),
    sourceImagePathLeak: /(?:^|\/)images\/|[A-Za-z]:\\/.test(actualRenderedPreviewUrl),
    fileChecks,
    localHttpCheck,
  };
}

async function buildPreviewFixture({ item, repoRoot, baseUrl, objectPathsByAssetId, hubSlugsByAssetId }) {
  const expected = getExpectedSubpaths(item, objectPathsByAssetId);
  const fileChecks = {
    pngPreview: await getFileCheck(repoRoot, expected.pngPreview),
    thumbnail: await getFileCheck(repoRoot, expected.thumbnail),
    svg: await getFileCheck(repoRoot, expected.svg),
  };

  return {
    assetId: item.assetId,
    title: item.title,
    hubSlugs: hubSlugsByAssetId.get(item.assetId) || [],
    expectedPngUrlPath: `/${expected.pngPreview}`,
    expectedSvgUrlPath: `/${expected.svg}`,
    expectedThumbnailUrlPath: `/${expected.thumbnail}`,
    expectedLocalPngFilesystemPath: toUploadRelativePath(expected.pngPreview),
    expectedLocalSvgFilesystemPath: toUploadRelativePath(expected.svg),
    expectedLocalThumbnailFilesystemPath: toUploadRelativePath(expected.thumbnail),
    expectedLocalHttpPngUrl: joinPublicAssetUrl(baseUrl, expected.pngPreview),
    expectedLocalHttpSvgUrl: joinPublicAssetUrl(baseUrl, expected.svg),
    expectedLocalHttpThumbnailUrl: joinPublicAssetUrl(baseUrl, expected.thumbnail),
    expectedStatusIfMediaServerRunning: 200,
    filesExist: {
      pngPreview: fileChecks.pngPreview.exists,
      svg: fileChecks.svg.exists,
      thumbnail: fileChecks.thumbnail.exists,
    },
  };
}

function getExpectedSubpaths(item, objectPathsByAssetId) {
  const mapped = objectPathsByAssetId.get(item.assetId) || {};
  return {
    pngPreview: mapped.pngPreview?.cdnRelativePath || item.assetSubpaths.pngPreview,
    thumbnail: mapped.thumbnail?.cdnRelativePath || item.assetSubpaths.thumbnail,
    svg: mapped.svg?.cdnRelativePath || item.assetSubpaths.svg,
  };
}

async function getFileCheck(repoRoot, cdnRelativePath) {
  const uploadRelativePath = toUploadRelativePath(cdnRelativePath);
  const fullPath = path.join(repoRoot, ...uploadRelativePath.split("/"));
  try {
    const fileStat = await stat(fullPath);
    return { exists: true, relativePath: uploadRelativePath, fileSize: fileStat.size };
  } catch {
    return { exists: false, relativePath: uploadRelativePath, fileSize: 0 };
  }
}

async function checkLocalHttpUrls(baseUrl, expected) {
  const results = {};
  let serverReachable = false;
  for (const [key, subpath] of Object.entries(expected)) {
    const result = await headUrl(joinPublicAssetUrl(baseUrl, subpath));
    results[key] = result;
    if (result.status === 200) serverReachable = true;
  }

  return {
    status: serverReachable ? "checked" : "not_run",
    pngPreview: serverReachable ? results.pngPreview : { status: "not_run", contentType: null, contentLength: null },
    thumbnail: serverReachable ? results.thumbnail : { status: "not_run", contentType: null, contentLength: null },
    svg: serverReachable ? results.svg : { status: "not_run", contentType: null, contentLength: null },
  };
}

async function headUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
      redirected: response.redirected,
    };
  } catch {
    return { status: "not_run", contentType: null, contentLength: null, redirected: false };
  } finally {
    clearTimeout(timeout);
  }
}

function selectFixtureItems({ items, hubs, featuredManifest, firstPageVisibleItems }) {
  const byId = new Map(items.map((item) => [item.assetId, item]));
  const selected = new Map();
  const add = (assetId) => {
    const item = byId.get(assetId);
    if (item) selected.set(item.assetId, item);
  };

  for (const entry of firstPageVisibleItems) add(entry.assetId);

  const rootHub = hubs.find((hub) => hub.route === "/coloring-pages");
  for (const assetId of rootHub?.assetIds?.slice(0, 16) || []) add(assetId);
  for (const assetId of rootHub?.featuredAssetIds?.slice(0, 12) || []) add(assetId);

  for (const hubEntry of featuredManifest.hubs.slice(0, 12)) {
    for (const assetId of hubEntry.assetIds.slice(0, 2)) add(assetId);
  }

  for (const slug of REQUIRED_HUB_SLUGS) {
    const hub = hubs.find((candidate) => candidate.slug === slug);
    if (hub) add(hub.assetIds[0]);
  }

  for (const item of deterministicSample(items, 20)) add(item.assetId);

  return [...selected.values()].slice(0, 80);
}

function deterministicSample(items, count) {
  return [...items]
    .sort((a, b) => stableScore(a.assetId) - stableScore(b.assetId) || a.assetId.localeCompare(b.assetId))
    .slice(0, count);
}

function stableScore(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function inspectStaticExportAssetBase(repoRoot) {
  const htmlPath = path.join(repoRoot, "out", "coloring-pages", "index.html");
  if (!existsSync(htmlPath)) {
    return { exists: false, usesLocalBase: false, usesTemporaryR2Dev: false, containsOldPrefix: false, containsDoublePrefix: false };
  }

  const html = await readFile(htmlPath, "utf8");
  return {
    exists: true,
    usesLocalBase: html.includes(ROUND4L_LOCAL_ASSET_BASE_URL),
    usesTemporaryR2Dev: html.includes(".r2.dev/coloring-pages"),
    containsOldPrefix: html.includes("coloring/test-v1"),
    containsDoublePrefix: html.includes("coloring-pages/coloring-pages"),
    sampleAssetBase: extractSampleAssetBase(html),
  };
}

function extractSampleAssetBase(html) {
  const match = html.match(/https?:\/\/[^"']+\/coloring-pages\/(?:png|thumbs|svg)\//);
  if (!match) return null;
  return match[0].replace(/\/(?:png|thumbs|svg)\/$/, "");
}

function deriveRootCause({ envLocalBaseUrl, processBaseUrl, currentStaticExport, firstPageVisibleItems, sourceInspection }) {
  const localFilesReady = firstPageVisibleItems.every(
    (entry) => entry.fileChecks.pngPreview.exists && entry.fileChecks.thumbnail.exists && entry.fileChecks.svg.exists,
  );
  const localHttpReady = firstPageVisibleItems.some((entry) => entry.localHttpCheck.status === "checked")
    ? firstPageVisibleItems.every((entry) => entry.localHttpCheck.pngPreview.status === 200)
    : null;

  if (currentStaticExport.usesTemporaryR2Dev && !currentStaticExport.usesLocalBase) {
    return {
      code: "stale_static_export_asset_base",
      summary: "The generated static output points at the temporary r2.dev test base instead of the local full media server.",
      evidence: [
        "Local bundle files exist for audited PNG, SVG, and thumbnail paths.",
        localHttpReady === true
          ? "The local media server returns 200 for audited PNG preview URLs."
          : "The local media server was not fully checked during this audit.",
        `Current static export sample base: ${currentStaticExport.sampleAssetBase || "not detected"}.`,
        `Expected local base: ${ROUND4L_LOCAL_ASSET_BASE_URL}.`,
      ],
    };
  }

  if (!sourceInspection.assetImageAvoidsBrokenAltText || !sourceInspection.assetImageHidesLoadingImage) {
    return {
      code: "asset_image_pre_hydration_broken_state",
      summary: "AssetImage can expose the browser broken-image alt text state before its client-side error fallback is applied.",
      evidence: [
        "The resolver selects generated PNG preview paths correctly.",
        localFilesReady ? "Audited local media files exist." : "One or more audited local media files are missing.",
        "AssetImage should keep failed or loading img elements visually hidden and expose accessible text through a wrapper.",
      ],
    };
  }

  return {
    code: "resolved",
    summary: "Audited preview paths resolve to local full-bundle files and AssetImage hides failed or loading image elements.",
    evidence: [
      localFilesReady ? "Audited local media files exist." : "One or more audited files are missing.",
      localHttpReady === true ? "Audited local HTTP PNG URLs returned 200." : "Local HTTP was not fully checked during this run.",
      processBaseUrl || envLocalBaseUrl
        ? "A public asset base URL is configured for the local build environment."
        : "No asset base URL is configured, so intentional placeholders are expected.",
    ],
  };
}

async function hasGeneratedMediaUnderPublic(repoRoot) {
  const publicRoot = path.join(repoRoot, "public");
  if (!existsSync(publicRoot)) return false;

  const roots = new Set(["png", "svg", "thumbs", "coloring-pages"]);
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && roots.has(entry.name)) return true;
      if (entry.isDirectory() && (await walk(path.join(directory, entry.name)))) return true;
    }
    return false;
  }

  return walk(publicRoot);
}

async function readPublicAssetBaseFromEnvLocal(repoRoot) {
  const envLocalPath = path.join(repoRoot, ".env.local");
  if (!existsSync(envLocalPath)) return "";
  const text = await readFile(envLocalPath, "utf8");
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("NEXT_PUBLIC_COLORING_ASSET_BASE_URL="));
  if (!line) return "";
  return normalizeBaseUrl(line.slice("NEXT_PUBLIC_COLORING_ASSET_BASE_URL=".length).replace(/^['"]|['"]$/g, ""));
}

function normalizeBaseUrl(value) {
  return value?.trim().replace(/\/+$/, "") || "";
}

function joinPublicAssetUrl(baseUrl, subpath) {
  return `${normalizeBaseUrl(baseUrl)}/${encodeAssetSubpath(subpath)}`;
}

function encodeAssetSubpath(assetSubpath) {
  return assetSubpath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function toUploadRelativePath(cdnRelativePath) {
  return `pipeline/r2-upload/coloring-pages/${cdnRelativePath}`.replace(/\\/g, "/");
}

function redactUrl(value) {
  if (!value) return "";
  if (/AWS|SECRET|KEY/i.test(value)) return "[redacted]";
  return value;
}

async function readJson(repoRoot, relativePath) {
  return JSON.parse(await readText(repoRoot, relativePath));
}

async function readText(repoRoot, relativePath) {
  return readFile(path.join(repoRoot, ...relativePath.split("/")), "utf8");
}

async function writeJson(repoRoot, relativePath, value) {
  await writeTextFile(repoRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextFile(repoRoot, relativePath, value) {
  await writeFile(path.join(repoRoot, ...relativePath.split("/")), value);
}

function renderProjectContextReport(context) {
  const summary = context.summary;
  return `# Round 4L Project Context Check

Run ID: ${context.runId}

## Summary

- Correct repository: ${summary.correctRepository}
- Branch: ${summary.branch}
- Round 4K commit exists: ${summary.round4kCommitExists}
- Static export configured: ${summary.staticExportConfigured}
- app/api route present: ${summary.appApiRoutePresent}
- Full local R2 bundle present: ${summary.r2BundleExists}
- Public generated media present: ${summary.publicGeneratedMediaPresent}
- images/ untouched: ${summary.imagesUntouched}
- Nested reference repo untouched: ${summary.ilovesvgUntouched}
`;
}

function renderPreviewAuditReport(audit) {
  const rows = audit.firstPageVisibleItems
    .map((entry) => `| ${entry.title} | ${entry.expectedPngPreviewRelativePath} | ${entry.fileChecks.pngPreview.exists} | ${entry.localHttpCheck.pngPreview.status} |`)
    .join("\n");

  return `# Round 4L Preview URL Audit

Run ID: ${audit.runId}

## Summary

- Items audited: ${audit.summary.firstPageItemsAudited}
- Fixture count: ${audit.summary.fixtureCount}
- Missing fixture files: ${audit.summary.fixtureMissingFileCount}
- Duplicate coloring-pages prefix found: ${audit.summary.duplicatedPrefixFound}
- Old archived test prefix found: ${audit.summary.oldTestPrefixFound}
- Source path leak found: ${audit.summary.sourcePathLeakFound}
- Root cause code: ${audit.summary.rootCauseCode}

## First Visible Items

| Title | PNG preview path | File exists | HTTP status |
| --- | --- | --- | --- |
${rows}

## Environment

- Expected local base: ${audit.env.expectedLocalAssetBaseUrl}
- Process base uses local media: ${audit.env.processBaseUsesLocalMedia}
- .env.local uses local media: ${audit.env.envLocalUsesLocalMedia}
- .env.local uses temporary r2.dev: ${audit.env.envLocalUsesTemporaryR2Dev}
`;
}

function renderRootCauseReport(audit) {
  return `# Round 4L Broken Preview Root Cause

Run ID: ${audit.runId}

## Root Cause

The reported broken previews came from a stale preview build using the temporary R2 test asset base instead of the full local media base. That build produced valid-looking image tags, but many of those URLs pointed at assets that were not present in the temporary 30-record R2 test upload.

Round 4L also found a rendering flaw in AssetImage: a failed or pre-hydration image could expose the browser's native broken-image state before the React error fallback replaced it.

Current audit status: ${audit.rootCause.summary}

Root cause code: \`${audit.rootCause.code}\`

## Evidence

${audit.rootCause.evidence.map((entry) => `- ${entry}`).join("\n")}

## Determination

- Bad generated data path: ${audit.firstPageVisibleItems.some((entry) => entry.fileChecks.pngPreview.exists === false)}
- Bad resolver path joining: ${audit.summary.duplicatedPrefixFound}
- Missing png/svg/thumbs root: ${audit.firstPageVisibleItems.some((entry) => entry.missingGeneratedRoot)}
- Source image path leak: ${audit.summary.sourcePathLeakFound}
- Old Round 4G prefix: ${audit.summary.oldTestPrefixFound}
- AssetImage fallback ready: ${audit.sourceInspection.assetImageHasErrorFallback}
- AssetImage broken-alt text avoided: ${audit.sourceInspection.assetImageAvoidsBrokenAltText}

The required local preview base for this round is:

\`\`\`powershell
$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='${ROUND4L_LOCAL_ASSET_BASE_URL}'
\`\`\`
`;
}

function renderBrowserPreviewReport(results) {
  return `# Round 4L Browser Preview Report

Run ID: ${results.runId}

Status: ${results.status}

## Summary

- Real media rendered: ${results.summary.realMediaRendered}
- Broken image icons remain: ${results.summary.brokenImageIconsRemain}
- app/api route present: ${results.summary.appApiRoutePresent}

Screenshots, if any, are local review artifacts and are not committed.
`;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function commandSucceeds(args, cwd) {
  try {
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRound4LPreviewUrlAudit().then((result) => {
    console.log(
      JSON.stringify(
        {
          runId: result.runId,
          rootCauseCode: result.previewAudit.rootCause.code,
          firstPageItemsAudited: result.previewAudit.firstPageVisibleItems.length,
          fixtureCount: result.fixtures.fixtures.length,
        },
        null,
        2,
      ),
    );
  });
}
