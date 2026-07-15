import { stat } from "node:fs/promises";

import {
  IMAGE_SITEMAP_PATH,
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
  await writeText(VALIDATION_REPORT, `${buildValidationReport(validation).trimEnd()}\n`);
  if (!validation.summary.xmlValidationPassed) process.exitCode = 1;
}

function validateXml({ data, build, xml, fileSizeBytes }) {
  const tagBalance = validateTagBalance(xml);
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]);
  const parsed = blocks.map((block) => ({
    pageUrl: extract(block, "loc"),
    imageUrl: extract(block, "image:loc"),
    imageTitle: extract(block, "image:title"),
    imageCount: (block.match(/<image:image>/g) || []).length,
  }));
  const pageUrls = parsed.map((entry) => entry.pageUrl);
  const imageUrls = parsed.map((entry) => entry.imageUrl);
  const duplicatePageUrls = findDuplicates(pageUrls);
  const duplicateImageUrls = findDuplicates(imageUrls);
  const expectedByPage = new Map(data.imageEntries.map((entry) => [entry.pageUrl, entry]));
  const pairingMismatches = parsed.filter((entry) => {
    const expected = expectedByPage.get(entry.pageUrl);
    return !expected || expected.imageUrl !== entry.imageUrl || expected.imageTitle !== entry.imageTitle;
  });
  const summary = {
    xmlValidationPassed: false,
    fileCount: build.files.length,
    pageUrlCount: pageUrls.length,
    imageEntryCount: imageUrls.length,
    imageTitleCount: parsed.filter((entry) => entry.imageTitle).length,
    namespaceCorrect: /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1">/.test(xml),
    tagBalanceValid: tagBalance.valid,
    xmlDeclarationPresent: xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
    noFileExceedsLimits: pageUrls.length <= MAX_SITEMAP_URLS && fileSizeBytes <= MAX_SITEMAP_BYTES,
    oneImagePerPage: parsed.every((entry) => entry.imageCount === 1),
    allPageLocsCanonicalPrintables: pageUrls.every((url) => /^https:\/\/www\.ilovecoloringpage\.com\/printables\//.test(url)),
    allImageLocsPublicWebp: imageUrls.every((url) => /^https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages\/webp\/.+\.webp$/.test(url)),
    noSvgPngThumbUrls: imageUrls.every((url) => !/\/svg\/|\/png\/|\/thumbs\/|\.(?:svg|png)(?:$|[?#])/i.test(url)),
    noLocalPrivateOrTestUrls: [...pageUrls, ...imageUrls].every((url) => !/localhost|127\.0\.0\.1|r2\.dev|cloudflarestorage|amazonaws/i.test(url)),
    noDuplicatePageUrls: duplicatePageUrls.length === 0,
    noDuplicateImageUrls: duplicateImageUrls.length === 0,
    titlesNatural: parsed.every((entry) => entry.imageTitle && !/\.(?:svg|png|webp|jpe?g)$|coloring page\s+coloring page|__[a-f0-9]{10}|[a-f0-9]{32,}/i.test(entry.imageTitle)),
    noUnsupportedImageFields: !/<image:(?:caption|geo_location|license)>/i.test(xml),
    exactManifestPairing: pairingMismatches.length === 0 && parsed.length === data.imageEntries.length,
    noPrivateInternalData: !/[A-Za-z]:\\|ilovesvg[\\/]|(?:^|[>\s])images[\\/]/i.test(xml),
    fileSizeBytes,
  };
  summary.xmlValidationPassed = Object.entries(summary)
    .filter(([key, value]) => key !== "xmlValidationPassed" && typeof value === "boolean")
    .every(([, value]) => value)
    && summary.pageUrlCount === data.summary.pageUrlCount
    && summary.imageEntryCount === data.summary.imageEntryCount
    && summary.imageTitleCount === data.summary.imageEntryCount;

  return {
    generatedAt: data.generatedAt,
    runId: `${RUN_ID}-canonical-printable-xml-validation`,
    summary,
    errors: [
      ...tagBalance.errors,
      ...duplicatePageUrls.map((url) => `duplicate page URL: ${url}`),
      ...duplicateImageUrls.map((url) => `duplicate image URL: ${url}`),
      ...pairingMismatches.slice(0, 20).map((entry) => `manifest pairing mismatch: ${entry.pageUrl}`),
    ],
    samples: { first: parsed.slice(0, 3), last: parsed.slice(-3) },
  };
}

function extract(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? unescapeXml(match[1].trim()) : "";
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
    } else stack.push(tag);
  }
  if (stack.length) errors.push(`unclosed tags: ${stack.join(", ")}`);
  return { valid: errors.length === 0, errors };
}

function unescapeXml(value) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
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
  return `# Canonical Printable Image Sitemap XML Validation

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
