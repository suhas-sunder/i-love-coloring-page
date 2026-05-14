import { existsSync } from "node:fs";

import {
  ASSET_BASE_URL,
  CONTACT_EMAIL,
  IMAGE_SITEMAP_PATH,
  IMAGE_SITEMAP_URL,
  MAX_IMAGES_PER_URL,
  REGULAR_SITEMAP_URL,
  RUN_ID,
  SITE_URL,
  buildMarkdownTable,
  countRegularSitemapLocs,
  getGitOutput,
  gitObjectExists,
  hasBannedUrlPattern,
  makeGeneratedAt,
  publicPageUrl,
  readJson,
  readText,
  repoPath,
  resolveWebpUrl,
  summarizeBoolean,
  writeJson,
  writeText,
} from "./image-sitemap-utils.mjs";

const REQUIRED_GENERATED_FILES = [
  "src/generated/coloring/runtime-available-items.json",
  "src/generated/coloring/runtime-deferred-items.json",
  "src/generated/coloring/runtime-hubs.json",
  "src/generated/coloring/runtime-hub-items.json",
  "src/generated/coloring/runtime-routes.json",
  "src/generated/coloring/runtime-site-map.json",
  "src/generated/coloring/runtime-asset-paths.json",
  "src/generated/coloring/runtime-seo-pages.json",
];

const CONTEXT_MANIFEST = "pipeline/manifests/image-sitemap-context-check.json";
const CONTEXT_REPORT = "pipeline/reports/image-sitemap-context-check.md";
const REQUIREMENTS_MANIFEST = "pipeline/manifests/image-sitemap-requirements.json";
const REQUIREMENTS_REPORT = "pipeline/reports/image-sitemap-requirements.md";
const ARCHITECTURE_MANIFEST = "pipeline/manifests/image-sitemap-architecture.json";
const ARCHITECTURE_REPORT = "pipeline/reports/image-sitemap-architecture.md";
const DATA_MANIFEST = "pipeline/manifests/image-sitemap-data.json";
const DATA_REPORT = "pipeline/reports/image-sitemap-data-report.md";

const GOOGLE_REQUIREMENT_SOURCES = [
  {
    title: "Image sitemaps",
    url: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps",
  },
  {
    title: "Image SEO best practices",
    url: "https://developers.google.com/search/docs/appearance/google-images",
  },
  {
    title: "Build and submit a sitemap",
    url: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap",
  },
  {
    title: "Manage sitemaps with sitemap index files",
    url: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps",
  },
];

async function main() {
  const packageJson = await readJson("package.json");
  const nextConfig = await readText("next.config.mjs");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const trustPagesSource = await readText("src/lib/trust/trustPages.ts");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const appSource = await readProjectSource(["app", "src"], ["src/generated/coloring/"]);
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const hubsManifest = await readJson("src/generated/coloring/runtime-hubs.json");
  const hubItemsManifest = await readJson("src/generated/coloring/runtime-hub-items.json");
  const routesManifest = await readJson("src/generated/coloring/runtime-routes.json");
  const runtimeSiteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const assetPathsManifest = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const seoPagesManifest = await readJson("src/generated/coloring/runtime-seo-pages.json");
  const previousUxContext = existsSync(repoPath("pipeline/manifests/ux-polish-context-check.json"))
    ? await readJson("pipeline/manifests/ux-polish-context-check.json")
    : null;
  const generatedAt = makeGeneratedAt([available, deferred, hubsManifest, runtimeSiteMap, assetPathsManifest, seoPagesManifest]);

  const context = buildContextManifest({
    generatedAt,
    packageJson,
    nextConfig,
    siteConfig,
    trustPagesSource,
    browserDownloads,
    downloadMenu,
    appSource,
    available,
    deferred,
    hubsManifest,
    runtimeSiteMap,
    previousUxContext,
  });
  await writeJson(CONTEXT_MANIFEST, context);
  await writeText(CONTEXT_REPORT, buildContextReport(context));

  const requirements = buildRequirementsManifest(generatedAt);
  await writeJson(REQUIREMENTS_MANIFEST, requirements);
  await writeText(REQUIREMENTS_REPORT, buildRequirementsReport(requirements));

  const architecture = buildArchitectureManifest(generatedAt);
  await writeJson(ARCHITECTURE_MANIFEST, architecture);
  await writeText(ARCHITECTURE_REPORT, buildArchitectureReport(architecture));

  const data = buildImageSitemapData({
    generatedAt,
    available,
    deferred,
    hubsManifest,
    hubItemsManifest,
    routesManifest,
    assetPathsManifest,
    seoPagesManifest,
  });
  await writeJson(DATA_MANIFEST, data);
  await writeText(DATA_REPORT, buildDataReport(data));
}

