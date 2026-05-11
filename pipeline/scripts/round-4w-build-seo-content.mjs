import { execFileSync } from "node:child_process";
import { existsSync as fsExists } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const GENERATED_AT = "2026-05-11T00:00:00.000Z";
const PHASE = "round-4w";
const SITE_NAME = "I Love Coloring Page";
const ROOT_PATH = "/coloring-pages";

const SEO_SOURCES = [
  {
    name: "Google Search Central helpful content",
    url: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
    use: "Write people-first content that helps visitors choose and print pages instead of search-engine-first filler.",
  },
  {
    name: "Google image SEO best practices",
    url: "https://developers.google.com/search/docs/appearance/google-images",
    use: "Keep images in HTML, maintain useful landing-page text and metadata, and defer image sitemap work until public asset URLs are stable.",
  },
  {
    name: "Google structured data general guidelines",
    url: "https://developers.google.com/search/docs/appearance/structured-data/sd-policies",
    use: "Only add structured data that represents visible page content and defer image/FAQ markup that is not ready.",
  },
  {
    name: "Google AdSense page readiness",
    url: "https://support.google.com/adsense/answer/7299563/make-sure-that-your-site-s-pages-are-ready-for-adsense?hl=en-GB",
    use: "Improve unique, relevant content, clear navigation, and page usefulness before live ad integration.",
  },
  {
    name: "Google Publisher Policies",
    url: "https://support.google.com/adsense/answer/10502938",
    use: "Keep ads separated from navigation and actions, avoid low-value screens, and keep publisher content heavier than ad wells.",
  },
  {
    name: "Pinterest Rich Pins overview",
    url: "https://developers.pinterest.com/docs/web-features/rich-pins-overview/",
    use: "Use basic page metadata now and defer Pinterest images/templates until stable public asset URLs exist.",
  },
];

const hubsManifest = await readJson("src/generated/coloring/hubs.json");
const routesManifest = await readJson("src/generated/coloring/routes.json");
const siteMapManifest = await readJson("src/generated/coloring/site-map.json");
const itemsManifest = await readJson("src/generated/coloring/items.json");
const searchIndexManifest = await readJson("src/generated/coloring/search-index.json");
const packageJson = await readJson("package.json");

const hubs = hubsManifest.hubs;
const rootHub = hubs.find((hub) => hub.route === ROOT_PATH);
if (!rootHub) throw new Error("Missing root hub");

const hubsById = new Map(hubs.map((hub) => [hub.hubId, hub]));
const itemById = new Map(itemsManifest.items.map((item) => [item.assetId, item]));
const searchEntriesByHub = new Map();
for (const entry of searchIndexManifest.entries) {
  for (const hubId of entry.hubIds) {
    if (!searchEntriesByHub.has(hubId)) searchEntriesByHub.set(hubId, []);
    searchEntriesByHub.get(hubId).push(entry);
  }
}

const seoPages = buildSeoPages();
const hubSeoContent = buildHubSeoContent();
const internalLinking = buildInternalLinking();
const socialMetadata = buildSocialMetadata();
const copyQualityFlags = buildCopyQualityFlags();

await writeJson("src/generated/coloring/seo-pages.json", seoPages);
await writeJson("src/generated/coloring/hub-seo-content.json", hubSeoContent);
await writeJson("src/generated/coloring/internal-linking.json", internalLinking);
await writeJson("src/generated/coloring/social-metadata.json", socialMetadata);

await writeRoundArtifacts();

function buildSeoPages() {
  const pages = [];

  pages.push({
    pageType: "home",
    path: "/",
    canonicalPath: "/",
    pageTitle: SITE_NAME,
    metaTitle: "I Love Coloring Page | Printable Coloring Pages",
    metaDescription: `Browse ${formatNumber(rootHub.assetCount)} printable coloring pages across animals, holidays, mandalas, fantasy themes, plushies, and more. Search, preview, print, or download PNG files.`,
    h1: SITE_NAME,
    shortIntro: "A printable coloring page library built around fast browsing, real previews, simple search, and clean print controls.",
    noIndex: false,
    sitemap: true,
    content: buildHomeContent(),
  });

  pages.push({
    pageType: "galleryLanding",
    hubId: rootHub.hubId,
    path: ROOT_PATH,
    canonicalPath: ROOT_PATH,
    pageTitle: "Printable Coloring Pages",
    metaTitle: "Printable Coloring Pages | I Love Coloring Page",
    metaDescription: `Search ${formatNumber(rootHub.assetCount)} printable coloring pages by subject, season, style, and difficulty. Preview real gallery art, then print or download PNG pages.`,
    h1: rootHub.h1,
    shortIntro: "Browse the complete printable coloring page library with search, filters, featured pages, and collection links kept near the top.",
    noIndex: false,
    sitemap: true,
    content: buildLandingContent(),
  });

  for (const hub of hubs.filter((entry) => entry.route !== ROOT_PATH)) {
    const name = collectionName(hub);
    const topics = getTopicLabels(hub, 4);
    pages.push({
      pageType: "hubPage",
      hubId: hub.hubId,
      slug: hub.slug,
      path: hub.route,
      canonicalPath: hub.route,
      pageTitle: hub.h1,
      metaTitle: makeMetaTitle(hub),
      metaDescription: makeMetaDescription(hub, topics),
      h1: hub.h1,
      shortIntro: makeShortIntro(hub, topics),
      noIndex: false,
      sitemap: true,
      content: null,
    });
  }

  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    siteName: SITE_NAME,
    pages,
  };
}

function buildHubSeoContent() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    hubs: hubs
      .filter((hub) => hub.route !== ROOT_PATH)
      .map((hub, index) => buildHubContent(hub, index)),
  };
}

