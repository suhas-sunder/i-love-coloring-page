import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const GENERATED_AT = new Date().toISOString();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const WIDTH = 1200;
const HEIGHT = 630;
const OUTPUT_FORMAT = "jpg";
const OG_SOURCE_ROOT = path.join(REPO_ROOT, "pipeline", "r2-upload-optimized", "coloring-pages");
const ROUTE_PREVIEW_COUNT = 5;

const INPUTS = {
  packageJson: "package.json",
  nextConfig: "next.config.mjs",
  layout: "app/layout.tsx",
  appPage: "app/page.tsx",
  coloringPagesPage: "app/coloring-pages/page.tsx",
  hubPage: "app/coloring-pages/[hubSlug]/page.tsx",
  metadata: "src/lib/coloring/metadata.ts",
  siteConfig: "src/lib/site/siteConfig.ts",
  browserDownloads: "src/lib/coloring/browserDownloads.ts",
  downloadMenu: "src/components/coloring/DownloadMenu.tsx",
  runtimeAvailableItems: "src/generated/coloring/runtime-available-items.json",
  runtimeDeferredItems: "src/generated/coloring/runtime-deferred-items.json",
  runtimeHubs: "src/generated/coloring/runtime-hubs.json",
  runtimeRoutes: "src/generated/coloring/runtime-routes.json",
  runtimeSeoPages: "src/generated/coloring/runtime-seo-pages.json",
  runtimeSocialMetadata: "src/generated/coloring/runtime-social-metadata.json",
  titleOverrides: "src/generated/coloring/title-overrides.json",
};

async function main() {
  await ensureOutputDirs();
  const sources = await readSources();
  const context = await buildContextCheck(sources);
  const requirements = buildRequirements();
  const metadataAudit = buildMetadataAudit(sources);
  const designSystem = buildDesignSystem();
  const ogData = await buildOgImageData(sources);

  await writeJson("pipeline/manifests/og-image-context-check.json", context);
  await writeText("pipeline/reports/og-image-context-check.md", renderContextReport(context));
  await writeJson("pipeline/manifests/og-image-requirements.json", requirements);
  await writeText("pipeline/reports/og-image-requirements.md", renderRequirementsReport(requirements));
  await writeJson("pipeline/manifests/og-image-current-metadata-audit.json", metadataAudit);
  await writeText("pipeline/reports/og-image-current-metadata-audit.md", renderMetadataAuditReport(metadataAudit));
  await writeJson("pipeline/manifests/og-image-design-system.json", designSystem);
  await writeText("pipeline/reports/og-image-design-system.md", renderDesignSystemReport(designSystem));
  await writeJson("pipeline/manifests/og-image-data.json", ogData);
  await writeText("pipeline/reports/og-image-data-report.md", renderOgDataReport(ogData));

  console.log(`Prepared OG image data for ${ogData.summary.routeCount} route-level images.`);
}

async function readSources() {
  const json = {};
  for (const [key, relativePath] of Object.entries(INPUTS)) {
    if (relativePath.endsWith(".json")) json[key] = await readJson(relativePath);
  }

  const text = {};
  for (const [key, relativePath] of Object.entries(INPUTS)) {
    if (!relativePath.endsWith(".json")) text[key] = await readText(relativePath);
  }

  return { json, text };
}