function buildContextManifest({
  generatedAt,
  packageJson,
  nextConfig,
  siteConfig,
  trustPagesSource,
  browserDownloads,
  downloadMenu,
  appSource,
  available,
  deferred,
  hubsManifest,
  runtimeSiteMap,
  previousUxContext,
}) {
  const currentBranch = getGitOutput(["rev-parse", "--abbrev-ref", "HEAD"]);
  const regularSitemapLocCount = countRegularSitemapLocs(runtimeSiteMap, trustPagesSource);
  const publicDownloads = `${browserDownloads}\n${downloadMenu}`;

  return {
    generatedAt,
    runId: `${RUN_ID}-context-check`,
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page" && getGitOutput(["rev-parse", "--show-toplevel"]).endsWith("i-love-coloring-page"),
      currentBranch,
      commitE2f1dd1Exists: gitObjectExists("e2f1dd1"),
      appApiRoutePresent: existsSync(repoPath("app/api")),
      coloringPagesRouteExists: existsSync(repoPath("app/coloring-pages/page.tsx")),
      coloringPagesHubRouteExists: existsSync(repoPath("app/coloring-pages/[hubSlug]/page.tsx")),
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      runtimeGeneratedDataExists: REQUIRED_GENERATED_FILES.every((file) => existsSync(repoPath(file))),
      runtimeAvailableRecords: available.summary?.itemCount ?? available.items.length,
      deferredManualReviewRecords: deferred.summary?.deferredRecordCount ?? deferred.records.length,
      runtimeIndexableHubs: hubsManifest.summary?.hubCount ?? hubsManifest.hubs.length,
      regularSitemapLocCountBeforeRound: regularSitemapLocCount,
      siteUrl: /https:\/\/www\.ilovecoloringpage\.com/.test(siteConfig) ? SITE_URL : "",
      publicAssetBaseUrl: /https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages/.test(siteConfig) ? ASSET_BASE_URL : "",
      contactEmail: /admin@ilovecoloringpage\.com/.test(siteConfig) ? CONTACT_EMAIL : "",
      svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(publicDownloads),
      publicDownloadFormats: /label: "PNG"/.test(downloadMenu) && /label: "JPG"/.test(downloadMenu) && /label: "WebP"/.test(downloadMenu) ? ["PNG", "JPG", "WebP"] : [],
      liveAdsenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(appSource),
      openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(appSource),
      jsonLdExpansionDeferred: !/application\/ld\+json|ImageObject|BreadcrumbList|FAQPage/i.test(appSource),
      imageSitemapPresentBeforeRound: previousUxContext?.summary?.imageSitemapPresent === false ? false : existsSync(repoPath(IMAGE_SITEMAP_PATH)),
      currentImageSitemapFilePresent: existsSync(repoPath(IMAGE_SITEMAP_PATH)),
    },
    evidence: {
      packageName: packageJson.name,
      branch: currentBranch,
      regularSitemapFormula: "homepage + runtime sitemap entries + indexable trust pages",
      regularSitemapRuntimeEntries: runtimeSiteMap.entries.length,
      indexableTrustPageCount: [...trustPagesSource.matchAll(/indexable:\s*true/g)].length,
      previousUxContextManifest: previousUxContext ? "pipeline/manifests/ux-polish-context-check.json" : null,
    },
  };
}