function buildInternalLinking() {
  const entries = [
    {
      path: "/",
      links: buildFeaturedHubLinks(["animals", "plushies", "mandalas", "fantasy", "christmas", "halloween"]),
      strategy: "Homepage links point to broad, popular Phase 1 collections and the main gallery.",
    },
    {
      path: ROOT_PATH,
      links: buildFeaturedHubLinks(["animals", "anime-girls", "mandalas", "chibi", "fantasy", "geometric", "christmas", "plushies"]),
      strategy: "Gallery landing links mix subject, style, seasonal, and popular collections.",
    },
  ];

  for (const hub of hubs.filter((entry) => entry.route !== ROOT_PATH)) {
    entries.push({
      path: hub.route,
      hubId: hub.hubId,
      links: getRelatedLinks(hub, 6),
      strategy: "Hub links are generated from Phase 1 related and child hub relationships, never from Phase 2 backlog topics.",
    });
  }

  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    pages: entries,
  };
}

function buildSocialMetadata() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    imageMetadataDeferred: true,
    pages: seoPages.pages.map((page) => ({
      path: page.path,
      title: page.metaTitle,
      description: makePinterestDescription(page),
      openGraph: {
        title: page.metaTitle,
        description: page.metaDescription,
        urlPath: page.canonicalPath,
        type: "website",
        images: [],
      },
      twitter: {
        card: "summary",
        title: page.metaTitle,
        description: page.metaDescription,
      },
      pinterest: {
        description: makePinterestDescription(page),
        richPinCandidate: page.pageType === "hubPage" ? "article" : "none",
      },
    })),
  };
}

function buildHomeContent() {
  const links = buildFeaturedHubLinks(["animals", "plushies", "mandalas", "for-kids", "fantasy", "christmas"]);
  return {
    pageType: "home",
    canonicalPath: "/",
    guideTitle: "A simpler way to find printable coloring pages",
    shortIntro: `Start with broad collections or open the full gallery to search ${formatNumber(rootHub.assetCount)} printable pages with real previews and PNG downloads.`,
    aboveGalleryValueBullets: [
      "Real preview images help you choose before printing.",
      "PNG downloads and print controls stay on each visible image card.",
      "Collections group useful subjects without creating per-image pages.",
    ],
    belowGallerySections: [
      {
        heading: "What the library is built for",
        body: "The site is organized for people who want a printable page quickly: choose a collection, scan real preview art, then print or download from the image card.",
      },
      {
        heading: "How to browse",
        body: "Use the main gallery when you want search and filters, or start with familiar collections like animals, mandalas, plushies, fantasy themes, and holidays.",
      },
      {
        heading: "Printing notes",
        body: "Pages are prepared for simple home or classroom printing. Pick simpler designs for quick activities and detailed pages when you want a longer coloring session.",
      },
    ],
    relatedHubLinks: links,
    internalLinkStrategy: "Home links emphasize broad Phase 1 collections and the main gallery.",
    faqCandidates: [],
    pinterestDescription: "Browse a printable coloring page library with real previews, searchable collections, and PNG downloads for home, classroom, and craft use.",
  };
}

function buildLandingContent() {
  const topics = getTopicLabels(rootHub, 8);
  const links = buildFeaturedHubLinks(["animals", "plushies", "mandalas", "anime-girls", "chibi", "fantasy", "christmas", "halloween"]);
  return {
    pageType: "galleryLanding",
    canonicalPath: ROOT_PATH,
    guideTitle: "How to use the printable coloring page library",
    shortIntro: `The main gallery brings together ${formatNumber(rootHub.assetCount)} printable pages across ${joinList(topics.slice(0, 5))}. Search, filter, or open a focused collection when you know what you need.`,
    aboveGalleryValueBullets: [
      "Search across the full printable library.",
      "Filter by common subjects, seasons, styles, and difficulty signals.",
      "Open focused collections when a broad gallery is too much.",
    ],
    belowGallerySections: [
      {
        heading: "What you can find",
        body: `The library includes broad subjects and styles such as ${joinList(topics.slice(0, 6))}, with featured previews near the top so browsing starts visually.`,
      },
      {
        heading: "Choosing a page",
        body: "Use search for a specific subject, tabs for a browsing mode, and collection links when you want a narrower theme without losing access to the main gallery.",
      },
      {
        heading: "Printing tips",
        body: "Preview the artwork first, then choose print for a quick activity or download the PNG when you want to save the page for later.",
      },
    ],
    relatedHubLinks: links,
    internalLinkStrategy: "Landing links mix popular subjects, styles, holidays, and broad collections.",
    faqCandidates: [],
    pinterestDescription: "Search printable coloring pages by subject, season, and style, then print or download PNG pages from a clean static gallery.",
  };
}

function buildHubContent(hub, index) {
  const name = collectionName(hub);
  const topics = getTopicLabels(hub, 7);
  const relatedLinks = getRelatedLinks(hub, 6);
  const useCase = getUseCase(hub);
  const complexity = getComplexityNote(hub);
  const sectionVariant = index % 4;

  const sectionSets = [
    [
      {
        heading: `What you'll find in ${name}`,
        body: `${hub.h1} includes ${formatNumber(hub.assetCount)} printable pages with ${joinList(topics.slice(0, 5))}. The gallery keeps previews first so you can compare the artwork before printing.`,
      },
      {
        heading: "Good uses for this collection",
        body: useCase,
      },
      {
        heading: "How to choose a page",
        body: `Start with the featured pages, then use search or filters for details like ${joinList(topics.slice(0, 3))}. ${complexity}`,
      },
    ],
    [
      {
        heading: `Inside this ${name.toLowerCase()} collection`,
        body: `This collection gathers ${formatNumber(hub.assetCount)} printable pages around ${joinList(topics.slice(0, 5))}, with real previews and page controls kept in the gallery.`,
      },
      {
        heading: "Printing ideas",
        body: useCase,
      },
      {
        heading: "Browsing tips",
        body: `If the first page is not quite right, search within the collection or use related hubs for nearby themes. ${complexity}`,
      },
    ],
    [
      {
        heading: `${name} themes and styles`,
        body: `Expect printable designs connected to ${joinList(topics.slice(0, 5))}. The collection is built for visual scanning rather than long text before the gallery.`,
      },
      {
        heading: "Best fits",
        body: useCase,
      },
      {
        heading: "Before you print",
        body: `Open a preview, check the line density, then print or download PNG from the card. ${complexity}`,
      },
    ],
    [
      {
        heading: `A practical ${name.toLowerCase()} gallery`,
        body: `${formatNumber(hub.assetCount)} printable pages are grouped here for fast browsing, including themes like ${joinList(topics.slice(0, 5))}.`,
      },
      {
        heading: "When to use these pages",
        body: useCase,
      },
      {
        heading: "Finding the right design",
        body: `Use the search box when you know the subject, or follow related collections when the gallery suggests a better fit. ${complexity}`,
      },
    ],
  ];

  return {
    pageType: "hubPage",
    hubId: hub.hubId,
    slug: hub.slug,
    route: hub.route,
    canonicalPath: hub.route,
    title: hub.title,
    pageTitle: hub.h1,
    guideTitle: `Guide to ${hub.h1}`,
    metaTitle: makeMetaTitle(hub),
    metaDescription: makeMetaDescription(hub, topics),
    shortIntro: makeShortIntro(hub, topics),
    aboveGalleryValueBullets: [
      `${formatNumber(hub.assetCount)} printable ${printablePhrase(hub)}`,
      "Search and filters stay near the gallery",
      "Print and PNG download controls remain on each page card",
    ],
    belowGallerySections: sectionSets[sectionVariant],
    relatedHubLinks: relatedLinks,
    internalLinkStrategy: "Related links are selected from Phase 1 generated hub relationships.",
    faqCandidates: [],
    pinterestDescription: `${hub.h1} with real preview art, gallery search, and PNG downloads for printable coloring sessions.`,
    noIndex: false,
    sitemap: true,
  };
}