async function buildContextCheck(sources) {
  const packageName = sources.json.packageJson.name;
  const branch = await git(["branch", "--show-current"]);
  const commitDfba4f6Exists = await gitCommitExists("dfba4f6");
  const commitAf716a5Exists = await gitCommitExists("af716a5");
  const commit10161e3Exists = await gitCommitExists("10161e3");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const imageSitemap = existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml"))
    ? await readText("public/image-sitemap.xml")
    : "";
  const appSrcText = await readProjectText(["app", "src"], { excludeGenerated: true });

  const publicMediaOutsideApproved = publicFiles.filter((file) => {
    const normalized = normalizePath(file);
    if (normalized === "public/image-sitemap.xml") return false;
    if (/^public\/og\/.+\.jpe?g$/i.test(normalized)) return false;
    return /\.(?:svg|png|jpe?g|webp|gif)$/i.test(normalized);
  });

  const summary = {
    correctRepository: packageName === "i-love-coloring-page" && path.basename(REPO_ROOT) === "i-love-coloring-page",
    packageName,
    repoRoot: REPO_ROOT,
    currentBranch: branch.trim(),
    commitDfba4f6Exists,
    commitAf716a5Exists,
    commit10161e3Exists,
    staticExportConfigured: /output:\s*"export"/.test(sources.text.nextConfig),
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")) || appFiles.some((file) => normalizePath(file).includes("/api/")),
    coloringPagesRoutePresent: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
    hubRoutePresent: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
    runtimeGeneratedDataPresent: existsSync(path.join(REPO_ROOT, INPUTS.runtimeAvailableItems)),
    runtimeAvailableRecords: sources.json.runtimeAvailableItems.items.length,
    runtimeDeferredRecords: sources.json.runtimeDeferredItems.records.length,
    runtimeIndexableHubs: sources.json.runtimeHubs.hubs.length,
    imageSitemapPresent: Boolean(imageSitemap),
    imageSitemapUsesWebpPreviewUrls: /\/webp\/[^<]+\.webp/i.test(imageSitemap) && !/\/(?:svg|png|thumbs)\//i.test(imageSitemap),
    siteUrl: SITE_URL,
    publicAssetBaseUrl: ASSET_BASE_URL,
    contactEmail: CONTACT_EMAIL,
    svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(`${sources.text.browserDownloads}\n${sources.text.downloadMenu}`),
    publicDownloadFormats: getPublicDownloadFormats(sources.text.browserDownloads),
    liveAdsenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(appSrcText),
    jsonLdExpansionDeferred: !/application\/ld\+json|FAQPage|BreadcrumbList|ImageObject/i.test(appSrcText),
    publicMediaOutsideApproved,
    publicMediaOutsideApprovedPresent: publicMediaOutsideApproved.length > 0,
    imagesGitStatus: await gitStatusFor("images"),
    ilovesvgGitStatus: await gitStatusFor("ilovesvg"),
  };

  return {
    generatedAt: GENERATED_AT,
    phase: "og-image",
    summary,
    checks: [
      "Repository, branch, and prior commits verified before OG work.",
      "Static export and app/api absence verified.",
      "Runtime generated records and hub counts verified.",
      "Image sitemap exists and uses WebP preview URLs.",
      "SVG remains internal-only and public downloads remain PNG/JPG/WebP.",
      "JSON-LD expansion and live ads remain deferred.",
    ],
  };
}

function buildRequirements() {
  return {
    generatedAt: GENERATED_AT,
    phase: "og-image",
    summary: {
      chosenDimensions: { width: WIDTH, height: HEIGHT },
      chosenOutputFormat: OUTPUT_FORMAT,
      metadataTags: [
        "og:title",
        "og:description",
        "og:url",
        "og:type",
        "og:image",
        "og:image:width",
        "og:image:height",
        "og:image:alt",
        "twitter:card",
        "twitter:title",
        "twitter:description",
        "twitter:image",
      ],
      staticGenerationRequired: true,
      svgSocialImagesExcluded: true,
      perImagePagesCreated: false,
    },
    sources: [
      {
        name: "Open Graph protocol",
        url: "https://ogp.me/",
        notes: ["Use route title, type, URL, and image fields. Width, height, and alt text are structured image properties."],
      },
      {
        name: "X Summary Card with Large Image",
        url: "https://developer.x.com/cards/types/summary-large-image",
        notes: ["Use twitter:card summary_large_image and a route-specific image. SVG is not used for broad card compatibility."],
      },
      {
        name: "Pinterest Rich Pins overview",
        url: "https://developers.pinterest.com/docs/web-features/rich-pins-overview/",
        notes: ["Pinterest supports page metadata through Open Graph or Schema.org. This round uses Open Graph only and keeps JSON-LD deferred."],
      },
      {
        name: "Next.js Metadata and OG images",
        url: "https://nextjs.org/docs/app/getting-started/metadata-and-og-images",
        notes: ["Next metadata exports generate head tags at build time for prerendered static routes. Dynamic ImageResponse routes are avoided for static export."],
      },
    ],
    decisions: [
      "Generate 1200 x 630 JPG files to keep files broadly compatible and reasonably small.",
      "Use static files under public/og so the exported site can serve them without app/api or server runtime.",
      "Use WebP preview artwork as source material, but never reference SVG source URLs as social images.",
      "Create route-level OG images only: homepage, gallery landing, and public hub routes. No per-image social pages are created.",
    ],
  };
}