function buildRequirementsManifest(generatedAt) {
  return {
    generatedAt,
    runId: `${RUN_ID}-requirements`,
    sources: GOOGLE_REQUIREMENT_SOURCES,
    summary: {
      officialGoogleDocsOnly: true,
      imageNamespace: "http://www.google.com/schemas/sitemap-image/1.1",
      requiredImageTags: ["image:image", "image:loc"],
      deprecatedImageTagsExcluded: ["image:caption", "image:geo_location", "image:title", "image:license"],
      maxImagesPerUrl: MAX_IMAGES_PER_URL,
      maxUrlsPerSitemap: 50_000,
      maxUncompressedBytesPerSitemap: 50 * 1024 * 1024,
      absoluteUrlsRequired: true,
      webpAcceptedByGoogleSearch: true,
      cdnImageUrlsAllowedWhenVerified: true,
      sitemapIndexNeeded: false,
      svgExcludedReason: "SVG is internal-only for this product and the owner asked the image sitemap to prefer WebP preview URLs.",
      perImagePagesCreated: false,
      deferredRecordsExcludedReason: "The 205 deferred records are hidden from public runtime and are not verified for public discovery.",
    },
    notes: [
      "Google's current image sitemap reference only requires image:image and image:loc.",
      "Google's image documentation lists WebP among supported image formats.",
      "Google's current image sitemap reference marks image:title and image:caption as deprecated, so titles and captions are retained in the data manifest but not emitted in XML.",
      "Generic sitemap guidance requires absolute URLs and entity escaping.",
      "A sitemap index is only needed if the generated sitemap exceeds URL or size limits.",
    ],
  };
}

function buildArchitectureManifest(generatedAt) {
  return {
    generatedAt,
    runId: `${RUN_ID}-architecture`,
    summary: {
      selectedArchitecture: "generated-static-public-xml",
      staticExportCompatible: true,
      appApiRequired: false,
      serverRuntimeRequired: false,
      deterministic: true,
      publicFilePath: IMAGE_SITEMAP_PATH,
      publicUrl: IMAGE_SITEMAP_URL,
      regularSitemapUrl: REGULAR_SITEMAP_URL,
      packageBuildRegeneratesXml: true,
      mediaCopiedToPublic: false,
      xmlOnlyPublicFiles: [IMAGE_SITEMAP_PATH],
      splitSitemapIndexPlannedIfNeeded: true,
    },
    decision: {
      reason: "Next static export reliably copies public XML files into out/, while app route handlers would add unnecessary static-export risk.",
      rejectedOptions: [
        {
          option: "app route handler",
          reason: "Avoided because this site has no backend routes and the round explicitly requires static-export safety.",
        },
        {
          option: "app/api route",
          reason: "Rejected because app/api is forbidden and unnecessary for static XML.",
        },
      ],
    },
  };
}