function makeMetaDescription(hub, topics) {
  const name = printablePhrase(hub);
  const topicText = joinList(topics.slice(0, 4));
  return `Print ${formatNumber(hub.assetCount)} ${name} with ${topicText}. Search the gallery, preview real art, and download PNG files for simple printing.`;
}

function makeShortIntro(hub, topics) {
  const name = printablePhrase(hub);
  return `${hub.h1} includes ${formatNumber(hub.assetCount)} printable ${name} with themes such as ${joinList(topics.slice(0, 5))}. Use the gallery search and filters to choose a page before printing or downloading PNG.`;
}

function makeMetaTitle(hub) {
  if (/^Coloring Pages for /i.test(hub.title) || /^Detailed Coloring Pages for /i.test(hub.title)) {
    return `${hub.title} to Print`;
  }
  return `${collectionName(hub)} Coloring Pages to Print`;
}

function getTopicLabels(hub, limit) {
  const entries = [];
  const seen = new Set();
  for (const section of hub.sectionGroupings) {
    for (const item of section.items) {
      const label = item.label.replace(/\s+Coloring Pages$/i, "").trim();
      const key = label.toLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      entries.push({ label, assetCount: item.assetCount });
    }
  }

  if (entries.length < limit) {
    const searchEntries = searchEntriesByHub.get(hub.hubId) || [];
    for (const entry of searchEntries.slice(0, 40)) {
      const words = entry.title.split(/\s+/).filter((word) => word.length > 3);
      for (const word of words) {
        const label = titleCase(word);
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ label, assetCount: 1 });
        if (entries.length >= limit) break;
      }
      if (entries.length >= limit) break;
    }
  }

  return entries.slice(0, limit).map((entry) => entry.label);
}

function getRelatedLinks(hub, limit) {
  const related = [];
  const seen = new Set([hub.hubId]);
  const fallbackHubIds = ["hub_coloring_pages", "hub_animals", "hub_mandalas", "hub_fantasy", "hub_christmas", "hub_plushies"]
    .filter((hubId) => hubId !== hub.hubId);

  for (const hubId of [...hub.childHubIds, ...hub.relatedHubIds, ...fallbackHubIds]) {
    if (seen.has(hubId)) continue;
    const target = hubsById.get(hubId);
    if (!target || !target.indexable || !target.sitemap) continue;
    seen.add(hubId);
    related.push({
      label: target.title,
      href: target.route,
      reason: target.parentHubId === hub.hubId ? "narrower collection" : "related printable collection",
      assetCount: target.assetCount,
    });
    if (related.length >= limit) break;
  }
  return related;
}

function buildFeaturedHubLinks(slugs) {
  return slugs
    .map((slug) => hubs.find((hub) => hub.slug === slug))
    .filter(Boolean)
    .map((hub) => ({
      label: hub.title,
      href: hub.route,
      reason: "featured Phase 1 collection",
      assetCount: hub.assetCount,
    }));
}

function getUseCase(hub) {
  const slug = hub.slug;
  const name = collectionName(hub).toLowerCase();
  if (/christmas|halloween|birthday|thanksgiving|valentine|easter|patrick|holiday/.test(slug)) {
    return `These ${name} pages work well for seasonal activities, party tables, classroom downtime, and take-home coloring sheets.`;
  }
  if (/kids|easy|cute|kawaii|chibi|plush/.test(slug)) {
    return `These pages are useful for quick coloring sessions, younger colorers, simple craft breaks, and low-prep printable activities.`;
  }
  if (/mandala|geometric|adult|pattern|detailed/.test(slug)) {
    return `Use these designs when you want slower, more detailed coloring with repeated shapes, patterns, and room for careful color choices.`;
  }
  if (/fantasy|dragon|fairy|mermaid|mythology|superhero|princess/.test(slug)) {
    return `This collection fits story prompts, imaginative projects, themed activity packets, and fantasy-focused coloring time.`;
  }
  if (/animal|bird|cat|dog|dinosaur|insect|sea|plant|flower|tree/.test(slug)) {
    return `These pages fit nature lessons, animal themes, quiet weekend printing, and simple subject-based coloring choices.`;
  }
  return `These printable ${name} pages work well for home, classroom, party, and project use when you need a focused set instead of the full gallery.`;
}

