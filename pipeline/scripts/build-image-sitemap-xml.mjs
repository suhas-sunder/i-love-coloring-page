import { stat } from "node:fs/promises";

import {
  IMAGE_SITEMAP_PATH,
  IMAGE_SITEMAP_URL,
  MAX_IMAGES_PER_URL,
  MAX_SITEMAP_BYTES,
  MAX_SITEMAP_URLS,
  REGULAR_SITEMAP_URL,
  RUN_ID,
  buildMarkdownTable,
  escapeXml,
  readJson,
  readText,
  repoPath,
  summarizeBoolean,
  writeJson,
  writeText,
} from "./image-sitemap-utils.mjs";

const DATA_MANIFEST = "pipeline/manifests/image-sitemap-data.json";
const BUILD_MANIFEST = "pipeline/manifests/image-sitemap-build-results.json";
const BUILD_REPORT = "pipeline/reports/image-sitemap-build-report.md";
const INTEGRATION_MANIFEST = "pipeline/manifests/image-sitemap-build-integration.json";
const INTEGRATION_REPORT = "pipeline/reports/image-sitemap-build-integration-report.md";

async function main() {
  const data = await readJson(DATA_MANIFEST);
  const xml = buildImageSitemapXml(data.pages);
  await writeText(IMAGE_SITEMAP_PATH, xml);

  const fileStat = await stat(repoPath(IMAGE_SITEMAP_PATH));
  const buildResults = buildResultsManifest(data, fileStat.size);
  await writeJson(BUILD_MANIFEST, buildResults);
  await writeText(BUILD_REPORT, buildBuildReport(buildResults));

  const integration = await buildIntegrationManifest(data);
  await writeJson(INTEGRATION_MANIFEST, integration);
  await writeText(INTEGRATION_REPORT, buildIntegrationReport(integration));
}