function buildImageSitemapData({
  generatedAt,
  available,
  deferred,
  hubsManifest,
  hubItemsManifest,
  routesManifest,
  assetPathsManifest,
  seoPagesManifest,
}) {
  const availableItems = available.items;
  const deferredIds = new Set(deferred.records.map((record) => record.assetId));
  const hubs = hubsManifest.hubs.filter((hub) => hub.route && hub.assetCount > 0);
  const hubsById = new Map(hubs.map((hub) => [hub.hubId, hub]));
  const hubItemByAssetId = new Map(hubItemsManifest.items.map((entry) => [entry.assetId, entry]));
  const assetPathByAssetId = new Map(assetPathsManifest.records.map((entry) => [entry.assetId, entry]));
  const seoPageByPath = new Map(seoPagesManifest.pages.map((entry) => [entry.path, entry]));
  const routePaths = new Set(routesManifest.routes.map((route) => route.path));
  const availableById = new Map(availableItems.map((item) => [item.assetId, item]));
  const assignment = new Map();
  const assignedCounts = new Map(hubs.map((hub) => [hub.hubId, 0]));

  for (const hub of [...hubs].sort(compareHubsBySpecificity)) {
    const assetId = hub.assetIds.find((id) => availableById.has(id) && !assignment.has(id));
    if (assetId) assign(assetId, hub.hubId, assignment, assignedCounts);
  }

  for (const item of availableItems) {
    if (assignment.has(item.assetId)) continue;
    const candidates = getCandidateHubs(item.assetId, hubItemByAssetId, hubsById);
    const hub = candidates.find((candidate) => (assignedCounts.get(candidate.hubId) || 0) < MAX_IMAGES_PER_URL) || candidates[0];
    if (hub) assign(item.assetId, hub.hubId, assignment, assignedCounts);
  }

  const pagesByHubId = new Map(
    hubs.map((hub) => [
      hub.hubId,
      {
        hubId: hub.hubId,
        hubSlug: hub.slug || "coloring-pages",
        hubTitle: hub.title,
        route: hub.route,
        pageUrl: publicPageUrl(hub.route),
        imageCount: 0,
        images: [],
        seoTitle: seoPageByPath.get(hub.route)?.metaTitle || hub.metaTitle || hub.title,
      },
    ]),
  );
  const imageEntries = [];

  for (const item of availableItems) {
    const hub = hubsById.get(assignment.get(item.assetId));
    const page = hub ? pagesByHubId.get(hub.hubId) : null;
    const webpSubpath = item.assetSubpaths?.webpPreview || assetPathByAssetId.get(item.assetId)?.webpPreviewSubpath || "";
    const imageUrl = resolveWebpUrl(webpSubpath);
    const validationStatus = validateImageEntry({ item, hub, page, imageUrl, webpSubpath, routePaths, deferredIds });
    const entry = {
      pageUrl: page?.pageUrl || "",
      imageUrl,
      imageTitle: item.title,
      imageCaption: buildCaption(item.title, page?.hubTitle),
      assetId: item.assetId,
      hubSlug: page?.hubSlug || "",
      hubTitle: page?.hubTitle || "",
      imageCountPerPage: 0,
      available: true,
      sourceRuntimeAssetPath: webpSubpath,
      sourceRuntimeAssetStatus: item.runtimeAssetStatus,
      validationStatus,
    };
    if (page) {
      page.images.push(entry);
      page.imageCount += 1;
    }
    imageEntries.push(entry);
  }

  const pages = [...pagesByHubId.values()]
    .map((page) => {
      page.images.sort((a, b) => a.imageTitle.localeCompare(b.imageTitle) || a.assetId.localeCompare(b.assetId));
      for (const image of page.images) image.imageCountPerPage = page.imageCount;
      return page;
    })
    .sort((a, b) => a.route.localeCompare(b.route));

  imageEntries.sort((a, b) => a.pageUrl.localeCompare(b.pageUrl) || a.imageTitle.localeCompare(b.imageTitle) || a.assetId.localeCompare(b.assetId));

  const uniqueImageUrls = new Set(imageEntries.map((entry) => entry.imageUrl));
  const invalidEntries = imageEntries.filter((entry) => entry.validationStatus !== "valid");
  const maxImagesPerPage = Math.max(...pages.map((page) => page.imageCount));
  const zeroImagePages = pages.filter((page) => page.imageCount === 0);

  return {
    generatedAt,
    runId: `${RUN_ID}-data`,
    strategy: {
      name: "single-canonical-webp-entry-per-asset",
      description:
        "Each available runtime image is assigned once to the most specific existing public hub route. Every public hub route receives at least one representative image before remaining assets are assigned. This avoids duplicating the same image across broad and narrow hubs while preserving full image discovery.",
      maxImagesPerUrl: MAX_IMAGES_PER_URL,
      rootHubReceivesOnlyRepresentativeEntries: true,
      paginatedPageUrlsNeeded: false,
    },
    summary: {
      availableRuntimeRecords: availableItems.length,
      deferredRecordsExcluded: deferred.records.length,
      runtimeHubCount: hubs.length,
      pageUrlCount: pages.length,
      imageEntryCount: imageEntries.length,
      uniqueImageUrlCount: uniqueImageUrls.size,
      maxImagesPerPage,
      zeroImagePageCount: zeroImagePages.length,
      svgUrlsExcluded: imageEntries.every((entry) => !/\/svg\//i.test(entry.imageUrl)),
      pngThumbUrlsExcluded: imageEntries.every((entry) => !/\/png\/|\/thumbs\//i.test(entry.imageUrl)),
      localUrlsExcluded: imageEntries.every((entry) => !/localhost|127\.0\.0\.1/i.test(entry.imageUrl) && !/localhost|127\.0\.0\.1/i.test(entry.pageUrl)),
      r2DevUrlsExcluded: imageEntries.every((entry) => !/r2\.dev/i.test(entry.imageUrl) && !/r2\.dev/i.test(entry.pageUrl)),
      duplicatePrefixExcluded: imageEntries.every((entry) => !/coloring-pages\/coloring-pages/i.test(entry.imageUrl)),
      perImageRoutesCreated: false,
      invalidEntryCount: invalidEntries.length,
    },
    inputs: {
      availableItems: "src/generated/coloring/runtime-available-items.json",
      deferredItems: "src/generated/coloring/runtime-deferred-items.json",
      runtimeHubs: "src/generated/coloring/runtime-hubs.json",
      runtimeHubItems: "src/generated/coloring/runtime-hub-items.json",
      runtimeRoutes: "src/generated/coloring/runtime-routes.json",
      runtimeAssetPaths: "src/generated/coloring/runtime-asset-paths.json",
      runtimeSeoPages: "src/generated/coloring/runtime-seo-pages.json",
    },
    pages,
    imageEntries,
    invalidEntries,
    zeroImagePages: zeroImagePages.map((page) => ({ route: page.route, hubTitle: page.hubTitle })),
  };
}

function getCandidateHubs(assetId, hubItemByAssetId, hubsById) {
  const entry = hubItemByAssetId.get(assetId);
  return (entry?.hubIds || [])
    .map((hubId) => hubsById.get(hubId))
    .filter(Boolean)
    .sort(compareHubsBySpecificity);
}

function compareHubsBySpecificity(a, b) {
  const aRoot = a.route === "/coloring-pages";
  const bRoot = b.route === "/coloring-pages";
  if (aRoot !== bRoot) return aRoot ? 1 : -1;
  return a.assetCount - b.assetCount || a.route.localeCompare(b.route);
}

function assign(assetId, hubId, assignment, assignedCounts) {
  assignment.set(assetId, hubId);
  assignedCounts.set(hubId, (assignedCounts.get(hubId) || 0) + 1);
}

function validateImageEntry({ item, hub, page, imageUrl, webpSubpath, routePaths, deferredIds }) {
  if (!item || !hub || !page) return "missing-page-or-hub";
  if (deferredIds.has(item.assetId)) return "deferred-record";
  if (!routePaths.has(page.route)) return "route-not-generated";
  if (!webpSubpath || !webpSubpath.startsWith("webp/") || !webpSubpath.endsWith(".webp")) return "missing-webp";
  if (!imageUrl.startsWith(`${ASSET_BASE_URL}/webp/`)) return "invalid-image-url";
  if (!page.pageUrl.startsWith(`${SITE_URL}/coloring-pages`)) return "invalid-page-url";
  if (hasBannedUrlPattern(imageUrl) || /#asset-/.test(page.pageUrl)) return "banned-url-pattern";
  return "valid";
}

function buildCaption(title, hubTitle) {
  if (!hubTitle) return `${title} printable coloring page.`;
  return `${title} from the ${hubTitle.replace(/ Coloring Pages$/, "")} collection.`;
}

async function readProjectSource(relativeRoots, excludedPrefixes) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFiles(relativeRoot)) {
      if (!/\.(?:ts|tsx|css|mjs|json)$/.test(file)) continue;
      if (excludedPrefixes.some((prefix) => file.replace(/\\/g, "/").startsWith(prefix))) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function listFiles(relativePath) {
  const { listFilesIfExists } = await import("./image-sitemap-utils.mjs");
  return listFilesIfExists(relativePath);
}

function buildContextReport(context) {
  const rows = Object.entries(context.summary).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]);
  return `# Image Sitemap Context Check

${buildMarkdownTable(["Check", "Result"], rows)}

The pre-round image sitemap status is taken from the UX polish context when available, so rerunning the generator after this round stays deterministic while still documenting the acceptance baseline.
`;
}

function buildRequirementsReport(requirements) {
  return `# Image Sitemap Requirements

Sources used:

${requirements.sources.map((source) => `- [${source.title}](${source.url})`).join("\n")}

${buildMarkdownTable(
  ["Requirement", "Decision"],
  [
    ["Required image tags", requirements.summary.requiredImageTags.join(", ")],
    ["Deprecated tags excluded", requirements.summary.deprecatedImageTagsExcluded.join(", ")],
    ["Images per page URL", requirements.summary.maxImagesPerUrl],
    ["Sitemap size limit", `${requirements.summary.maxUrlsPerSitemap} URLs or ${requirements.summary.maxUncompressedBytesPerSitemap} bytes uncompressed`],
    ["WebP image URLs", "Allowed by Google Search image format guidance"],
    ["SVG image URLs", requirements.summary.svgExcludedReason],
    ["Per-image pages", "Not created. Image entries attach to existing hub URLs."],
    ["Deferred records", requirements.summary.deferredRecordsExcludedReason],
  ],
)}

Titles and captions are kept in the data manifest for owner review, but not emitted as XML image tags because Google's current image sitemap reference marks those tags deprecated.
`;
}

function buildArchitectureReport(architecture) {
  return `# Image Sitemap Architecture

Selected architecture: ${architecture.summary.selectedArchitecture}

${buildMarkdownTable(
  ["Check", "Result"],
  [
    ["Static export compatible", summarizeBoolean(architecture.summary.staticExportCompatible)],
    ["Requires app/api", summarizeBoolean(architecture.summary.appApiRequired)],
    ["Requires server runtime", summarizeBoolean(architecture.summary.serverRuntimeRequired)],
    ["Public XML path", architecture.summary.publicFilePath],
    ["Public image sitemap URL", architecture.summary.publicUrl],
    ["Regular sitemap URL", architecture.summary.regularSitemapUrl],
    ["Media copied to public", summarizeBoolean(architecture.summary.mediaCopiedToPublic)],
  ],
)}

The generator writes XML only. No media assets are copied into public.
`;
}

function buildDataReport(data) {
  const largestPages = [...data.pages].sort((a, b) => b.imageCount - a.imageCount).slice(0, 12);
  return `# Image Sitemap Data Report

Strategy: ${data.strategy.description}

${buildMarkdownTable(
  ["Metric", "Value"],
  [
    ["Available runtime records", data.summary.availableRuntimeRecords],
    ["Deferred records excluded", data.summary.deferredRecordsExcluded],
    ["Page URLs", data.summary.pageUrlCount],
    ["Image entries", data.summary.imageEntryCount],
    ["Unique image URLs", data.summary.uniqueImageUrlCount],
    ["Max images on one page URL", data.summary.maxImagesPerPage],
    ["Invalid entries", data.summary.invalidEntryCount],
  ],
)}

## Largest Page Assignments

${buildMarkdownTable(
  ["Route", "Images"],
  largestPages.map((page) => [page.route, page.imageCount]),
)}

Every image entry uses the uploaded clean WebP preview URL. SVG, PNG, and thumbnail URLs are excluded from sitemap XML.
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