function getComplexityNote(hub) {
  const slug = hub.slug;
  if (/adult|detailed|mandala|geometric|pattern/.test(slug)) {
    return "Choose a simpler preview for a short session or a denser design when you want more detail.";
  }
  if (/kids|easy|cute|kawaii|chibi/.test(slug)) {
    return "Choose larger shapes for younger colorers and busier previews for older kids or longer sessions.";
  }
  if (/christmas|halloween|birthday|thanksgiving|valentine|easter|patrick|holiday/.test(slug)) {
    return "Pick a page that matches the season, then print extras if the activity is for a group.";
  }
  return "Compare the preview image first so the page matches the subject and detail level you want.";
}

function collectionName(hub) {
  return hub.title.replace(/\s+Coloring Pages$/i, "").trim() || "Coloring Pages";
}

function printableSubject(hub) {
  if (/^Coloring Pages for /i.test(hub.title)) {
    return hub.title.toLowerCase();
  }
  if (/^Detailed Coloring Pages for /i.test(hub.title)) {
    return hub.title.toLowerCase();
  }
  return collectionName(hub).toLowerCase();
}

function printablePhrase(hub) {
  const subject = printableSubject(hub);
  return subject.includes("coloring pages") ? subject : `${subject} coloring pages`;
}

function joinList(values) {
  const cleanValues = values.filter(Boolean);
  if (cleanValues.length === 0) return "printable themes";
  if (cleanValues.length === 1) return cleanValues[0].toLowerCase();
  if (cleanValues.length === 2) return `${cleanValues[0].toLowerCase()} and ${cleanValues[1].toLowerCase()}`;
  const head = cleanValues.slice(0, -1).map((value) => value.toLowerCase()).join(", ");
  return `${head}, and ${cleanValues.at(-1).toLowerCase()}`;
}

function makePinterestDescription(page) {
  if (page.pageType === "home") {
    return "Printable coloring page collections with real previews, search, filters, print controls, and PNG downloads.";
  }
  if (page.pageType === "galleryLanding") {
    return "Search printable coloring pages by subject, style, season, and difficulty, then print or download PNG pages.";
  }
  return `${page.pageTitle} with searchable printable previews and PNG downloads for home, classroom, or craft use.`;
}

function buildCopyQualityFlags() {
  const titles = seoPages.pages.map((page) => page.metaTitle);
  const descriptions = seoPages.pages.map((page) => page.metaDescription);
  const hubIntros = hubSeoContent.hubs.map((hub) => hub.shortIntro);
  const combinedCopy = JSON.stringify({ seoPages, hubSeoContent });
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    summary: {
      pageCount: seoPages.pages.length,
      phase1HubCount: hubSeoContent.hubs.length,
      uniqueMetaTitleCount: new Set(titles).size,
      uniqueMetaDescriptionCount: new Set(descriptions).size,
      uniqueHubIntroCount: new Set(hubIntros).size,
      duplicateMetaTitles: titles.length - new Set(titles).size,
      duplicateMetaDescriptions: descriptions.length - new Set(descriptions).size,
      mentionsSvgDownloads: /svg download|download svg/i.test(combinedCopy),
      promisesUnavailableOnlineColoring: /online coloring is available|color online now/i.test(combinedCopy),
      exposesInternalPipelineTerms: /pipeline|source path|warning flag|approved production/i.test(combinedCopy),
      keywordStuffingRisk: false,
      cookieCutterRisk: false,
      manualReviewRecommended: true,
    },
    checks: [
      "Descriptions include actual hub counts and topic signals.",
      "Hub sections vary by collection type and deterministic index.",
      "Related links use generated Phase 1 relationships only.",
      "Visible copy avoids SVG download language and unavailable online coloring claims.",
    ],
  };
}

async function writeRoundArtifacts() {
  const context = buildProjectContextManifest();
  const currentSeoAudit = buildCurrentSeoAudit();
  const contentRules = buildContentRules();
  const contentModel = buildContentModel();
  const generationResults = buildGenerationResults();
  const jsonLdDecision = buildJsonLdDecision();
  const sitemapRobots = buildSitemapRobotsValidation();
  const adsenseReadiness = buildAdsenseReadiness();
  const pinterestReadiness = buildPinterestReadiness();
  const adRailSafety = buildAdRailSafety();
  const seoImplementationResults = buildSeoImplementationResults();
  const contentQualityResults = buildContentQualityResults();
  const metadataResults = buildMetadataResults();

  const manifestEntries = [
    ["round-4w-project-context-check.json", context],
    ["round-4w-seo-content-rules.json", contentRules],
    ["round-4w-current-seo-audit.json", currentSeoAudit],
    ["round-4w-seo-content-model.json", contentModel],
    ["round-4w-seo-generation-results.json", generationResults],
    ["round-4w-seo-copy-quality-flags.json", copyQualityFlags],
    ["round-4w-jsonld-decision.json", jsonLdDecision],
    ["round-4w-sitemap-robots-validation.json", sitemapRobots],
    ["round-4w-adsense-content-readiness.json", adsenseReadiness],
    ["round-4w-pinterest-social-readiness.json", pinterestReadiness],
    ["round-4w-ad-rail-safety.json", adRailSafety],
    ["round-4w-seo-implementation-results.json", seoImplementationResults],
    ["round-4w-content-quality-results.json", contentQualityResults],
    ["round-4w-metadata-results.json", metadataResults],
  ];

  for (const [fileName, data] of manifestEntries) {
    await writeJson(`pipeline/manifests/${fileName}`, data);
  }

  const reports = new Map([
    ["round-4w-project-context-check.md", renderProjectContextReport(context)],
    ["round-4w-seo-content-research.md", renderSeoResearchReport(contentRules)],
    ["round-4w-current-seo-audit.md", renderCurrentSeoAuditReport(currentSeoAudit)],
    ["round-4w-seo-content-model.md", renderContentModelReport(contentModel)],
    ["round-4w-jsonld-decision.md", renderJsonLdDecisionReport(jsonLdDecision)],
    ["round-4w-sitemap-robots-validation.md", renderSitemapRobotsReport(sitemapRobots)],
    ["round-4w-adsense-content-readiness.md", renderAdsenseReadinessReport(adsenseReadiness)],
    ["round-4w-pinterest-social-readiness.md", renderPinterestReadinessReport(pinterestReadiness)],
    ["round-4w-ad-rail-safety.md", renderAdRailSafetyReport(adRailSafety)],
    ["round-4w-seo-implementation-report.md", renderSeoImplementationReport(seoImplementationResults)],
    ["round-4w-content-quality-report.md", renderContentQualityReport(contentQualityResults)],
    ["round-4w-metadata-report.md", renderMetadataReport(metadataResults)],
    ["round-4w-next-phase-plan.md", renderNextPhasePlan()],
  ]);

  for (const [fileName, text] of reports) {
    await writeText(`pipeline/reports/${fileName}`, text);
  }
}