function buildMetadataAudit(sources) {
  const appSrcText = [
    sources.text.layout,
    sources.text.appPage,
    sources.text.coloringPagesPage,
    sources.text.hubPage,
    sources.text.metadata,
    sources.text.siteConfig,
  ].join("\n");
  const socialPages = sources.json.runtimeSocialMetadata.pages || [];
  const pagesWithEmptyOgImages = socialPages.filter((page) => (page.openGraph?.images || []).length === 0).length;

  return {
    generatedAt: GENERATED_AT,
    phase: "og-image",
    summary: {
      metadataBasePresent: /metadataBase:\s*new URL\(siteConfig\.siteUrl\)/.test(sources.text.layout),
      metadataBaseUsesCanonicalWww: sources.text.siteConfig.includes(SITE_URL),
      titleTemplatePresent: /template:\s*`%s \|/.test(sources.text.layout),
      buildColoringMetadataCentralized: /export function buildColoringMetadata/.test(sources.text.metadata),
      openGraphMetadataPresent: /openGraph:\s*\{/.test(sources.text.metadata),
      twitterMetadataPresent: /twitter:\s*\{/.test(sources.text.metadata),
      twitterLargeImageConfiguredBeforeRound: /summary_large_image/.test(sources.text.metadata),
      socialMetadataPages: socialPages.length,
      socialMetadataPagesWithEmptyOgImages: pagesWithEmptyOgImages,
      canonicalUrlConfigured: /alternates:\s*\{[\s\S]*canonical:\s*url/.test(sources.text.metadata),
      localhostLeaksPresent: /localhost|127\.0\.0\.1/i.test(appSrcText),
      r2DevLeaksPresent: /r2\.dev/i.test(appSrcText),
      noIndexPagesExcludedFromTargetSet: true,
      ogImagesMissingBeforeRound: pagesWithEmptyOgImages > 0 && !/ogImagesJson/.test(sources.text.metadata),
    },
    filesAudited: [
      INPUTS.layout,
      INPUTS.appPage,
      INPUTS.coloringPagesPage,
      INPUTS.hubPage,
      INPUTS.metadata,
      INPUTS.siteConfig,
      INPUTS.runtimeSeoPages,
      INPUTS.runtimeSocialMetadata,
      INPUTS.runtimeRoutes,
    ],
  };
}

function buildDesignSystem() {
  return {
    generatedAt: GENERATED_AT,
    phase: "og-image",
    summary: {
      canvas: { width: WIDTH, height: HEIGHT },
      outputFormat: OUTPUT_FORMAT,
      backgroundColor: "#f8f7fb",
      textColor: "#17213f",
      secondaryTextColor: "#5b6175",
      accentColor: "#9f4f67",
      frameColor: "#d9d2e3",
      brand: "I Love Coloring Page",
      maxPreviewImages: ROUTE_PREVIEW_COUNT,
      noGradients: true,
      noHeavyShadows: true,
      noClutter: true,
    },
    layout: {
      titlePlacement: "Left column, wrapped to a maximum of three lines.",
      subtitlePlacement: "Under the title with asset count or route context.",
      brandPlacement: "Small brand line in the lower-left corner.",
      previewImageLayout: "Three to five clean framed WebP previews on the right side.",
      fallbackBehavior: "Use homepage/gallery previews when a route has too few local items.",
    },
    typography: {
      display: "Fraunces-inspired serif fallback in the generated SVG overlay.",
      body: "Figtree-inspired sans-serif fallback in the generated SVG overlay.",
      titleWrapping: "Approximate character wrapping with a three-line cap.",
    },
    rules: [
      "Do not use source SVG URLs as social images.",
      "Do not create dense collages.",
      "Do not use gradients, heavy shadows, random colors, or nested-card styling.",
      "Keep route title and printable coloring page context readable at thumbnail sizes.",
    ],
  };
}

async function buildOgImageData(sources) {
  const items = sources.json.runtimeAvailableItems.items.map((item) => withTitleOverride(item, sources.json.titleOverrides.overrides || []));
  const itemById = new Map(items.map((item) => [item.assetId, item]));
  const hubs = sources.json.runtimeHubs.hubs;
  const seoByPath = new Map((sources.json.runtimeSeoPages.pages || []).map((page) => [page.path, page]));
  const rootHub = hubs.find((hub) => hub.route === "/coloring-pages");
  if (!rootHub) throw new Error("Missing root coloring pages hub");

  const rootPreviewItems = selectHomePreviewItems(hubs, itemById);
  const routes = [];

  routes.push(buildRouteRecord({
    id: "home",
    kind: "homepage",
    path: "/",
    title: seoByPath.get("/")?.metaTitle || "I Love Coloring Page",
    description: seoByPath.get("/")?.metaDescription || "Printable coloring pages organized by subject and style.",
    subtitle: `${items.length.toLocaleString()} printable coloring pages`,
    assetCount: items.length,
    ogImagePath: "/og/home.jpg",
    outputPath: "public/og/home.jpg",
    previewItems: rootPreviewItems,
  }));

  routes.push(buildRouteRecord({
    id: "gallery-landing",
    kind: "galleryLanding",
    path: "/coloring-pages",
    title: seoByPath.get("/coloring-pages")?.metaTitle || rootHub.metaTitle,
    description: seoByPath.get("/coloring-pages")?.metaDescription || rootHub.metaDescription,
    subtitle: `${rootHub.assetCount.toLocaleString()} printable pages by subject, style, and season`,
    assetCount: rootHub.assetCount,
    ogImagePath: "/og/coloring-pages.jpg",
    outputPath: "public/og/coloring-pages.jpg",
    previewItems: rootPreviewItems,
  }));

  routes.push(buildRouteRecord({
    id: rootHub.hubId,
    kind: "hubRootMirror",
    path: rootHub.route,
    slug: "coloring-pages",
    hubId: rootHub.hubId,
    title: rootHub.metaTitle,
    description: rootHub.metaDescription,
    subtitle: `${rootHub.assetCount.toLocaleString()} printable pages`,
    assetCount: rootHub.assetCount,
    ogImagePath: "/og/hubs/coloring-pages.jpg",
    outputPath: "public/og/hubs/coloring-pages.jpg",
    previewItems: rootPreviewItems,
  }));

  for (const hub of hubs.filter((hub) => hub.route !== "/coloring-pages")) {
    const seo = seoByPath.get(hub.route);
    routes.push(buildRouteRecord({
      id: hub.hubId,
      kind: "hub",
      path: hub.route,
      slug: hub.slug,
      hubId: hub.hubId,
      title: seo?.metaTitle || hub.metaTitle || hub.title,
      description: seo?.metaDescription || hub.metaDescription,
      subtitle: `${hub.assetCount.toLocaleString()} printable pages`,
      assetCount: hub.assetCount,
      ogImagePath: `/og/hubs/${hub.slug}.jpg`,
      outputPath: `public/og/hubs/${hub.slug}.jpg`,
      previewItems: selectHubPreviewItems(hub, itemById, rootPreviewItems),
    }));
  }

  const uniquePreviewAssetIds = new Set(routes.flatMap((route) => route.previewItems.map((item) => item.assetId)));

  return {
    generatedAt: GENERATED_AT,
    phase: "og-image",
    summary: {
      availableRuntimeRecords: items.length,
      runtimeHubCount: hubs.length,
      expectedImageCount: routes.length,
      routeCount: routes.length,
      homepageImageCount: 1,
      galleryLandingImageCount: 1,
      hubImageCount: hubs.length,
      nonRootHubImageCount: hubs.length - 1,
      width: WIDTH,
      height: HEIGHT,
      outputFormat: OUTPUT_FORMAT,
      previewImagesPerRouteMax: ROUTE_PREVIEW_COUNT,
      uniquePreviewAssetCount: uniquePreviewAssetIds.size,
      deferredRecordsExcluded: true,
      svgSourcesExcludedFromSocialImages: true,
      perImageRoutesCreated: false,
      sourceRoot: normalizePath(path.relative(REPO_ROOT, OG_SOURCE_ROOT)),
    },
    strategy: {
      homepage: "Broad mixed set from high-value top-level hubs.",
      galleryLanding: "Same broad library signal as homepage, with gallery-specific title and subtitle.",
      hubPages: "Use hub featured, preview, and asset IDs in that order, with category bucket diversity and no duplicates.",
      lowCountHubs: "Use the available hub records and fall back only when a generated route has fewer than one usable WebP preview.",
    },
    routes,
  };
}

function buildRouteRecord({ id, kind, path: routePath, slug = null, hubId = null, title, description, subtitle, assetCount, ogImagePath, outputPath, previewItems }) {
  const canonicalUrl = routePath === "/" ? SITE_URL : `${SITE_URL}${routePath}`;
  const cleanTitle = stripSiteSuffix(title);
  return {
    id,
    kind,
    path: routePath,
    slug,
    hubId,
    title: cleanTitle,
    description,
    subtitle,
    assetCount,
    canonicalUrl,
    ogImagePath,
    ogImageUrl: `${SITE_URL}${ogImagePath}`,
    outputPath,
    width: WIDTH,
    height: HEIGHT,
    format: OUTPUT_FORMAT,
    alt: `${cleanTitle} preview image from I Love Coloring Page`,
    previewItems: previewItems.map(toOgPreviewItem),
  };
}

function selectHomePreviewItems(hubs, itemById) {
  const preferredSlugs = ["animals", "christmas", "mandalas", "plushies", "fantasy", "t-rex", "dragons", "sushi"];
  const selected = [];
  const seen = new Set();

  for (const slug of preferredSlugs) {
    const hub = hubs.find((entry) => entry.slug === slug);
    if (!hub) continue;
    const candidate = selectHubPreviewItems(hub, itemById, [], 1)[0];
    if (candidate && !seen.has(candidate.assetId)) {
      selected.push(candidate);
      seen.add(candidate.assetId);
    }
    if (selected.length >= ROUTE_PREVIEW_COUNT) break;
  }

  if (selected.length < ROUTE_PREVIEW_COUNT) {
    const root = hubs.find((entry) => entry.route === "/coloring-pages");
    for (const candidate of selectHubPreviewItems(root, itemById, [], ROUTE_PREVIEW_COUNT * 2)) {
      if (!seen.has(candidate.assetId)) {
        selected.push(candidate);
        seen.add(candidate.assetId);
      }
      if (selected.length >= ROUTE_PREVIEW_COUNT) break;
    }
  }

  return selected.slice(0, ROUTE_PREVIEW_COUNT);
}

function selectHubPreviewItems(hub, itemById, fallbackItems = [], count = ROUTE_PREVIEW_COUNT) {
  if (!hub) return fallbackItems.slice(0, count);

  const orderedIds = [
    ...(hub.featuredAssetIds || []),
    ...(hub.previewAssetIds || []),
    ...(hub.assetIds || []),
  ];
  const candidates = [];
  const seen = new Set();
  const buckets = new Map();

  for (const assetId of orderedIds) {
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    const item = itemById.get(assetId);
    if (!isUsableOgSource(item)) continue;
    const bucketKey = getBucketKey(item);
    const bucket = buckets.get(bucketKey) || [];
    bucket.push(item);
    buckets.set(bucketKey, bucket);
  }

  const bucketKeys = Array.from(buckets.keys());
  let cursor = 0;
  while (candidates.length < count && bucketKeys.length > 0) {
    const index = cursor % bucketKeys.length;
    const bucketKey = bucketKeys[index];
    const bucket = buckets.get(bucketKey) || [];
    const next = bucket.shift();
    if (next) candidates.push(next);
    if (bucket.length === 0) {
      buckets.delete(bucketKey);
      bucketKeys.splice(index, 1);
      if (bucketKeys.length === 0) break;
      cursor = index % bucketKeys.length;
    } else {
      cursor = (cursor + 1) % bucketKeys.length;
    }
  }

  if (candidates.length === 0) return fallbackItems.slice(0, count);
  return candidates.slice(0, count);
}

function isUsableOgSource(item) {
  return Boolean(item?.assetId && item?.assetSubpaths?.webpPreview && item.assetSubpaths.webpPreview.startsWith("webp/"));
}

function getBucketKey(item) {
  return item.categorySlug || item.assetId.split("__")[0] || "misc";
}

function toOgPreviewItem(item) {
  const webpSubpath = item.assetSubpaths.webpPreview;
  return {
    assetId: item.assetId,
    title: item.title,
    altText: item.altText,
    categorySlug: item.categorySlug,
    sourceWebpSubpath: webpSubpath,
    webpUrl: buildPublicAssetUrl(webpSubpath),
    localWebpPath: normalizePath(path.join("pipeline", "r2-upload-optimized", "coloring-pages", webpSubpath)),
  };
}

function withTitleOverride(item, overrides) {
  const override = overrides.find((entry) => entry.assetId === item.assetId);
  if (!override) return item;
  return {
    ...item,
    title: override.cleanTitle || item.title,
    altText: override.cleanAltText || item.altText,
  };
}

function stripSiteSuffix(title) {
  return String(title || "Printable Coloring Pages")
    .replace(/\s+\|\s+I Love Coloring Page$/i, "")
    .trim();
}

function buildPublicAssetUrl(subpath) {
  return `${ASSET_BASE_URL}/${String(subpath || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function getPublicDownloadFormats(browserDownloadsSource) {
  const match = browserDownloadsSource.match(/EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\[([^\]]+)\]/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((value) => value.replace(/["'\s]/g, ""))
    .filter(Boolean)
    .map((value) => (value === "jpg" ? "JPG" : value === "webp" ? "WebP" : value.toUpperCase()));
}

function renderContextReport(payload) {
  return [
    "# OG Image Context Check",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `- Repository: ${payload.summary.packageName}`,
    `- Branch: ${payload.summary.currentBranch}`,
    `- Featured rotation commit present: ${payload.summary.commitDfba4f6Exists}`,
    `- Corrective UX commit present: ${payload.summary.commitAf716a5Exists}`,
    `- Image sitemap commit present: ${payload.summary.commit10161e3Exists}`,
    `- Static export configured: ${payload.summary.staticExportConfigured}`,
    `- app/api present: ${payload.summary.appApiRoutePresent}`,
    `- Runtime available records: ${payload.summary.runtimeAvailableRecords.toLocaleString()}`,
    `- Runtime deferred records: ${payload.summary.runtimeDeferredRecords.toLocaleString()}`,
    `- Runtime indexable hubs: ${payload.summary.runtimeIndexableHubs.toLocaleString()}`,
    `- Image sitemap present: ${payload.summary.imageSitemapPresent}`,
    `- Image sitemap uses WebP previews: ${payload.summary.imageSitemapUsesWebpPreviewUrls}`,
    `- SVG internal-only: ${payload.summary.svgInternalOnly}`,
    `- Public downloads: ${payload.summary.publicDownloadFormats.join(", ")}`,
    `- Live AdSense code present: ${payload.summary.liveAdsenseCodePresent}`,
    `- JSON-LD expansion deferred: ${payload.summary.jsonLdExpansionDeferred}`,
    `- Public media outside approved XML/OG files: ${payload.summary.publicMediaOutsideApproved.length}`,
  ].join("\n");
}

function renderRequirementsReport(payload) {
  return [
    "# OG Image Requirements",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `- Dimensions: ${payload.summary.chosenDimensions.width} x ${payload.summary.chosenDimensions.height}`,
    `- Output format: ${payload.summary.chosenOutputFormat.toUpperCase()}`,
    `- Metadata tags: ${payload.summary.metadataTags.join(", ")}`,
    `- Static generation required: ${payload.summary.staticGenerationRequired}`,
    `- SVG social images excluded: ${payload.summary.svgSocialImagesExcluded}`,
    `- Per-image pages created: ${payload.summary.perImagePagesCreated}`,
    "",
    "## Sources",
    "",
    ...payload.sources.map((source) => `- [${source.name}](${source.url}) - ${source.notes.join(" ")}`),
    "",
    "## Decisions",
    "",
    ...payload.decisions.map((decision) => `- ${decision}`),
  ].join("\n");
}

function renderMetadataAuditReport(payload) {
  return [
    "# OG Image Current Metadata Audit",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `- metadataBase present: ${payload.summary.metadataBasePresent}`,
    `- metadataBase uses canonical www default: ${payload.summary.metadataBaseUsesCanonicalWww}`,
    `- Central metadata helper: ${payload.summary.buildColoringMetadataCentralized}`,
    `- Open Graph metadata present: ${payload.summary.openGraphMetadataPresent}`,
    `- Twitter metadata present: ${payload.summary.twitterMetadataPresent}`,
    `- Twitter large image configured before this run: ${payload.summary.twitterLargeImageConfiguredBeforeRound}`,
    `- Runtime social metadata pages: ${payload.summary.socialMetadataPages}`,
    `- Runtime social pages with empty OG images: ${payload.summary.socialMetadataPagesWithEmptyOgImages}`,
    `- Localhost leaks present: ${payload.summary.localhostLeaksPresent}`,
    `- r2.dev leaks present: ${payload.summary.r2DevLeaksPresent}`,
    `- No-index pages excluded from target set: ${payload.summary.noIndexPagesExcludedFromTargetSet}`,
  ].join("\n");
}

function renderDesignSystemReport(payload) {
  return [
    "# OG Image Design System",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `- Canvas: ${payload.summary.canvas.width} x ${payload.summary.canvas.height}`,
    `- Format: ${payload.summary.outputFormat.toUpperCase()}`,
    `- Background: ${payload.summary.backgroundColor}`,
    `- Text: ${payload.summary.textColor}`,
    `- Accent: ${payload.summary.accentColor}`,
    `- Preview images per card: up to ${payload.summary.maxPreviewImages}`,
    `- Brand: ${payload.summary.brand}`,
    "",
    "## Layout",
    "",
    `- Title: ${payload.layout.titlePlacement}`,
    `- Subtitle: ${payload.layout.subtitlePlacement}`,
    `- Brand: ${payload.layout.brandPlacement}`,
    `- Preview layout: ${payload.layout.previewImageLayout}`,
    "",
    "## Rules",
    "",
    ...payload.rules.map((rule) => `- ${rule}`),
  ].join("\n");
}

function renderOgDataReport(payload) {
  const examples = payload.routes
    .filter((route) => ["/", "/coloring-pages", "/coloring-pages/t-rex", "/coloring-pages/dragons", "/coloring-pages/christmas"].includes(route.path))
    .map((route) => `- ${route.path}: ${route.ogImagePath} (${route.previewItems.map((item) => item.title).join("; ")})`);

  return [
    "# OG Image Data Report",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `- Available runtime records: ${payload.summary.availableRuntimeRecords.toLocaleString()}`,
    `- Runtime hub count: ${payload.summary.runtimeHubCount.toLocaleString()}`,
    `- Expected OG image count: ${payload.summary.expectedImageCount}`,
    `- Route records: ${payload.summary.routeCount}`,
    `- Homepage images: ${payload.summary.homepageImageCount}`,
    `- Gallery landing images: ${payload.summary.galleryLandingImageCount}`,
    `- Hub images: ${payload.summary.hubImageCount}`,
    `- Unique preview assets selected: ${payload.summary.uniquePreviewAssetCount}`,
    `- Output: ${payload.summary.width} x ${payload.summary.height} ${payload.summary.outputFormat.toUpperCase()}`,
    `- Deferred records excluded: ${payload.summary.deferredRecordsExcluded}`,
    `- SVG source URLs excluded from social images: ${payload.summary.svgSourcesExcludedFromSocialImages}`,
    `- Per-image routes created: ${payload.summary.perImageRoutesCreated}`,
    "",
    "## Distribution Strategy",
    "",
    `- Homepage: ${payload.strategy.homepage}`,
    `- Gallery landing: ${payload.strategy.galleryLanding}`,
    `- Hub pages: ${payload.strategy.hubPages}`,
    `- Low-count hubs: ${payload.strategy.lowCountHubs}`,
    "",
    "## Sample Routes",
    "",
    ...examples,
  ].join("\n");
}

async function ensureOutputDirs() {
  await mkdir(path.join(REPO_ROOT, "pipeline", "manifests"), { recursive: true });
  await mkdir(path.join(REPO_ROOT, "pipeline", "reports"), { recursive: true });
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, value) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${value.trimEnd()}\n`);
}

async function git(args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function gitCommitExists(commit) {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

async function gitStatusFor(relativePath) {
  return git(["status", "--short", "--", relativePath]);
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
      chunks.push(await readText(normalized));
    }
  }
  return chunks.join("\n");
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

await main();
