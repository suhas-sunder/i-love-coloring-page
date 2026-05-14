import {
  HTML_SAMPLE_PATHS,
  SITE_URL,
  canonicalSiteUrl,
  ensureOutputDirs,
  extractMeta,
  fetchWithRedirects,
  getMetaContent,
  hasSvgDownloadCopy,
  writeJson,
  writeReport,
} from "./live-seo-utils.mjs";

async function main() {
  await ensureOutputDirs();
  const pages = [];

  for (const pagePath of HTML_SAMPLE_PATHS) {
    const pageUrl = pagePath === "/" ? `${SITE_URL}/` : `${SITE_URL}${pagePath}`;
    const response = await fetchWithRedirects(pageUrl);
    const html = response.bodyText || "";
    const meta = extractMeta(html);
    const ogImageUrl = getMetaContent(meta, "og:image");
    const twitterImageUrl = getMetaContent(meta, "twitter:image");
    const ogImageResponse = ogImageUrl ? await fetchWithRedirects(ogImageUrl) : null;
    const canonical = meta.canonical || "";
    const expectedCanonical = canonicalSiteUrl(pagePath);

    pages.push({
      path: pagePath,
      url: pageUrl,
      status: response.status,
      titleTag: meta.title,
      hasTitleTag: Boolean(meta.title),
      metaDescription: getMetaContent(meta, "description"),
      hasMetaDescription: Boolean(getMetaContent(meta, "description")),
      canonical,
      canonicalUsesWww: canonical.startsWith(SITE_URL),
      canonicalMatchesRoute: canonical === expectedCanonical,
      ogTitle: getMetaContent(meta, "og:title"),
      ogDescription: getMetaContent(meta, "og:description"),
      ogUrl: getMetaContent(meta, "og:url"),
      ogImage: ogImageUrl,
      ogImageStatus: ogImageResponse?.status ?? 0,
      ogImageContentType: ogImageResponse?.contentType || "",
      ogImageUsesStaticOgAsset: /^https:\/\/www\.ilovecoloringpage\.com\/og\/.+\.jpg$/i.test(ogImageUrl),
      ogImageNotSvg: ogImageUrl ? !/\.svg(?:[?#]|$)/i.test(ogImageUrl) : false,
      twitterCard: getMetaContent(meta, "twitter:card"),
      twitterImage: twitterImageUrl,
      twitterImageExists: Boolean(twitterImageUrl),
      noLocalhost: !/localhost|127\.0\.0\.1/i.test(html),
      noR2Dev: !/r2\.dev/i.test(html),
      noSvgDownloadCopy: !hasSvgDownloadCopy(html),
      noOnlineColoringClaim: !/online coloring is available|color online now/i.test(html),
    });
  }

  const summary = {
    pagesChecked: pages.length,
    ogMetadataPassed: pages.every((page) =>
      page.status === 200 &&
      page.hasTitleTag &&
      page.hasMetaDescription &&
      page.canonicalUsesWww &&
      page.canonicalMatchesRoute &&
      Boolean(page.ogTitle) &&
      Boolean(page.ogDescription) &&
      page.ogUrl.startsWith(SITE_URL) &&
      Boolean(page.ogImage) &&
      page.ogImageStatus === 200 &&
      page.ogImageUsesStaticOgAsset &&
      page.ogImageNotSvg &&
      page.twitterCard === "summary_large_image" &&
      page.twitterImageExists &&
      page.noLocalhost &&
      page.noR2Dev &&
      page.noSvgDownloadCopy &&
      page.noOnlineColoringClaim,
    ),
    titleTagsPresent: pages.every((page) => page.hasTitleTag),
    metaDescriptionsPresent: pages.every((page) => page.hasMetaDescription),
    canonicalUrlsUseWww: pages.every((page) => page.canonicalUsesWww),
    ogImagesReturn200: pages.every((page) => page.ogImageStatus === 200),
    ogImagesUseStaticAssets: pages.every((page) => page.ogImageUsesStaticOgAsset),
    twitterSummaryLargeImage: pages.every((page) => page.twitterCard === "summary_large_image"),
    noLocalhost: pages.every((page) => page.noLocalhost),
    noR2Dev: pages.every((page) => page.noR2Dev),
    noSvgDownloadCopy: pages.every((page) => page.noSvgDownloadCopy),
  };

  const result = {
    generatedAt: new Date().toISOString(),
    phase: "live-seo-verification",
    summary,
    pages,
  };

  await writeJson("pipeline/manifests/live-seo-og-metadata-results.json", result);
  await writeReport("pipeline/reports/live-seo-og-metadata-report.md", report(result));
  console.log(`Live SEO OG metadata check complete: ${summary.ogMetadataPassed ? "passed" : "blocked"}.`);
}

function report(result) {
  const s = result.summary;
  return `# Live SEO OG Metadata Report

- Pages checked: ${s.pagesChecked}
- OG metadata passed: ${s.ogMetadataPassed}
- Title tags present: ${s.titleTagsPresent}
- Meta descriptions present: ${s.metaDescriptionsPresent}
- Canonicals use www: ${s.canonicalUrlsUseWww}
- OG images return 200: ${s.ogImagesReturn200}
- OG images use /og/ static JPG assets: ${s.ogImagesUseStaticAssets}
- Twitter card is summary_large_image: ${s.twitterSummaryLargeImage}
- No localhost/r2.dev: ${s.noLocalhost && s.noR2Dev}
- No SVG download copy: ${s.noSvgDownloadCopy}

## Pages

${result.pages.map((page) => `- ${page.path}: og:image ${page.ogImage || "missing"}, twitter:card ${page.twitterCard || "missing"}`).join("\n")}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