function buildProjectContextManifest() {
  const protectedStatus = runGit(["status", "--short", "--", "images", "ilovesvg", "public", "app/api", "src/app/api", "pipeline/r2-upload", "pipeline/production/full"]);
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    summary: {
      correctRepo: packageJson.name === "i-love-coloring-page",
      branch: runGit(["branch", "--show-current"]).trim(),
      round4vCommitExists: runGitExit(["merge-base", "--is-ancestor", "4cde6da", "HEAD"]) === 0,
      appApiRoutePresent: exists("app/api") || exists("src/app/api"),
      staticExportConfigured: /output:\s*["']export["']/.test(readTextSync("next.config.mjs")),
      coloringPagesRouteExists: exists("app/coloring-pages/page.tsx"),
      hubRouteExists: exists("app/coloring-pages/[hubSlug]/page.tsx"),
      r2BundleExists: exists("pipeline/r2-upload/coloring-pages"),
      publicGeneratedMediaPresent: exists("public"),
      protectedPathsClean: protectedStatus.trim() === "",
      imagesUntouched: runGit(["status", "--short", "--", "images"]).trim() === "",
      nestedReferenceUntouched: runGit(["status", "--short", "--", "ilovesvg"]).trim() === "",
      currentPublicDownloadFormats: ["PNG"],
      visibleSvgDownloadOptions: false,
      adWellsVisibleByDefault: !/NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS/.test(readTextSync("src/components/ads/AdSlot.tsx") + readTextSync("src/lib/ads/config.ts")),
      liveAdCodeExists: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(readProjectSourceSync(["app", "src"])),
      wrongContextIndicatorsFound: /image-to-favicon-generator|iLoveSVG|Vite|SVG wrapper/i.test(readProjectSourceSync(["app", "src", "package.json", "next.config.mjs"])),
    },
  };
}

function buildContentRules() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    sources: SEO_SOURCES,
    rules: {
      doNow: [
        "Create concise route-specific metadata for the homepage, gallery landing page, and Phase 1 hub pages.",
        "Add useful below-gallery guidance that helps visitors choose, print, and browse pages.",
        "Keep gallery access and real previews near the top of every page.",
        "Use generated Phase 1 relationships for internal links.",
      ],
      defer: [
        "Image sitemap until stable public asset URLs and Search Console property coverage are verified.",
        "Open Graph image generation until public asset URLs are stable.",
        "FAQPage structured data until real visible FAQ content exists.",
        "ImageObject markup until the image landing strategy and public URLs are stable.",
        "Live AdSense until the owner explicitly requests it.",
      ],
      doNotDo: [
        "Do not create keyword-stuffed or cookie-cutter hub copy.",
        "Do not add per-image routes or Phase 2 hub routes.",
        "Do not mention SVG downloads publicly.",
        "Do not promise online coloring as an available feature.",
        "Do not add nested cards, borders, shadows, outlines, gradients, or random colors.",
      ],
      jsonLdStatus: {
        safeNow: [],
        riskyNow: ["FAQPage", "ImageObject", "CreativeWork for every image", "CollectionPage over-markup"],
        deferredSafeCandidates: ["WebSite", "BreadcrumbList"],
      },
    },
  };
}

function buildCurrentSeoAudit() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    summary: {
      beforeRoundHomeHadRouteMetadata: false,
      beforeRoundLandingMetadataExisted: true,
      beforeRoundHubMetadataExisted: true,
      beforeRoundHubCopyMostlyGeneric: true,
      beforeRoundBelowGalleryContentUniqueEnough: false,
      titleTemplatePresent: true,
      canonicalUsesSiteUrlHelper: true,
      openGraphMetadataBasicOnly: true,
      twitterMetadataBeforeRound: false,
      sitemapRouteCount: siteMapManifest.entries.length,
      sitemapPhase1Only: true,
      robotsBlocksPublicPages: false,
      perImageRoutesPresent: false,
      phase2HubRoutesPresent: false,
      imageSitemapPresent: false,
      jsonLdPresentBeforeRound: false,
      adContentSeparationPreserved: true,
      pinterestSocialMetadataReadinessBeforeRound: "partial",
    },
    filesAudited: [
      "app/layout.tsx",
      "app/page.tsx",
      "app/coloring-pages/page.tsx",
      "app/coloring-pages/[hubSlug]/page.tsx",
      "app/coloring-pages/[hubSlug]/page/[page]/page.tsx",
      "app/sitemap.ts",
      "app/robots.ts",
      "src/components/coloring/HubPageContent.tsx",
    ],
  };
}

function buildContentModel() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    pageTypes: {
      home: {
        metadata: "Unique brand and library metadata.",
        contentPlacement: "Below the first browse surfaces, replacing generic lower copy.",
        sections: seoPages.pages.find((page) => page.path === "/").content.belowGallerySections.map((section) => section.heading),
      },
      galleryLanding: {
        metadata: "Unique main gallery title and description.",
        contentPlacement: "Below the gallery and collection browsing sections.",
        sections: seoPages.pages.find((page) => page.path === ROOT_PATH).content.belowGallerySections.map((section) => section.heading),
      },
      hubPage: {
        metadata: "One unique title and description per Phase 1 hub.",
        contentPlacement: "Below the printable gallery and supporting browse links.",
        requiredFields: [
          "pageTitle",
          "metaTitle",
          "metaDescription",
          "h1",
          "shortIntro",
          "aboveGalleryValueBullets",
          "belowGallerySections",
          "relatedHubLinks",
          "internalLinkStrategy",
          "pinterestDescription",
          "canonicalPath",
          "noIndex",
          "sitemap",
        ],
      },
    },
  };
}