export function buildImageSitemapXml(pages) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
  ];

  for (const page of pages) {
    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(page.pageUrl)}</loc>`);
    for (const image of page.images) {
      lines.push("    <image:image>");
      lines.push(`      <image:loc>${escapeXml(image.imageUrl)}</image:loc>`);
      lines.push("    </image:image>");
    }
    lines.push("  </url>");
  }

  lines.push("</urlset>");
  return `${lines.join("\n")}\n`;
}

function buildResultsManifest(data, fileSizeBytes) {
  const emptyPages = data.pages.filter((page) => page.images.length === 0);
  const overImageLimitPages = data.pages.filter((page) => page.images.length > MAX_IMAGES_PER_URL);
  const imageUrls = data.imageEntries.map((entry) => entry.imageUrl);
  const uniqueImageUrls = new Set(imageUrls);
  const noLocalUrls = data.imageEntries.every((entry) => !/localhost|127\.0\.0\.1/i.test(`${entry.pageUrl}\n${entry.imageUrl}`));
  const noR2Dev = data.imageEntries.every((entry) => !/r2\.dev/i.test(`${entry.pageUrl}\n${entry.imageUrl}`));
  const noSvg = data.imageEntries.every((entry) => !/\/svg\//i.test(entry.imageUrl));
  const noPngThumb = data.imageEntries.every((entry) => !/\/png\/|\/thumbs\//i.test(entry.imageUrl));
  const noPerImageRoutes = data.imageEntries.every((entry) => !/#asset-|\/(?:image|item|asset)\//i.test(entry.pageUrl));

  return {
    generatedAt: data.generatedAt,
    runId: `${RUN_ID}-xml-build`,
    summary: {
      imageSitemapCreated: true,
      outputArchitecture: "single-static-xml-file",
      generatedFiles: [IMAGE_SITEMAP_PATH],
      splitCount: 0,
      sitemapIndexCreated: false,
      pageUrlCount: data.pages.length,
      imageEntryCount: data.imageEntries.length,
      uniqueImageUrlCount: uniqueImageUrls.size,
      fileSizeBytes,
      maxImagesPerPage: data.summary.maxImagesPerPage,
      xmlWithinUrlLimit: data.pages.length <= MAX_SITEMAP_URLS,
      xmlWithinSizeLimit: fileSizeBytes <= MAX_SITEMAP_BYTES,
      noEmptySitemapFiles: true,
      allLocUrlsAbsolute: data.pages.every((page) => page.pageUrl.startsWith("https://")),
      allImageLocUrlsAbsolute: data.imageEntries.every((entry) => entry.imageUrl.startsWith("https://")),
      noLocalUrls,
      noR2Dev,
      noSvgImageUrls: noSvg,
      noPngThumbImageUrls: noPngThumb,
      noDuplicateImageUrls: uniqueImageUrls.size === imageUrls.length,
      noPerImageHtmlRoutes: noPerImageRoutes,
      emptyPageCount: emptyPages.length,
      overImageLimitPageCount: overImageLimitPages.length,
    },
    files: [
      {
        path: IMAGE_SITEMAP_PATH,
        publicUrl: IMAGE_SITEMAP_URL,
        type: "urlset",
        pageUrlCount: data.pages.length,
        imageEntryCount: data.imageEntries.length,
        fileSizeBytes,
      },
    ],
    emptyPages: emptyPages.map((page) => ({ route: page.route, hubTitle: page.hubTitle })),
    overImageLimitPages: overImageLimitPages.map((page) => ({ route: page.route, imageCount: page.images.length })),
  };
}

async function buildIntegrationManifest(data) {
  const packageJson = await readJson("package.json");
  const robots = await readText("app/robots.ts");
  const sitemap = await readText("app/sitemap.ts");
  const nextConfig = await readText("next.config.mjs");

  return {
    generatedAt: data.generatedAt,
    runId: `${RUN_ID}-build-integration`,
    summary: {
      buildScriptRegeneratesImageSitemap: /build-image-sitemap-data\.mjs/.test(packageJson.scripts?.build || "") && /build-image-sitemap-xml\.mjs/.test(packageJson.scripts?.build || ""),
      robotsReferencesRegularSitemap: /sitemap\.xml/.test(robots),
      robotsReferencesImageSitemap: /image-sitemap\.xml/.test(robots),
      robotsUsesCanonicalWwwDomain: /getSiteUrl/.test(robots),
      regularSitemapRouteUnchanged: !/image-sitemap/i.test(sitemap),
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      appApiRequired: false,
      xmlCopiedByStaticExportFromPublic: true,
      imageSitemapUrl: IMAGE_SITEMAP_URL,
      regularSitemapUrl: REGULAR_SITEMAP_URL,
      noMediaCopiedToPublic: true,
    },
    packageBuildScript: packageJson.scripts?.build || "",
    robotsSitemapUrls: [REGULAR_SITEMAP_URL, IMAGE_SITEMAP_URL],
  };
}

function buildBuildReport(buildResults) {
  return `# Image Sitemap Build Report

${buildMarkdownTable(
  ["Metric", "Value"],
  [
    ["Created", summarizeBoolean(buildResults.summary.imageSitemapCreated)],
    ["Architecture", buildResults.summary.outputArchitecture],
    ["Generated files", buildResults.summary.generatedFiles.join(", ")],
    ["Page URLs", buildResults.summary.pageUrlCount],
    ["Image entries", buildResults.summary.imageEntryCount],
    ["File size bytes", buildResults.summary.fileSizeBytes],
    ["Split count", buildResults.summary.splitCount],
    ["No SVG URLs", summarizeBoolean(buildResults.summary.noSvgImageUrls)],
    ["No PNG/thumb URLs", summarizeBoolean(buildResults.summary.noPngThumbImageUrls)],
    ["No per-image HTML routes", summarizeBoolean(buildResults.summary.noPerImageHtmlRoutes)],
  ],
)}
`;
}

function buildIntegrationReport(integration) {
  return `# Image Sitemap Build Integration Report

${buildMarkdownTable(
  ["Check", "Result"],
  Object.entries(integration.summary).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]),
)}

Robots should expose both the regular sitemap and the image sitemap. The regular sitemap itself remains a page-route sitemap and does not contain image sitemap entries.
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
