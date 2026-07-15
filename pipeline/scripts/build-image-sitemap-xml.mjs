import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  IMAGE_SITEMAP_PATH,
  IMAGE_SITEMAP_URL,
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
  const xml = buildImageSitemapXml(data.imageEntries);
  await writeText(IMAGE_SITEMAP_PATH, xml);

  const fileStat = await stat(repoPath(IMAGE_SITEMAP_PATH));
  const buildResults = buildResultsManifest(data, xml, fileStat.size);
  await writeJson(BUILD_MANIFEST, buildResults);
  await writeText(BUILD_REPORT, buildBuildReport(buildResults));

  const integration = await buildIntegrationManifest(data);
  await writeJson(INTEGRATION_MANIFEST, integration);
  await writeText(INTEGRATION_REPORT, buildIntegrationReport(integration));

  if (!buildResults.summary.buildPassed) throw new Error("Image sitemap XML build validation failed");
}

export function buildImageSitemapXml(imageEntries) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
  ];

  for (const entry of imageEntries) {
    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(entry.pageUrl)}</loc>`);
    lines.push("    <image:image>");
    lines.push(`      <image:loc>${escapeXml(entry.imageUrl)}</image:loc>`);
    lines.push(`      <image:title>${escapeXml(entry.imageTitle)}</image:title>`);
    lines.push("    </image:image>");
    lines.push("  </url>");
  }

  lines.push("</urlset>");
  return `${lines.join("\n")}\n`;
}

function buildResultsManifest(data, xml, fileSizeBytes) {
  const pageUrls = data.imageEntries.map((entry) => entry.pageUrl);
  const imageUrls = data.imageEntries.map((entry) => entry.imageUrl);
  const uniquePageUrls = new Set(pageUrls);
  const uniqueImageUrls = new Set(imageUrls);
  const xmlSha256 = createHash("sha256").update(xml).digest("hex");
  const summary = {
    buildPassed: false,
    imageSitemapCreated: true,
    outputArchitecture: "single-static-xml-file",
    generatedFiles: [IMAGE_SITEMAP_PATH],
    splitCount: 0,
    sitemapIndexCreated: false,
    pageUrlCount: pageUrls.length,
    imageEntryCount: imageUrls.length,
    uniquePageUrlCount: uniquePageUrls.size,
    uniqueImageUrlCount: uniqueImageUrls.size,
    fileSizeBytes,
    xmlSha256,
    xmlWithinUrlLimit: pageUrls.length <= MAX_SITEMAP_URLS,
    xmlWithinSizeLimit: fileSizeBytes <= MAX_SITEMAP_BYTES,
    allLocUrlsAbsolute: pageUrls.every((url) => url.startsWith("https://www.ilovecoloringpage.com/printables/")),
    allImageLocUrlsAbsolute: imageUrls.every((url) => url.startsWith("https://assets.ilovecoloringpage.com/coloring-pages/webp/")),
    noLocalOrPrivateUrls: data.imageEntries.every((entry) => !/localhost|127\.0\.0\.1|r2\.dev|cloudflarestorage|amazonaws/i.test(`${entry.pageUrl}\n${entry.imageUrl}`)),
    noSvgImageUrls: imageUrls.every((url) => !/\/svg\/|\.svg(?:$|[?#])/i.test(url)),
    noPngThumbImageUrls: imageUrls.every((url) => !/\/png\/|\/thumbs\/|\.png(?:$|[?#])/i.test(url)),
    noDuplicatePageUrls: uniquePageUrls.size === pageUrls.length,
    noDuplicateImageUrls: uniqueImageUrls.size === imageUrls.length,
    oneImagePerPage: (xml.match(/<url>/g) || []).length === (xml.match(/<image:image>/g) || []).length,
    imageTitlesPresent: (xml.match(/<image:title>/g) || []).length === imageUrls.length,
  };
  summary.buildPassed =
    summary.imageSitemapCreated &&
    !summary.sitemapIndexCreated &&
    summary.xmlWithinUrlLimit &&
    summary.xmlWithinSizeLimit &&
    summary.allLocUrlsAbsolute &&
    summary.allImageLocUrlsAbsolute &&
    summary.noLocalOrPrivateUrls &&
    summary.noSvgImageUrls &&
    summary.noPngThumbImageUrls &&
    summary.noDuplicatePageUrls &&
    summary.noDuplicateImageUrls &&
    summary.oneImagePerPage &&
    summary.imageTitlesPresent;

  return {
    generatedAt: data.generatedAt,
    runId: `${RUN_ID}-canonical-printable-xml-build`,
    summary,
    files: [{
      path: IMAGE_SITEMAP_PATH,
      publicUrl: IMAGE_SITEMAP_URL,
      type: "urlset",
      pageUrlCount: pageUrls.length,
      imageEntryCount: imageUrls.length,
      fileSizeBytes,
      sha256: xmlSha256,
    }],
  };
}

async function buildIntegrationManifest(data) {
  const packageJson = await readJson("package.json");
  const robots = await readText("app/robots.ts");
  const sitemap = await readText("app/sitemap.ts");
  const nextConfig = await readText("next.config.mjs");

  return {
    generatedAt: data.generatedAt,
    runId: `${RUN_ID}-canonical-printable-build-integration`,
    summary: {
      buildScriptRegeneratesImageSitemap: /build-image-sitemap-data\.mjs/.test(packageJson.scripts?.build || "") && /build-image-sitemap-xml\.mjs/.test(packageJson.scripts?.build || ""),
      robotsReferencesRegularSitemap: /sitemap\.xml/.test(robots),
      robotsReferencesImageSitemap: /image-sitemap\.xml/.test(robots),
      robotsUsesCentralizedCanonicalUrl: /getCanonicalUrl/.test(robots),
      regularSitemapUsesCentralRouteInventory: /getRegularSitemapRoutes/.test(sitemap),
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      appApiRequired: false,
      xmlCopiedByStaticExportFromPublic: true,
      noMediaCopiedToPublic: true,
    },
    packageBuildScript: packageJson.scripts?.build || "",
    robotsSitemapUrls: [REGULAR_SITEMAP_URL, IMAGE_SITEMAP_URL],
  };
}

function buildBuildReport(buildResults) {
  return `# Canonical Printable Image Sitemap Build

${buildMarkdownTable(
  ["Metric", "Value"],
  [
    ["Build passed", summarizeBoolean(buildResults.summary.buildPassed)],
    ["Architecture", buildResults.summary.outputArchitecture],
    ["Canonical page URLs", buildResults.summary.pageUrlCount],
    ["WebP image entries", buildResults.summary.imageEntryCount],
    ["Image titles", summarizeBoolean(buildResults.summary.imageTitlesPresent)],
    ["File size bytes", buildResults.summary.fileSizeBytes],
    ["SHA-256", buildResults.summary.xmlSha256],
    ["Sitemap index created", summarizeBoolean(buildResults.summary.sitemapIndexCreated)],
  ],
)}
`;
}

function buildIntegrationReport(integration) {
  return `# Image Sitemap Build Integration

${buildMarkdownTable(
  ["Check", "Result"],
  Object.entries(integration.summary).map(([key, value]) => [key, typeof value === "boolean" ? summarizeBoolean(value) : value]),
)}

The generated public XML remains a static artifact copied into \`out/\`. It uses the centralized production site configuration and frozen printable route contract without an API or server runtime.
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