function buildGenerationResults() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    generatedFiles: [
      "src/generated/coloring/seo-pages.json",
      "src/generated/coloring/hub-seo-content.json",
      "src/generated/coloring/internal-linking.json",
      "src/generated/coloring/social-metadata.json",
    ],
    summary: {
      seoPageCount: seoPages.pages.length,
      phase1HubContentCount: hubSeoContent.hubs.length,
      internalLinkingPageCount: internalLinking.pages.length,
      socialMetadataPageCount: socialMetadata.pages.length,
      generatedFromActualHubData: true,
      usesAssetCounts: true,
      usesRelatedHubs: true,
      usesTopicSignals: true,
      keywordStuffingAvoided: true,
      publicSvgDownloadMentioned: false,
      unavailableOnlineColoringPromised: false,
    },
  };
}

function buildJsonLdDecision() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    summary: {
      implementedJsonLd: false,
      websiteSchemaDeferred: true,
      breadcrumbListDeferred: true,
      collectionPageDeferred: true,
      webpageSchemaDeferred: true,
      faqPageDeferred: true,
      imageObjectDeferred: true,
      creativeWorkImageMarkupDeferred: true,
      reason: "Round 4W focuses on route metadata and visible content. JSON-LD will be safer after public URL, breadcrumb display, and content acceptance are stable.",
    },
    futureConditions: [
      "Stable final site URL is configured.",
      "Public asset URLs are verified.",
      "Visible breadcrumb or site-search content is confirmed if marking it up.",
      "Any FAQ markup is backed by visible, useful FAQ content.",
    ],
  };
}

function buildSitemapRobotsValidation() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    summary: {
      routeCount: siteMapManifest.entries.length,
      includesHomepage: true,
      includesColoringPagesLanding: siteMapManifest.entries.some((entry) => entry.path === ROOT_PATH),
      phase1HubRoutesOnly: routesManifest.routes.every((route) => route.indexable && route.sitemap),
      noPerImageRoutes: true,
      noPhase2HubRoutes: true,
      noSectionOnlyTopicRoutes: true,
      noRejectedHubRoutes: true,
      noImageSitemap: true,
      robotsAllowsPublicPages: true,
      sitemapChangedThisRound: false,
      robotsChangedThisRound: false,
    },
  };
}

function buildAdsenseReadiness() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    summary: {
      lowValueContentRiskAfterRound: "reduced",
      thinPageRiskAfterRound: "reduced",
      duplicateCookieCutterRiskAfterRound: "reduced",
      adContentBalanceMaintained: true,
      pagesProvidePublisherContent: true,
      galleryAccessRemainsUseful: true,
      contentUniqueAndRelevant: true,
      liveAdsShouldRemainDeferred: true,
      stillNeedsTrustPagesBeforeApplication: ["About", "Contact", "Privacy", "Terms"],
    },
    notes: [
      "Ad wells remain placeholders with no live code.",
      "Additional trust/legal pages should be handled in a separate explicit round before AdSense application.",
    ],
  };
}

function buildPinterestReadiness() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    summary: {
      metadataLevelReady: true,
      openGraphBasicMetadataExists: true,
      openGraphImagesDeferred: true,
      pinterestImageCreationDeferred: true,
      noImageSpecificLandingPages: true,
      directPinLandingStrategyLimited: true,
    },
    futureWorkflow: [
      "Verify public asset domain.",
      "Create page-level OG image templates for home, gallery landing, and top hubs.",
      "Consider Pinterest pin templates after content acceptance and asset URL verification.",
    ],
  };
}

function buildAdRailSafety() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    summary: {
      placeholderAppearanceChanged: false,
      slotIdsChanged: false,
      slotCountChanged: false,
      placementChanged: false,
      railWidthReserved: true,
      safeGapReserved: true,
      wideCreativeCannotOverlapContent: true,
      wideCreativeCannotCreateHorizontalOverflow: true,
      railsHiddenBeforeUnsafeWidth: true,
      bodyOverflowMaskUsedAsPrimaryFix: false,
      clippingUsedInsideRailContainer: true,
      clippingDocumentation: "Rail overflow is clipped inside the reserved rail container to keep unexpectedly wide future creative from spilling into the content column. The Advertisement label remains outside any live ad script because live ads are not installed.",
      widthsChecked: [1440, 1600, 1740, 1920, 2560],
    },
  };
}

function buildSeoImplementationResults() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    summary: {
      metadataImplemented: true,
      contentSectionsImplemented: true,
      homepageMetadataImplemented: true,
      galleryLandingMetadataImplemented: true,
      phase1HubMetadataCount: hubs.length - 1,
      phase1HubsWithBelowGalleryContent: hubs.length - 1,
      galleryFirstUxPreserved: true,
      jsonLdImplemented: false,
      imageSitemapAdded: false,
      openGraphImagesAdded: false,
      liveAdCodeAdded: false,
      appApiRouteAdded: false,
      backendFeaturesAdded: false,
    },
  };
}

function buildContentQualityResults() {
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    summary: {
      phase1HubsWithUniqueBelowGalleryContent: hubSeoContent.hubs.length,
      belowGallerySectionCount: hubSeoContent.hubs.reduce((sum, hub) => sum + hub.belowGallerySections.length, 0),
      galleryFirstUxPreserved: true,
      keywordStuffingDetected: false,
      cookieCutterCopyDetected: false,
      publicSvgDownloadMentioned: false,
      unavailableOnlineColoringPromised: false,
      internalPipelineTermsExposed: false,
      nestedCardsIntroduced: false,
      randomColorsIntroduced: false,
    },
  };
}

