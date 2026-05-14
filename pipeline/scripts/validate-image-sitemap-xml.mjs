import { stat } from "node:fs/promises";

import {
  IMAGE_SITEMAP_PATH,
  MAX_IMAGES_PER_URL,
  MAX_SITEMAP_BYTES,
  MAX_SITEMAP_URLS,
  RUN_ID,
  buildMarkdownTable,
  readJson,
  readText,
  repoPath,
  summarizeBoolean,
  writeJson,
  writeText,
} from "./image-sitemap-utils.mjs";

const DATA_MANIFEST = "pipeline/manifests/image-sitemap-data.json";
const BUILD_MANIFEST = "pipeline/manifests/image-sitemap-build-results.json";
const VALIDATION_MANIFEST = "pipeline/manifests/image-sitemap-xml-validation.json";
const VALIDATION_REPORT = "pipeline/reports/image-sitemap-xml-validation-report.md";

async function main() {
  const data = await readJson(DATA_MANIFEST);
  const build = await readJson(BUILD_MANIFEST);
  const xml = await readText(IMAGE_SITEMAP_PATH);
  const fileStat = await stat(repoPath(IMAGE_SITEMAP_PATH));
  const validation = validateXml({ data, build, xml, fileSizeBytes: fileStat.size });
  await writeJson(VALIDATION_MANIFEST, validation);
  await writeText(VALIDATION_REPORT, buildValidationReport(validation));

  if (!validation.summary.xmlValidationPassed) {
    process.exitCode = 1;
  }
}

function validateXml({ data, build, xml, fileSizeBytes }) {
  const tagBalance = validateTagBalance(xml);
  const urlBlocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]);
  const imageLocs = [...xml.matchAll(/<image:loc>([\s\S]*?)<\/image:loc>/g)].map((match) => unescapeXml(match[1].trim()));
  const pageLocs = urlBlocks.map((block) => {
    const match = block.match(/<loc>([\s\S]*?)<\/loc>/);
    return match ? unescapeXml(match[1].trim()) : "";
  });
  const imagesByPage = urlBlocks.map((block) => [...block.matchAll(/<image:image>/g)].length);
  const duplicateImageUrls = findDuplicates(imageLocs);
  const duplicatePageUrls = findDuplicates(pageLocs);
  const obviousBadTitles = data.imageEntries.filter((entry) => /chatgpt|failed|timestamp|export/i.test(entry.imageTitle));
  const privateDataMatches = xml.match(/[A-Za-z]:\\|ilovesvg\/|images\//gi) || [];

  const summary = {
    xmlValidationPassed: false,
    fileCount: build.files.length,
    pageUrlCount: pageLocs.length,
    imageEntryCount: imageLocs.length,
    namespaceCorrect: /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1">/.test(xml),
    tagBalanceValid: tagBalance.valid,
    xmlDeclarationPresent: xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
    noFileExceedsLimits: pageLocs.length <= MAX_SITEMAP_URLS && fileSizeBytes <= MAX_SITEMAP_BYTES,
    noUrlExceedsImageLimit: imagesByPage.every((count) => count <= MAX_IMAGES_PER_URL),
    allPageLocsAbsolute: pageLocs.every((loc) => loc.startsWith("https://www.ilovecoloringpage.com/")),
    allImageLocsAbsolute: imageLocs.every((loc) => loc.startsWith("https://assets.ilovecoloringpage.com/coloring-pages/webp/")),
    noSvgImageUrls: imageLocs.every((loc) => !/\/svg\//i.test(loc)),
    noPngThumbImageUrls: imageLocs.every((loc) => !/\/png\/|\/thumbs\//i.test(loc)),
    noLocalUrls: [...pageLocs, ...imageLocs].every((loc) => !/localhost|127\.0\.0\.1/i.test(loc)),
    noR2DevUrls: [...pageLocs, ...imageLocs].every((loc) => !/r2\.dev/i.test(loc)),
    noDuplicatePrefix: imageLocs.every((loc) => !/coloring-pages\/coloring-pages/i.test(loc)),
    noPerImageRoutes: pageLocs.every((loc) => !/#asset-|\/(?:image|item|asset)\//i.test(loc)),
    noDuplicateImageUrls: duplicateImageUrls.length === 0,
    noDuplicatePageUrls: duplicatePageUrls.length === 0,
    noDeprecatedImageTags: !/<image:(?:title|caption|geo_location|license)>/i.test(xml),
    noObviousInvalidTitlesCaptions: obviousBadTitles.length === 0,
    noPrivateInternalData: privateDataMatches.length === 0,
    fileSizeBytes,
    maxImagesOnPage: Math.max(...imagesByPage),
  };

  summary.xmlValidationPassed =
    summary.fileCount === 1 &&
    summary.pageUrlCount === data.summary.pageUrlCount &&
    summary.imageEntryCount === data.summary.imageEntryCount &&
    summary.namespaceCorrect &&
    summary.tagBalanceValid &&
    summary.xmlDeclarationPresent &&
    summary.noFileExceedsLimits &&
    summary.noUrlExceedsImageLimit &&
    summary.allPageLocsAbsolute &&
    summary.allImageLocsAbsolute &&
    summary.noSvgImageUrls &&
    summary.noPngThumbImageUrls &&
    summary.noLocalUrls &&
    summary.noR2DevUrls &&
    summary.noDuplicatePrefix &&
    summary.noPerImageRoutes &&
    summary.noDuplicateImageUrls &&
    summary.noDuplicatePageUrls &&
    summary.noDeprecatedImageTags &&
    summary.noObviousInvalidTitlesCaptions &&
    summary.noPrivateInternalData;

  return {
    generatedAt: data.generatedAt,
    runId: `${RUN_ID}-xml-validation`,
    summary,
    files: [
      {
        path: IMAGE_SITEMAP_PATH,
        pageUrlCount: pageLocs.length,
        imageEntryCount: imageLocs.length,
        fileSizeBytes,
      },
    ],
    errors: [...tagBalance.errors, ...duplicateImageUrls.map((url) => `duplicate image URL: ${url}`), ...duplicatePageUrls.map((url) => `duplicate page URL: ${url}`)],
    samples: {
      firstPageLocs: pageLocs.slice(0, 5),
      firstImageLocs: imageLocs.slice(0, 5),
      largestImageCounts: imagesByPage.sort((a, b) => b - a).slice(0, 10),
    },
  };
}

function validateTagBalance(xml) {
  const errors = [];
  const stack = [];
  const tagPattern = /<\/?([A-Za-z_:][\w:.-]*)(?:\s[^>]*)?>/g;
  for (const match of xml.matchAll(tagPattern)) {
    const raw = match[0];
    const tag = match[1];
    if (raw.startsWith("<?") || raw.endsWith("/>")) continue;
    if (raw.startsWith("</")) {
      const previous = stack.pop();
      if (previous !== tag) errors.push(`expected closing ${previous || "none"} but found ${tag}`);
    } else {
      stack.push(tag);
    }
  }
  if (stack.length) errors.push(`unclosed tags: ${stack.join(", ")}`);
  return { valid: errors.length === 0, errors };
}

function unescapeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function buildValidationReport(validation) {
  return `# Image Sitemap XML Validation Report

${buildMarkdownTable(
  ["Check", "Result"],
  Object.entries(validation.summary).map(([key, value]) => [key, typeof value === "boolean" ? summarizeBoolean(value) : value]),
)}

${validation.errors.length ? `## Errors\n\n${validation.errors.map((error) => `- ${error}`).join("\n")}\n` : "No XML validation blockers were found.\n"}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