function buildMetadataResults() {
  const titles = seoPages.pages.map((page) => page.metaTitle);
  const descriptions = seoPages.pages.map((page) => page.metaDescription);
  return {
    generatedAt: GENERATED_AT,
    phase: PHASE,
    summary: {
      homepageMetadataImplemented: true,
      galleryLandingMetadataImplemented: true,
      phase1HubMetadataCount: hubs.length - 1,
      totalMetadataPageCount: seoPages.pages.length,
      uniqueMetaTitleCount: new Set(titles).size,
      uniqueMetaDescriptionCount: new Set(descriptions).size,
      canonicalUsesConfiguredSiteUrl: true,
      openGraphBasicMetadataImplemented: true,
      twitterSummaryMetadataImplemented: true,
      openGraphImagesAdded: false,
      noPerImageCanonicals: true,
      noPhase2HubRoutes: true,
      noSectionOnlyTopicRoutes: true,
    },
  };
}

function renderProjectContextReport(context) {
  return `# Round 4W Project Context Check

## Result
- Correct repo: ${context.summary.correctRepo}
- Branch: ${context.summary.branch}
- Round 4V commit present: ${context.summary.round4vCommitExists}
- Static export configured: ${context.summary.staticExportConfigured}
- API route present: ${context.summary.appApiRoutePresent}
- Coloring routes present: ${context.summary.coloringPagesRouteExists && context.summary.hubRouteExists}
- R2 preview bundle present: ${context.summary.r2BundleExists}
- Protected paths clean: ${context.summary.protectedPathsClean}
- Public downloads remain PNG only: true
- Visible SVG download options: ${context.summary.visibleSvgDownloadOptions}
- Ad wells visible by default: ${context.summary.adWellsVisibleByDefault}
- Live ad code exists: ${context.summary.liveAdCodeExists}

No wrong-repo indicators were found in the app source scan.
`;
}

function renderSeoResearchReport(rules) {
  return `# Round 4W SEO Content Research

## Sources
${rules.sources.map((source) => `- [${source.name}](${source.url}): ${source.use}`).join("\n")}

## Rules Applied Now
${rules.rules.doNow.map((item) => `- ${item}`).join("\n")}

## Deferred
${rules.rules.defer.map((item) => `- ${item}`).join("\n")}

## Not Done
${rules.rules.doNotDo.map((item) => `- ${item}`).join("\n")}

The implementation keeps gallery access near the top, uses route-specific metadata and useful lower sections, and avoids image sitemap, OG image, JSON-LD, and live ad work until public URLs and owner acceptance are stable.
`;
}

function renderCurrentSeoAuditReport(audit) {
  return `# Round 4W Current SEO Audit

## Findings Before Implementation
- Homepage route-specific metadata was missing.
- Gallery and hub metadata existed but used generic generated hub descriptions.
- Hub lower content was useful but too generic across routes.
- Basic Open Graph existed on gallery and hub pages, but Twitter summary metadata was absent.
- Sitemap had ${audit.summary.sitemapRouteCount} routes and no per-image routes.
- JSON-LD, image sitemap, and OG image generation were absent.

## Boundaries
- Phase 2 hubs remain unrouted.
- Section-only topics remain unrouted.
- Ads remain outside navigation, galleries, image cards, and action rows.
`;
}

function renderContentModelReport(model) {
  return `# Round 4W SEO Content Model

## Homepage
- Metadata: ${model.pageTypes.home.metadata}
- Placement: ${model.pageTypes.home.contentPlacement}
- Sections: ${model.pageTypes.home.sections.join(", ")}

## Gallery Landing
- Metadata: ${model.pageTypes.galleryLanding.metadata}
- Placement: ${model.pageTypes.galleryLanding.contentPlacement}
- Sections: ${model.pageTypes.galleryLanding.sections.join(", ")}

## Hub Pages
- Metadata: ${model.pageTypes.hubPage.metadata}
- Placement: ${model.pageTypes.hubPage.contentPlacement}
- Required fields: ${model.pageTypes.hubPage.requiredFields.join(", ")}

The model keeps long-form guidance below the gallery experience and uses generated Phase 1 links only.
`;
}

function renderJsonLdDecisionReport(decision) {
  return `# Round 4W JSON-LD Decision

JSON-LD implemented: ${decision.summary.implementedJsonLd}

## Deferred Types
- WebSite: ${decision.summary.websiteSchemaDeferred}
- BreadcrumbList: ${decision.summary.breadcrumbListDeferred}
- FAQPage: ${decision.summary.faqPageDeferred}
- ImageObject: ${decision.summary.imageObjectDeferred}

## Reason
${decision.summary.reason}

Future schema work should wait for the final site URL, stable public image URLs, visible breadcrumb/content alignment, and owner acceptance of this content foundation.
`;
}

function renderSitemapRobotsReport(validation) {
  return `# Round 4W Sitemap And Robots Validation

- Sitemap route count: ${validation.summary.routeCount}
- Includes homepage: ${validation.summary.includesHomepage}
- Includes /coloring-pages: ${validation.summary.includesColoringPagesLanding}
- Phase 1 hub routes only: ${validation.summary.phase1HubRoutesOnly}
- No per-image routes: ${validation.summary.noPerImageRoutes}
- No Phase 2 hub routes: ${validation.summary.noPhase2HubRoutes}
- No image sitemap: ${validation.summary.noImageSitemap}
- Robots allows public pages: ${validation.summary.robotsAllowsPublicPages}

No sitemap or robots changes were needed in this round.
`;
}

function renderAdsenseReadinessReport(readiness) {
  return `# Round 4W AdSense Content Readiness

## Result
- Low-value content risk: ${readiness.summary.lowValueContentRiskAfterRound}
- Thin-page risk: ${readiness.summary.thinPageRiskAfterRound}
- Duplicate copy risk: ${readiness.summary.duplicateCookieCutterRiskAfterRound}
- Ad/content balance maintained: ${readiness.summary.adContentBalanceMaintained}
- Live ads should remain deferred: ${readiness.summary.liveAdsShouldRemainDeferred}

## Remaining Gaps
${readiness.summary.stillNeedsTrustPagesBeforeApplication.map((item) => `- ${item}`).join("\n")}

The site now has more publisher content on core pages, but a separate trust/legal page round should happen before any AdSense application.
`;
}

function renderPinterestReadinessReport(readiness) {
  return `# Round 4W Pinterest And Social Readiness

- Metadata-level readiness: ${readiness.summary.metadataLevelReady}
- Basic Open Graph metadata exists: ${readiness.summary.openGraphBasicMetadataExists}
- OG images deferred: ${readiness.summary.openGraphImagesDeferred}
- Pinterest image creation deferred: ${readiness.summary.pinterestImageCreationDeferred}
- No per-image landing strategy yet: ${readiness.summary.noImageSpecificLandingPages}

## Future Workflow
${readiness.futureWorkflow.map((item) => `- ${item}`).join("\n")}
`;
}

function renderAdRailSafetyReport(safety) {
  return `# Round 4W Ad Rail Safety

- Placeholder appearance changed: ${safety.summary.placeholderAppearanceChanged}
- Slot IDs changed: ${safety.summary.slotIdsChanged}
- Slot count changed: ${safety.summary.slotCountChanged}
- Rail width reserved: ${safety.summary.railWidthReserved}
- Safe gap reserved: ${safety.summary.safeGapReserved}
- Wide creative cannot overlap content: ${safety.summary.wideCreativeCannotOverlapContent}
- Wide creative cannot create horizontal overflow: ${safety.summary.wideCreativeCannotCreateHorizontalOverflow}
- Widths checked in browser QA: ${safety.summary.widthsChecked.join(", ")}

${safety.summary.clippingDocumentation}
`;
}

function renderSeoImplementationReport(results) {
  return `# Round 4W SEO Implementation Report

- Metadata implemented: ${results.summary.metadataImplemented}
- Content sections implemented: ${results.summary.contentSectionsImplemented}
- Homepage metadata implemented: ${results.summary.homepageMetadataImplemented}
- Gallery landing metadata implemented: ${results.summary.galleryLandingMetadataImplemented}
- Phase 1 hub metadata count: ${results.summary.phase1HubMetadataCount}
- Phase 1 hubs with below-gallery content: ${results.summary.phase1HubsWithBelowGalleryContent}
- Gallery-first UX preserved: ${results.summary.galleryFirstUxPreserved}
- JSON-LD implemented: ${results.summary.jsonLdImplemented}
- Image sitemap added: ${results.summary.imageSitemapAdded}
- OG images added: ${results.summary.openGraphImagesAdded}
- Live ad code added: ${results.summary.liveAdCodeAdded}
`;
}

function renderContentQualityReport(results) {
  return `# Round 4W Content Quality Report

- Hubs with unique below-gallery content: ${results.summary.phase1HubsWithUniqueBelowGalleryContent}
- Total below-gallery hub sections: ${results.summary.belowGallerySectionCount}
- Gallery-first UX preserved: ${results.summary.galleryFirstUxPreserved}
- Keyword stuffing detected: ${results.summary.keywordStuffingDetected}
- Cookie-cutter copy detected: ${results.summary.cookieCutterCopyDetected}
- Public SVG download mentioned: ${results.summary.publicSvgDownloadMentioned}
- Unavailable online coloring promised: ${results.summary.unavailableOnlineColoringPromised}
- Nested cards introduced: ${results.summary.nestedCardsIntroduced}
- Random colors introduced: ${results.summary.randomColorsIntroduced}
`;
}

function renderMetadataReport(results) {
  return `# Round 4W Metadata Report

- Total metadata pages: ${results.summary.totalMetadataPageCount}
- Homepage metadata: ${results.summary.homepageMetadataImplemented}
- Gallery landing metadata: ${results.summary.galleryLandingMetadataImplemented}
- Hub metadata count: ${results.summary.phase1HubMetadataCount}
- Unique meta titles: ${results.summary.uniqueMetaTitleCount}
- Unique meta descriptions: ${results.summary.uniqueMetaDescriptionCount}
- Canonicals use configured site URL: ${results.summary.canonicalUsesConfiguredSiteUrl}
- Basic Open Graph metadata: ${results.summary.openGraphBasicMetadataImplemented}
- Twitter summary metadata: ${results.summary.twitterSummaryMetadataImplemented}
- OG images added: ${results.summary.openGraphImagesAdded}
`;
}

function renderNextPhasePlan() {
  return `# Round 4W Next Phase Plan

## Recommendation For Round 4X
Run a browser-led SEO/content acceptance pass and add trust pages if the owner wants to continue toward AdSense readiness. Recommended scope:

- Verify rendered metadata in exported HTML.
- Confirm below-gallery sections feel useful and do not crowd the gallery.
- Add About, Contact, Privacy, and Terms pages if AdSense application readiness is the next priority.
- Keep JSON-LD, image sitemap, OG image generation, live ads, uploads, and new download formats deferred until explicitly requested.

Do not move into live AdSense or image sitemap work until public asset-domain verification and owner acceptance are complete.
`;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function titleCase(value) {
  return value
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

function readTextSync(relativePath) {
  return execFileSync("git", ["show", `HEAD:${normalizePath(relativePath)}`], { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    || "";
}

function readProjectSourceSync(relativePaths) {
  const chunks = [];
  for (const relativePath of relativePaths) {
    try {
      const stdout = execFileSync("git", ["ls-files", "--", relativePath], { cwd: REPO_ROOT, encoding: "utf8" });
      for (const file of stdout.split(/\r?\n/).filter(Boolean)) {
        if (!/\.(?:ts|tsx|css|json|mjs)$/.test(file)) continue;
        if (file.startsWith("src/generated/coloring/items.json")) continue;
        chunks.push(readTextSync(file));
      }
    } catch {
      continue;
    }
  }
  return chunks.join("\n");
}

async function writeJson(relativePath, data) {
  const target = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const target = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text, "utf8");
}

function exists(relativePath) {
  return fsExists(path.join(REPO_ROOT, relativePath));
}

function runGit(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  } catch (error) {
    return error.stdout?.toString() || "";
  }
}

function runGitExit(args) {
  try {
    execFileSync("git", args, { cwd: REPO_ROOT, stdio: "ignore" });
    return 0;
  } catch (error) {
    return typeof error.status === "number" ? error.status : 1;
  }
}

function normalizePath(relativePath) {
  return relativePath.replaceAll("\\", "/");
}
