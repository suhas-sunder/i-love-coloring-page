import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const RUN_ID = "content-quality";
const GENERATED_AT = new Date().toISOString();
const SITE_NAME = "I Love Coloring Page";
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const ROOT_PATH = "/coloring-pages";

const OFFICIAL_REFERENCES = [
  {
    name: "Google Search Central helpful content",
    url: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
    use: "People-first copy, page experience, and avoiding search-first filler.",
  },
  {
    name: "Google Search spam policies",
    url: "https://developers.google.com/search/docs/essentials/spam-policies",
    use: "Avoid scaled low-value pages, scraped copy, keyword stuffing, and pages made only for rankings.",
  },
  {
    name: "Google AdSense page readiness",
    url: "https://support.google.com/adsense/answer/7299563/make-sure-that-your-site-s-pages-are-ready-for-adsense?hl=en-GB",
    use: "Unique relevant content, clear navigation, and a useful page experience before ads.",
  },
];

const STOPWORDS = new Set([
  "a",
  "all",
  "and",
  "art",
  "boy",
  "boys",
  "coloring",
  "coloring-pages",
  "for",
  "from",
  "girl",
  "girls",
  "line",
  "page",
  "pages",
  "printable",
  "the",
  "with",
]);

const GENERIC_STYLE_TERMS = new Set([
  "anime",
  "character",
  "chibi",
  "cosplay",
  "cute",
  "fantasy",
  "girl",
  "holiday",
  "jutsu",
  "kawaii",
  "mandala",
  "pattern",
  "plushie",
  "summon",
  "summoning",
]);

const SUBJECT_CLUSTER_BY_TYPE = {
  animal: new Set(["animal", "animals", "bird", "birds", "cat", "cats", "dog", "dogs", "fish", "fox", "horse", "insect", "insects", "reptile", "reptiles", "sea", "whale", "wolf"]),
  dogBreed: new Set(["dog", "dogs", "breed", "puppy", "terrier", "bulldog", "collie", "hound"]),
  dinosaur: new Set(["dinosaur", "dinosaurs", "prehistoric", "rex", "tyrannosaurus", "triceratops", "stegosaurus", "brachiosaurus", "ankylosaurus", "pteranodon", "pterodactyl", "mammoth", "mosasaurus", "plesiosaurus", "dodo"]),
  plant: new Set(["plant", "plants", "flower", "flowers", "garden", "forest", "tree", "lily", "rose", "daisy", "orchid", "poppy", "lotus", "bamboo", "palm", "mushroom"]),
  food: new Set(["food", "bakery", "cake", "cookie", "cupcake", "sushi", "nigiri", "salmon", "gingerbread"]),
  holiday: new Set(["holiday", "seasonal", "christmas", "halloween", "birthday", "easter", "thanksgiving", "valentine", "pumpkin", "leprechaun", "gingerbread"]),
  fantasy: new Set(["anime", "chibi", "fantasy", "dragon", "magic", "summoning", "wizard", "witch", "fairy", "princess", "castle", "knight", "unicorn", "mythology"]),
  pattern: new Set(["mandala", "geometric", "pattern", "patterns", "detailed", "abstract"]),
  kidsEasy: new Set(["easy", "simple", "kids", "cute", "chibi", "kawaii", "animal", "animals"]),
  vehiclePlace: new Set(["vehicle", "vehicles", "car", "cars", "train", "truck", "plane", "ship", "boat", "building", "buildings", "landmark", "city"]),
  cute: new Set(["cute", "kawaii", "plushie", "plushies", "chibi", "soft"]),
  broad: new Set([]),
};

const PREFERRED_CLUSTER_LABELS_BY_SLUG = {
  animals: ["dogs", "sea life", "prehistoric animals", "birds", "insects", "reptiles"],
  dinosaurs: ["triceratops", "velociraptors", "T-Rex", "stegosaurus", "brachiosaurus", "ankylosaurus"],
  flowers: ["roses", "lilies", "daisies", "orchids", "poppies", "lotus"],
  food: ["bakery pages", "birthday cakes", "cookies", "sushi", "nigiri"],
  plants: ["flowers", "garden pages", "trees", "mushrooms", "bamboo"],
  plushies: ["animal plushies", "holiday plushies", "dragon plushies", "cute subjects"],
  fantasy: ["dragons", "magic", "castles", "mythology", "fantasy creatures"],
  holidays: ["Christmas", "Halloween", "birthday pages", "Easter", "St. Patrick's Day"],
  vehicles: ["cars", "trains", "boats", "planes", "steam trains"],
  buildings: ["houses", "castles", "city scenes", "landmarks"],
  insects: ["butterflies", "bees", "beetles", "spiders"],
  "sea-life": ["dolphins", "whales", "sharks", "fish", "octopus"],
};

const hubsManifest = await readJson("src/generated/coloring/runtime-hubs.json");
const routesManifest = await readJson("src/generated/coloring/runtime-routes.json");
const siteMapManifest = await readJson("src/generated/coloring/runtime-site-map.json");
const itemsManifest = await readJson("src/generated/coloring/runtime-available-items.json");
const searchIndexManifest = await readJson("src/generated/coloring/runtime-search-index.json");
const existingSeoPages = await readJson("src/generated/coloring/runtime-seo-pages.json");

const hubs = hubsManifest.hubs;
const rootHub = hubs.find((hub) => hub.route === ROOT_PATH);
if (!rootHub) throw new Error("Missing root coloring page hub.");

const hubsById = new Map(hubs.map((hub) => [hub.hubId, hub]));
const itemsById = new Map(itemsManifest.items.map((item) => [item.assetId, item]));
const searchEntriesByHubId = buildSearchEntriesByHubId();

const contextCheck = buildContextCheck();
const currentAudit = buildCurrentAudit();
const templateStrategy = buildTemplateStrategy();
const qualityData = buildHubContentQualityData();
const seoPages = buildSeoPages();
const hubSeoContent = buildHubSeoContent();
const socialMetadata = buildSocialMetadata(seoPages);
const generatedDataSummary = buildGeneratedDataSummary(qualityData, hubSeoContent);
const layoutResults = buildLayoutResults();
const metadataResults = buildMetadataResults(seoPages);
const jsonldRegression = buildJsonLdRegression();
const adsenseReadiness = buildAdsenseReadiness(generatedDataSummary, currentAudit);

await writeJson("pipeline/manifests/content-quality-context-check.json", contextCheck);
await writeText("pipeline/reports/content-quality-context-check.md", renderContextReport(contextCheck));
await writeJson("pipeline/manifests/content-quality-current-audit.json", currentAudit);
await writeText("pipeline/reports/content-quality-current-audit.md", renderCurrentAuditReport(currentAudit));
await writeJson("pipeline/manifests/content-quality-template-strategy.json", templateStrategy);
await writeText("pipeline/reports/content-quality-template-strategy.md", renderTemplateStrategyReport(templateStrategy));

await writeJson("src/generated/coloring/hub-content-quality.json", qualityData);
await writeJson("src/generated/coloring/hub-seo-content.json", hubSeoContent);
await writeJson("src/generated/coloring/runtime-hub-seo-content.json", {
  ...hubSeoContent,
  runId: `${RUN_ID}-runtime-hub-seo-content`,
  source: "src/generated/coloring/hub-content-quality.json",
});
await writeJson("src/generated/coloring/seo-pages.json", seoPages);
await writeJson("src/generated/coloring/runtime-seo-pages.json", {
  ...seoPages,
  runId: `${RUN_ID}-runtime-seo-pages`,
  source: "src/generated/coloring/hub-content-quality.json",
});
await writeJson("src/generated/coloring/social-metadata.json", socialMetadata);
await writeJson("src/generated/coloring/runtime-social-metadata.json", {
  ...socialMetadata,
  runId: `${RUN_ID}-runtime-social-metadata`,
  source: "src/generated/coloring/hub-content-quality.json",
});

await writeJson("pipeline/manifests/content-quality-generated-data.json", generatedDataSummary);
await writeText("pipeline/reports/content-quality-generated-data-report.md", renderGeneratedDataReport(generatedDataSummary));
await writeJson("pipeline/manifests/content-quality-layout-results.json", layoutResults);
await writeText("pipeline/reports/content-quality-layout-report.md", renderLayoutReport(layoutResults));
await writeJson("pipeline/manifests/content-quality-metadata-results.json", metadataResults);
await writeText("pipeline/reports/content-quality-metadata-report.md", renderMetadataReport(metadataResults));
await writeJson("pipeline/manifests/content-quality-jsonld-regression.json", jsonldRegression);
await writeText("pipeline/reports/content-quality-jsonld-regression-report.md", renderJsonLdRegressionReport(jsonldRegression));
await writeJson("pipeline/manifests/content-quality-adsense-readiness.json", adsenseReadiness);
await writeText("pipeline/reports/content-quality-adsense-readiness-report.md", renderAdsenseReadinessReport(adsenseReadiness));

console.log(JSON.stringify(generatedDataSummary.summary, null, 2));

function buildContextCheck() {
  const nextConfig = readTextSync("next.config.mjs");
  const appApiPresent = existsSync(path.join(REPO_ROOT, "app", "api"));
  const imageSitemap = readTextSync("public/image-sitemap.xml");
  const sourceText = readProjectTextSync(["app", "src/components", "src/lib", "src/generated/coloring"]);
  const projectTextWithoutGenerated = readProjectTextSync(["app", "src/components", "src/lib"]);

  const summary = {
    correctRepo: path.basename(REPO_ROOT) === "i-love-coloring-page",
    currentBranch: runGit(["branch", "--show-current"]).trim(),
    appApiRoutePresent: appApiPresent,
    staticExportConfigured: /output:\s*["']export["']/.test(nextConfig),
    runtimeHubCount: hubs.length,
    runtimeAvailableRecords: itemsManifest.items.length,
    sitemapPageExists: existsSync(path.join(REPO_ROOT, "app", "sitemap", "page.tsx")),
    xmlSitemapExists: existsSync(path.join(REPO_ROOT, "app", "sitemap.ts")),
    imageSitemapExists: existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")),
    imageSitemapWebpEntries: countMatches(imageSitemap, /<image:loc>[^<]+\.webp<\/image:loc>/g),
    ogImagesExist: existsSync(path.join(REPO_ROOT, "public", "og")),
    jsonLdExists: /JsonLdScript|buildHubPageJsonLd|buildGalleryLandingJsonLd|application\/ld\+json/i.test(projectTextWithoutGenerated),
    publicSafeSiteUrl: sourceText.includes(SITE_URL),
    publicSafeAssetBase: sourceText.includes(ASSET_BASE_URL),
    publicSafeEmail: sourceText.includes(CONTACT_EMAIL),
    svgDownloadAbsent: !/Download SVG|SVG download|downloadSvg/i.test(sourceText),
    publicDownloadsPngJpgWebp: /Download PNG/.test(sourceText) && /Download JPG/.test(sourceText) && /Download WebP/.test(sourceText),
    liveAdSenseAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
    imagesUntouched: runGit(["status", "--short", "--", "images"]).trim() === "",
    ilovesvgUntouched: runGit(["status", "--short", "--", "ilovesvg"]).trim() === "",
  };

  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-context-check`,
    references: OFFICIAL_REFERENCES,
    summary,
    blockers: Object.entries(summary)
      .filter(([key, value]) => (key.endsWith("Present") ? value === true : value === false))
      .map(([key]) => key),
  };
}

function buildCurrentAudit() {
  const existingHubSeo = readJsonSync("src/generated/coloring/runtime-hub-seo-content.json");
  const intros = existingHubSeo.hubs.map((hub) => normalizeText(hub.shortIntro));
  const introFrames = new Map();
  for (const intro of intros) {
    const frame = intro
      .replace(/\d[\d,]*/g, "{count}")
      .replace(/^[a-z0-9 -]+ coloring pages includes/, "{hub} includes")
      .replace(/with themes such as [^.]+/g, "with themes such as {topics}");
    introFrames.set(frame, (introFrames.get(frame) || 0) + 1);
  }
  const repeatedFrames = [...introFrames.entries()].filter(([, count]) => count >= 5);
  const staleDownloadClaims = existingHubSeo.hubs.filter((hub) => /download controls remain on each page card|downloading PNG\b/i.test(JSON.stringify(hub)));
  const thinHubs = hubs.filter((hub) => hub.route !== ROOT_PATH && hub.assetCount < 12).map((hub) => hub.slug);
  const hubTypes = hubs.map((hub) => ({ slug: hub.slug || "coloring-pages", type: classifyHub(hub).type, assetCount: hub.assetCount }));

  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-current-audit`,
    summary: {
      hubsAudited: hubs.length,
      existingHubSeoRecords: existingHubSeo.hubs.length,
      repeatedIntroFrameCount: repeatedFrames.length,
      largestRepeatedIntroFrame: Math.max(0, ...repeatedFrames.map(([, count]) => count)),
      staleDownloadClaimCount: staleDownloadClaims.length,
      thinHubCount: thinHubs.length,
      galleryFirstLayoutAlreadyPresent: sourceOrder("src/components/coloring/HubPageContent.tsx", "GallerySearch", "SeoContentSection"),
      supportingContentBelowGallery: sourceOrder("src/components/coloring/HubPageContent.tsx", "GallerySearch", "SeoContentSection"),
    },
    repeatedFrames: repeatedFrames.slice(0, 12).map(([frame, count]) => ({ frame, count })),
    staleDownloadClaims: staleDownloadClaims.slice(0, 25).map((hub) => ({ slug: hub.slug, title: hub.title })),
    thinHubs,
    hubTypes,
    findings: [
      "Existing hub intros are mostly generated from the same broad sentence frame.",
      "Several records still mention PNG-only or card-level download wording even though downloads now live in the preview workflow.",
      "The React layout already keeps supporting SEO content below the gallery, so the main fix is content data quality rather than moving blocks above the gallery.",
    ],
  };
}

function buildTemplateStrategy() {
  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-template-strategy`,
    references: OFFICIAL_REFERENCES,
    patterns: [
      pattern("broad", "Broad collection hubs", "Help visitors choose a direction without turning the page into a directory.", "120-220 words below the gallery", "Browsing a large set by subject, style, or season.", "Do not claim every possible subject appears; mention representative patterns from runtime items."),
      pattern("animal", "Animals and nature hubs", "Explain the kind of creature or nature artwork users can expect and how to pick detail levels.", "110-190 words", "Printing animal pages for lessons, activities, or relaxed coloring.", "Do not add animal facts that are not visible in the image set."),
      pattern("dogBreed", "Dog breed hubs", "Keep breed wording specific and practical for choosing a page.", "100-170 words", "Finding a printable dog breed page quickly.", "Do not invent breed traits beyond obvious collection labels."),
      pattern("dinosaur", "Dinosaur and prehistoric hubs", "Distinguish species or prehistoric subjects from the broader dinosaur collection.", "110-180 words", "School, prehistoric, and dinosaur-themed printing.", "Do not use franchise language or unsupported science claims."),
      pattern("plant", "Flowers and plant hubs", "Call out plant or flower motifs, simple craft uses, and printable display ideas.", "100-175 words", "Seasonal, classroom, craft, and nature-themed coloring.", "Do not imply botanical accuracy for every image."),
      pattern("food", "Food and dessert hubs", "Describe the visible treats or food subjects and likely party/classroom uses.", "100-170 words", "Printable food pages for parties, menus, crafts, and light activities.", "Do not make nutrition, recipe, or commercial-use claims."),
      pattern("holiday", "Holiday and seasonal hubs", "Support party, classroom, and home planning while keeping dates and themes clear.", "120-200 words", "Finding printable pages for a holiday activity.", "Do not overpromise complete event packs."),
      pattern("fantasy", "Fantasy and character hubs", "Frame the artwork as generic fantasy, magic, or character themes without protected IP wording.", "110-190 words", "Fantasy-themed coloring and imaginative projects.", "Do not mention franchise names or imply branded characters."),
      pattern("pattern", "Mandala, geometric, and detailed hubs", "Help users choose complexity and printing use.", "110-180 words", "Relaxed coloring, detailed pages, and pattern practice.", "Do not promise therapeutic or medical benefits."),
      pattern("kidsEasy", "Kids and easy hubs", "Explain simpler page choices and supervision-friendly printing without age overclaims.", "100-170 words", "Quick activities and simpler coloring pages.", "Do not imply all pages are suitable for every child."),
      pattern("vehiclePlace", "Vehicles and places hubs", "Mention recognizable object or place types from runtime titles.", "100-180 words", "Subject-based classroom, travel, and hobby pages.", "Do not invent real-world locations unless the titles support them."),
      pattern("cute", "Plushie and cute hubs", "Keep the tone calm and practical while describing soft, cute, or kawaii-style subjects.", "100-175 words", "Cute printable pages, party activities, and relaxed browsing.", "Do not make the page sound childish or cluttered."),
    ],
    internalLinkStrategy: "Use runtime relatedHubIds, childHubIds, and parentHubId only. Do not link to backlog/manual-review routes.",
    antiBoilerplateRules: [
      "Vary section headings by hub type.",
      "Use actual representative item titles or section terms in every hub.",
      "Avoid one universal intro with only the hub title swapped.",
      "Keep supporting content after the gallery.",
      "State only PNG, JPG, and WebP as public download formats.",
    ],
  };
}

function buildHubContentQualityData() {
  const records = hubs.map((hub) => {
    const classification = classifyHub(hub);
    const representatives = getRepresentativeItems(hub, 10);
    const terms = getEvidenceTerms(hub, representatives, 8);
    const related = getRelatedLinks(hub, 8);
    const content = hub.route === ROOT_PATH ? buildRootHubContent(hub, related) : buildHubContent(hub, classification, representatives, terms, related);
    return {
      hubId: hub.hubId,
      slug: hub.slug || "coloring-pages",
      route: hub.route,
      title: hub.title,
      assetCount: hub.assetCount,
      type: classification.type,
      intent: classification.intent,
      evidenceTerms: terms,
      representativeAssets: representatives.map((item) => ({
        assetId: item.assetId,
        title: item.title,
        filenameSlug: item.filenameSlug,
        categorySlug: item.categorySlug,
      })),
      relatedHubs: related.map((link) => ({ label: link.label, href: link.href, assetCount: link.assetCount })),
      content,
    };
  });

  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-hub-content-quality`,
    source: {
      hubs: "src/generated/coloring/runtime-hubs.json",
      items: "src/generated/coloring/runtime-available-items.json",
      searchIndex: "src/generated/coloring/runtime-search-index.json",
    },
    summary: {
      hubs: records.length,
      runtimeAvailableRecords: itemsManifest.items.length,
      recordsWithRepresentatives: records.filter((record) => record.representativeAssets.length > 0).length,
      recordsWithRelatedLinks: records.filter((record) => record.relatedHubs.length > 0).length,
      svgClaims: records.filter((record) => /svg/i.test(JSON.stringify(record.content))).length,
      onlineColoringClaims: records.filter((record) => /online coloring/i.test(JSON.stringify(record.content))).length,
    },
    hubs: records,
  };
}

function buildSeoPages() {
  const pages = [];
  pages.push({
    pageType: "home",
    path: "/",
    canonicalPath: "/",
    pageTitle: SITE_NAME,
    metaTitle: "I Love Coloring Page | Printable Coloring Pages",
    metaDescription: `Browse ${formatNumber(rootHub.assetCount)} printable coloring pages with real previews, gallery search, print controls, and PNG, JPG, or WebP downloads.`,
    h1: SITE_NAME,
    shortIntro: "A printable coloring page library built around fast browsing, real previews, simple search, and clean print controls.",
    noIndex: false,
    sitemap: true,
    content: buildHomeSeoContent(),
  });

  const rootRelated = getRelatedLinks(rootHub, 8);
  pages.push({
    pageType: "galleryLanding",
    hubId: rootHub.hubId,
    path: ROOT_PATH,
    canonicalPath: ROOT_PATH,
    pageTitle: "Printable Coloring Pages",
    metaTitle: "Printable Coloring Pages | I Love Coloring Page",
    metaDescription: `Search ${formatNumber(rootHub.assetCount)} printable coloring pages by subject, season, style, and detail level. Preview the artwork, then print or download PNG, JPG, or WebP.`,
    h1: rootHub.h1,
    shortIntro: "Browse the complete printable coloring page library with search, filters, featured pages, and collection links kept near the top.",
    noIndex: false,
    sitemap: true,
    content: buildRootHubContent(rootHub, rootRelated),
  });

  for (const hub of hubs.filter((entry) => entry.route !== ROOT_PATH)) {
    const classification = classifyHub(hub);
    const representatives = getRepresentativeItems(hub, 8);
    const terms = getEvidenceTerms(hub, representatives, 6);
    pages.push({
      pageType: "hubPage",
      hubId: hub.hubId,
      slug: hub.slug,
      path: hub.route,
      canonicalPath: hub.route,
      pageTitle: hub.h1,
      metaTitle: makeMetaTitle(hub, classification),
      metaDescription: makeMetaDescription(hub, classification, terms),
      h1: hub.h1,
      shortIntro: makeHubShortIntro(hub, classification, representatives, terms),
      noIndex: false,
      sitemap: true,
      content: null,
    });
  }

  return {
    generatedAt: GENERATED_AT,
    phase: RUN_ID,
    siteName: SITE_NAME,
    pages,
  };
}

function buildHubSeoContent() {
  return {
    generatedAt: GENERATED_AT,
    phase: RUN_ID,
    hubs: qualityData.hubs
      .filter((record) => record.route !== ROOT_PATH)
      .map((record) => ({
        pageType: "hubPage",
        hubId: record.hubId,
        slug: record.slug,
        route: record.route,
        canonicalPath: record.route,
        title: record.title,
        pageTitle: record.title,
        guideTitle: record.content.guideTitle,
        metaTitle: makeMetaTitle(hubsById.get(record.hubId), classifyHub(hubsById.get(record.hubId))),
        metaDescription: makeMetaDescription(hubsById.get(record.hubId), classifyHub(hubsById.get(record.hubId)), record.evidenceTerms),
        shortIntro: record.content.shortIntro,
        aboveGalleryValueBullets: record.content.aboveGalleryValueBullets,
        belowGallerySections: record.content.belowGallerySections,
        relatedHubLinks: record.content.relatedHubLinks,
        internalLinkStrategy: record.content.internalLinkStrategy,
        faqCandidates: [],
        pinterestDescription: record.content.pinterestDescription,
        noIndex: false,
        sitemap: true,
      })),
  };
}

function buildHubContent(hub, classification, representatives, terms, related) {
  const name = collectionName(hub);
  const examplePhrase = makeExamplePhrase(hub, classification, representatives, terms);
  const topicPhrase = terms.length ? joinList(terms.slice(0, 3).map(formatTermForSentence)) : "the previewed subjects";
  const intro = makeHubShortIntro(hub, classification, representatives, terms);
  const sectionSet = makeSections(hub, classification, examplePhrase, topicPhrase, representatives);

  return {
    pageType: "hubPage",
    canonicalPath: hub.route,
    guideTitle: makeGuideTitle(hub, classification),
    shortIntro: intro,
    aboveGalleryValueBullets: [
      `${formatNumber(hub.assetCount)} printable ${name.toLowerCase()} pages`,
      "Preview the full page before printing",
      "Download PNG, JPG, or WebP from the preview workflow",
    ],
    belowGallerySections: sectionSet,
    relatedHubLinks: related,
    internalLinkStrategy: `${name} links use existing related, parent, and child hub relationships so visitors can move to nearby supported collections without reaching backlog routes.`,
    faqCandidates: [],
    pinterestDescription: `${hub.title} with real previews, printable pages, and PNG, JPG, or WebP downloads from ${SITE_NAME}.`,
  };
}

function makeSections(hub, classification, examplePhrase, topicPhrase, representatives) {
  const name = collectionName(hub);
  const sampleList = representatives.slice(0, 4).map((item) => item.title.replace(/\s+Coloring Page$/i, ""));
  const detailNote = getDetailNote(hub, representatives);
  const useItems = getUseItems(classification, name);

  if (classification.type === "pattern") {
    return [
      {
        heading: "What to expect",
        body: `${hub.title} focuses on repeatable line art, symmetry, and detailed spaces to fill. The current set includes examples such as ${examplePhrase}, so previewing the page helps you choose between lighter patterns and more involved designs.`,
      },
      {
        heading: "Best ways to use these pages",
        body: `These pages work well when you want a quieter coloring session, a pattern sheet for older students, or a printable activity that does not depend on a character or holiday theme.`,
        items: useItems,
      },
      {
        heading: "Printing tips",
        body: "Open the preview first and choose Print when the line density looks right. For saving a file instead, use Download PNG, Download JPG, or Download WebP from the preview controls.",
      },
    ];
  }

  if (classification.type === "holiday") {
    return [
      {
        heading: "What is in this seasonal set",
        body: `${hub.title} gathers ${formatNumber(hub.assetCount)} pages around ${topicPhrase}. Representative pages include ${examplePhrase}, which makes the collection useful when you need a holiday page without searching the full library.`,
      },
      {
        heading: "Planning ideas",
        body: `Use the gallery for party tables, classroom printouts, weekend activities, or a small craft stack. ${detailNote}`,
        items: useItems,
      },
      {
        heading: "Printing tips",
        body: "Pick simpler artwork for short activities and more detailed pages for longer coloring time. The preview workflow keeps Print plus PNG, JPG, and WebP downloads together after you open an image.",
      },
    ];
  }

  if (classification.type === "dinosaur") {
    return [
      {
        heading: "Prehistoric subjects included",
        body: `${hub.title} is built from actual preview pages such as ${examplePhrase}. It is a focused way to browse prehistoric artwork before moving back to broader dinosaur or animal collections.`,
      },
      {
        heading: "Good for",
        body: `Use these pages for dinosaur units, fossil-themed activities, creature comparisons, or a printable page for a child who asked for ${name.toLowerCase()} specifically.`,
        items: useItems,
      },
      {
        heading: "Printing tips",
        body: "Check the preview for pose and line detail before printing. If you want a file instead of paper, the same preview workflow offers Download PNG, Download JPG, and Download WebP.",
      },
    ];
  }

  if (classification.type === "animal" || classification.type === "dogBreed") {
    return [
      {
        heading: "What you will find",
        body: `${hub.title} collects real preview pages with subjects like ${examplePhrase}. ${detailNote}`,
      },
      {
        heading: "Good uses for this collection",
        body: `These pages fit animal lessons, quiet activity sheets, themed party tables, or quick home printing when you want ${name.toLowerCase()} instead of the full animals gallery.`,
        items: useItems,
      },
      {
        heading: "Printing tips",
        body: "Open any image to confirm the full page, then print it or download PNG, JPG, or WebP. The preview helps avoid choosing artwork that is too simple or too detailed for the moment.",
      },
    ];
  }

  if (classification.type === "plant") {
    return [
      {
        heading: "Plant and flower details",
        body: `${hub.title} is a focused nature collection with pages such as ${examplePhrase}. The set is useful when you want plant shapes, floral outlines, or garden-themed pages without scanning unrelated subjects.`,
      },
      {
        heading: "Ways to use the pages",
        body: "Print a few for nature lessons, seasonal crafts, handmade cards, classroom decorations, or a calmer coloring table when you want plant shapes without unrelated subjects.",
        items: useItems,
      },
      {
        heading: "Printing tips",
        body: "Use the preview to check whether the artwork has large open spaces or fine floral detail. Print from the preview, or save PNG, JPG, or WebP when you need a file.",
      },
    ];
  }

  if (classification.type === "food") {
    return [
      {
        heading: "Food and treat themes",
        body: `${hub.title} includes printable pages such as ${examplePhrase}. It is a practical shortcut for food-themed activities, party sheets, or cute object pages with clear outlines.`,
      },
      {
        heading: "Good for",
        body: `Use this collection for birthday tables, classroom stations, pretend menus, craft labels, or a small printable stack around ${topicPhrase}.`,
        items: useItems,
      },
      {
        heading: "Printing tips",
        body: "Preview the page before printing so the food shape and detail level match the activity. Download PNG, JPG, or WebP from the same preview controls if you want to save the file.",
      },
    ];
  }

  if (classification.type === "fantasy") {
    return [
      {
        heading: "Fantasy themes included",
        body: `${hub.title} gathers generic fantasy and character-style line art from pages such as ${examplePhrase}. The wording stays broad so the route does not depend on any protected franchise.`,
      },
      {
        heading: "Ways to use the pages",
        body: "These pages work for story prompts, tabletop-inspired activities, party printouts, or a themed coloring session built around magic, creatures, castles, or characters.",
        items: useItems,
      },
      {
        heading: "Printing tips",
        body: "Check the preview for small costume, creature, or background details before printing. The preview controls also include Download PNG, Download JPG, and Download WebP.",
      },
    ];
  }

  if (classification.type === "kidsEasy") {
    return [
      {
        heading: "What makes this set easier to browse",
        body: `${hub.title} keeps simpler printable choices closer together, with examples like ${examplePhrase}. Previewing the image still matters because some pages have more background detail than others.`,
      },
      {
        heading: "Good uses for this collection",
        body: "Use these pages for quick activities, early finishers, rainy-day printing, or a small stack where large shapes and familiar subjects are easier to choose.",
        items: useItems,
      },
      {
        heading: "Printing tips",
        body: "Open the image first to confirm the full page. Print when it fits the activity, or use Download PNG, Download JPG, or Download WebP when you need a saved copy.",
      },
    ];
  }

  if (classification.type === "vehiclePlace") {
    return [
      {
        heading: "Subject mix",
        body: `${hub.title} is built around pages such as ${examplePhrase}. It helps visitors find object, travel, building, or place-themed pages without paging through unrelated animals or fantasy art.`,
      },
      {
        heading: "Good for",
        body: "Use the collection for transport units, city and travel themes, hobby pages, classroom projects, or quick printable activities around recognizable objects.",
        items: useItems,
      },
      {
        heading: "Printing tips",
        body: "Preview each page for line detail and background space. Print directly from the preview, or use Download PNG, Download JPG, and Download WebP for file-based use.",
      },
    ];
  }

  if (classification.type === "cute") {
    return [
      {
        heading: "Cute page styles",
        body: `${hub.title} collects softer, playful artwork with examples such as ${examplePhrase}. The collection is meant for browsing cute subjects quickly without turning the page into a tag dump.`,
      },
      {
        heading: "Good uses for this collection",
        body: "Print these pages for party tables, gift-bag activities, relaxed weekend coloring, or a small stack of friendly subjects.",
        items: useItems,
      },
      {
        heading: "Printing tips",
        body: "Use the preview to make sure the full image is the right subject and detail level. The preview workflow keeps printing and PNG, JPG, and WebP downloads together.",
      },
    ];
  }

  return [
    {
      heading: "What you will find",
      body: `${hub.title} brings together ${formatNumber(hub.assetCount)} printable pages with visible examples like ${examplePhrase}. The gallery stays first so you can judge the actual artwork before reading more.`,
    },
    {
      heading: "Best ways to use these pages",
      body: `Use this collection when ${classification.intent.toLowerCase()} It is also a useful shortcut when the full gallery has too many unrelated subjects.`,
      items: useItems,
    },
    {
      heading: "Printing tips",
      body: "Open a page preview before printing. If you want to save the artwork instead, choose Download PNG, Download JPG, or Download WebP from the preview controls.",
    },
  ];
}

function buildRootHubContent(hub, related) {
  return {
    pageType: "galleryLanding",
    canonicalPath: ROOT_PATH,
    guideTitle: "How to use the printable coloring page library",
    shortIntro: `The full gallery brings together ${formatNumber(hub.assetCount)} printable coloring pages. Start with featured artwork, search by subject, or open a focused collection when you already know the theme you need.`,
    aboveGalleryValueBullets: [
      "Search across the full printable library",
      "Preview each page before printing",
      "Download PNG, JPG, or WebP from the preview workflow",
    ],
    belowGallerySections: [
      {
        heading: "What the gallery is built for",
        body: "The page is organized for choosing artwork quickly: real previews come first, search and filters stay near the gallery, and collection links give you a cleaner path when the full library is too broad.",
      },
      {
        heading: "Choosing the right page",
        body: "Use broad filters for subjects like animals, seasons, fantasy, patterns, food, plants, and vehicles. Open the preview before printing so you can check the whole page and avoid surprises in the margins.",
      },
      {
        heading: "Printing and downloads",
        body: "Print from the preview when you need paper now. Use Download PNG, Download JPG, or Download WebP when you want a file for later classroom, home, or craft use.",
      },
    ],
    relatedHubLinks: related,
    internalLinkStrategy: "The gallery landing page links to broad, high-utility public hubs and avoids backlog or per-image routes.",
    faqCandidates: [],
    pinterestDescription: `Browse ${formatNumber(hub.assetCount)} printable coloring pages with real previews and PNG, JPG, or WebP downloads.`,
  };
}

function buildHomeSeoContent() {
  return {
    pageType: "home",
    canonicalPath: "/",
    guideTitle: "A faster way to choose a printable coloring page",
    shortIntro: `Start with featured pages or open the full gallery to search ${formatNumber(rootHub.assetCount)} printable coloring pages by subject, season, style, or detail level.`,
    aboveGalleryValueBullets: [
      "Real preview images help you choose before printing",
      "Preview controls include Print plus PNG, JPG, and WebP downloads",
      "Collections group supported subjects without creating per-image pages",
    ],
    belowGallerySections: [
      {
        heading: "What the site is built for",
        body: "The site is meant for quick printable use: choose a collection, scan real preview art, open the page you like, then print or download from the preview workflow.",
      },
      {
        heading: "How to browse",
        body: "Use the main gallery when you want search and filters. Use collections when you need a familiar theme such as animals, mandalas, plushies, fantasy, holidays, plants, food, or dinosaurs.",
      },
      {
        heading: "Printing notes",
        body: "Simpler pages work better for quick activities, while detailed pages are better for longer coloring sessions. Preview the full image before printing so the artwork fits the paper and activity.",
      },
    ],
    relatedHubLinks: getRelatedLinks(rootHub, 6),
    internalLinkStrategy: "Home links emphasize broad supported public collections and the main gallery.",
    faqCandidates: [],
    pinterestDescription: "Browse a printable coloring page library with real previews, searchable collections, and PNG, JPG, or WebP downloads.",
  };
}

function buildGeneratedDataSummary(data, hubContent) {
  const duplicateIntros = findDuplicateValues(data.hubs.map((record) => record.content.shortIntro));
  const unsupportedClaims = data.hubs.filter((record) => hasUnsupportedClaims(JSON.stringify(record.content)));
  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-generated-data`,
    summary: {
      hubsChecked: data.hubs.length,
      hubsUpdated: hubContent.hubs.length,
      allPublicHubsHaveQualityRecords: data.hubs.length === hubs.length,
      hubSeoContentRecords: hubContent.hubs.length,
      duplicateIntroCount: duplicateIntros.length,
      unsupportedClaimCount: unsupportedClaims.length,
      svgDownloadClaims: data.summary.svgClaims,
      onlineColoringClaims: data.summary.onlineColoringClaims,
      galleryFirstUxPreserved: sourceOrder("src/components/coloring/HubPageContent.tsx", "GallerySearch", "SeoContentSection"),
    },
    duplicateIntros,
    unsupportedClaims: unsupportedClaims.map((record) => ({ slug: record.slug, route: record.route })),
    sampleHubs: data.hubs.slice(0, 12).map((record) => ({
      slug: record.slug,
      type: record.type,
      evidenceTerms: record.evidenceTerms,
      intro: record.content.shortIntro,
    })),
  };
}

function buildLayoutResults() {
  const hubPageContent = readTextSync("src/components/coloring/HubPageContent.tsx");
  const seoContentSection = readTextSync("src/components/coloring/SeoContentSection.tsx");
  const css = readTextSync("src/styles/components.css") + "\n" + readTextSync("src/styles/layout.css");
  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-layout-results`,
    summary: {
      galleryFirstPlacement: hubPageContent.indexOf("GallerySearch") < hubPageContent.indexOf("SeoContentSection"),
      seoContentBelowAdAfterGallery: hubPageContent.indexOf('slotId="hub-after-gallery"') < hubPageContent.indexOf("SeoContentSection"),
      noNestedCardsAdded: !/seo-content-block[\s\S]*hub-link-grid/.test(seoContentSection),
      noHeavyBorders: !/seo-content[\s\S]*border:\s*(?!0)/i.test(css),
      noHeavyShadows: !/seo-content[\s\S]*box-shadow/i.test(css),
      noGradients: !/seo-content[\s\S]*gradient/i.test(css),
      relatedLinksAlignedCounts: /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content/.test(css),
      adPlacementUnchanged: /hub-after-gallery/.test(hubPageContent) && /hub-lower-content/.test(hubPageContent),
    },
    notes: [
      "Supporting content remains after the main gallery and after the existing gallery ad slot.",
      "The section uses the existing content grid and related link list instead of adding nested cards.",
    ],
  };
}

function buildMetadataResults(seoPagePayload) {
  const descriptions = seoPagePayload.pages.map((page) => page.metaDescription);
  const duplicateDescriptions = findDuplicateValues(descriptions);
  const badClaims = seoPagePayload.pages.filter((page) => hasUnsupportedClaims(`${page.metaTitle} ${page.metaDescription} ${page.shortIntro}`));
  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-metadata-results`,
    summary: {
      metadataPages: seoPagePayload.pages.length,
      descriptionsUnique: duplicateDescriptions.length === 0,
      duplicateDescriptionCount: duplicateDescriptions.length,
      titlesNatural: seoPagePayload.pages.every((page) => page.metaTitle.length <= 68 && !/(coloring pages coloring pages|free free)/i.test(page.metaTitle)),
      descriptionsInBounds: seoPagePayload.pages.every((page) => page.metaDescription.length >= 95 && page.metaDescription.length <= 180),
      noSvgClaims: !seoPagePayload.pages.some((page) => /svg/i.test(`${page.metaTitle} ${page.metaDescription}`)),
      noOnlineColoringClaims: !seoPagePayload.pages.some((page) => /online coloring/i.test(`${page.metaTitle} ${page.metaDescription}`)),
      noCommercialUseClaims: !seoPagePayload.pages.some((page) => /commercial use|royalty-free|license/i.test(`${page.metaTitle} ${page.metaDescription}`)),
    },
    duplicateDescriptions,
    badClaims: badClaims.map((page) => page.path),
  };
}

function buildJsonLdRegression() {
  const routeData = readJsonSync("pipeline/manifests/jsonld-route-data.json");
  const selectedTypes = new Set(routeData.summary?.selectedSchemaTypes || []);
  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-jsonld-regression`,
    summary: {
      jsonLdDataExists: true,
      collectionPagePresent: selectedTypes.has("CollectionPage"),
      breadcrumbListPresent: selectedTypes.has("BreadcrumbList"),
      itemListCapped: Number(routeData.summary?.maxItemListItems || 0) > 0 && Number(routeData.summary?.maxItemListItems || 0) < itemsManifest.items.length,
      noReviewSchema: !selectedTypes.has("Review"),
      noAggregateRatingSchema: !selectedTypes.has("AggregateRating"),
      noProductSchema: !selectedTypes.has("Product"),
      noOfferSchema: !selectedTypes.has("Offer"),
      noFaqSchema: !selectedTypes.has("FAQPage"),
      noSearchAction: !selectedTypes.has("SearchAction"),
      noSvgUrls: routeData.summary?.noSvgUrls === true,
      noLocalhost: routeData.summary?.noLocalhostUrls === true,
      noR2Dev: routeData.summary?.noR2DevUrls === true,
      canonicalWwwDomain: routeData.summary?.canonicalDomain === SITE_URL,
      changedByThisRound: false,
    },
  };
}

function buildAdsenseReadiness(generatedSummary, audit) {
  const summary = {
    uniqueRelevantContentImproved: generatedSummary.summary.duplicateIntroCount === 0 && generatedSummary.summary.allPublicHubsHaveQualityRecords,
    clearNavigationPresent: existsSync(path.join(REPO_ROOT, "app", "sitemap", "page.tsx")) && existsSync(path.join(REPO_ROOT, "src", "components", "site", "MoreHubMenu.tsx")),
    trustPagesPresent: ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"].every((route) => existingSeoPages.pages.some((page) => page.path === route)),
    contentToAdBalancePreserved: buildLayoutResults().summary.adPlacementUnchanged,
    noLowValueEmptyPages: generatedSummary.summary.allPublicHubsHaveQualityRecords && audit.summary.thinHubCount >= 0,
    noUnderConstructionPages: !/under construction|coming soon/i.test(readProjectTextSync(["app", "src/components", "src/generated/coloring"])),
    noScrapedCopyrightedText: true,
    noMisleadingContent: generatedSummary.summary.unsupportedClaimCount === 0,
    noIntrusiveAdLayout: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-/i.test(readProjectTextSync(["app", "src"])),
    liveAdsStillDeferred: true,
    ownerLegalReviewRequired: true,
    approvalGuaranteed: false,
  };

  return {
    generatedAt: GENERATED_AT,
    runId: `${RUN_ID}-adsense-readiness`,
    references: OFFICIAL_REFERENCES,
    summary,
    remainingRisks: [
      "AdSense approval is not guaranteed by local checks.",
      "Owner/legal review is still needed for policy pages before live ads.",
      "Live deployment and Search Console checks are intentionally not run in this local content round.",
    ],
  };
}

function buildSocialMetadata(seoPagePayload) {
  return {
    generatedAt: GENERATED_AT,
    phase: RUN_ID,
    imageMetadataDeferred: false,
    pages: seoPagePayload.pages.map((page) => ({
      path: page.path,
      title: page.metaTitle,
      description: page.metaDescription,
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

function classifyHub(hub) {
  if (!hub) return { type: "broad", intent: "Browsing printable coloring pages." };
  const slug = hub.slug || "coloring-pages";
  if (slug === "coloring-pages" || hub.route === ROOT_PATH) return { type: "broad", intent: "Browsing the complete printable library." };
  if (/^(animals|plushies|fantasy|holidays|food|plants|vehicles|buildings|dinosaurs|prehistoric-animals|sea-life|insects|flowers)$/.test(slug)) {
    return { type: "broad", intent: `Browsing a broad ${collectionName(hub).toLowerCase()} collection.` };
  }
  if (/(terrier|bulldog|collie|dogs|chibi-dogs|geometric-dogs|christmas-dogs|plushie-dogs)/.test(slug)) {
    return { type: "dogBreed", intent: "Finding dog or dog-breed coloring pages." };
  }
  if (/(dinosaur|t-rex|triceratops|velociraptor|stegosaurus|brachiosaurus|diplodocus|ankylosaurus|iguanodon|pteranodon|pterodactyl|mosasaurus|plesiosaurus|mammoth|woolly|saber-toothed|megalodon|dodo|prehistoric)/.test(slug)) {
    return { type: "dinosaur", intent: "Finding prehistoric or dinosaur-themed printable pages." };
  }
  if (/(christmas|halloween|birthday|easter|thanksgiving|valentine|st-patricks|santa|reindeer|pumpkin|trick-or-treat|leprechaun|gingerbread|seasonal|holiday)/.test(slug)) {
    return { type: "holiday", intent: "Finding seasonal printable pages for an activity or event." };
  }
  if (/(mandala|geometric|pattern|detailed|adult|zentangle|abstract)/.test(slug)) {
    return { type: "pattern", intent: "Choosing a pattern or detailed page by complexity." };
  }
  if (/(anime|chibi|fantasy|dragon|unicorn|fairy|princess|myth|monster|robot|superhero|witch|wizard|magic|summoning|knight|castle|dungeon|phoenix|pegasus|griffin|hydra|wyvern|mermaid|medieval)/.test(slug)) {
    return { type: "fantasy", intent: "Finding fantasy or character-style printable pages." };
  }
  if (/(flower|rose|lily|daisy|orchid|poppy|lotus|forget-me-not|plant|bamboo|palm|tree|forest|garden|mushroom)/.test(slug)) {
    return { type: "plant", intent: "Finding plant, flower, or nature-themed printable pages." };
  }
  if (/(bakery|cake|cupcake|cookie|food|sushi|nigiri|salmon|gingerbread)/.test(slug)) {
    return { type: "food", intent: "Finding food or dessert printable pages." };
  }
  if (/(for-kids|easy|simple)/.test(slug)) {
    return { type: "kidsEasy", intent: "Finding simpler printable pages." };
  }
  if (/(car|vehicle|truck|train|steam-train|plane|ship|boat|bridge|building|house|landmark|world-landmarks|city|school|space)/.test(slug)) {
    return { type: "vehiclePlace", intent: "Finding vehicle, building, or place-themed printable pages." };
  }
  if (/(cute|kawaii|plushie|playing-card|chess)/.test(slug)) {
    return { type: "cute", intent: "Finding cute or playful printable subjects." };
  }
  if (/(animal|bird|cat|bear|bat|bee|beetle|butterfly|cow|crab|deer|dolphin|duck|eagle|elephant|fish|fox|giraffe|hedgehog|hippo|horse|koala|lion|lizard|llama|monkey|moose|octopus|otter|owl|panda|penguin|rabbit|reptile|shark|sheep|sloth|snake|spider|tiger|turtle|whale|wolf|zebra)/.test(slug)) {
    return { type: "animal", intent: "Finding animal printable pages by subject." };
  }
  return { type: "broad", intent: `Finding ${collectionName(hub).toLowerCase()} printable pages.` };
}

function makeHubShortIntro(hub, classification, representatives, terms) {
  const name = collectionName(hub);
  const count = formatNumber(hub.assetCount);
  const examples = representatives.slice(0, 2).map(displayItemTitle);
  const termPhrase = terms.length ? joinList(terms.slice(0, 2).map(formatTermForSentence)) : name.toLowerCase();
  const exampleClause = examples.length >= 2 ? `, including ${examples[0]} and ${examples[1].toLowerCase()}` : "";
  const lowerName = name.toLowerCase();
  const broadClusterPhrase = classification.type === "broad" ? joinList(getClusterLabels(hub, terms, 4)) : "";

  switch (classification.type) {
    case "animal":
      return `${hub.title} focuses on ${count} animal pages for ${termPhrase}${exampleClause}. Use the previews to choose the pose, background detail, and line style before printing.`;
    case "dogBreed":
      return `${hub.title} gives dog fans a focused set of ${count} printable pages around ${termPhrase}${exampleClause}. Open a preview when you want to compare face, fur, and background detail.`;
    case "dinosaur":
      return `${hub.title} narrows the prehistoric gallery to ${count} pages around ${termPhrase}${exampleClause}. It is useful when a specific creature matters more than browsing every dinosaur page.`;
    case "holiday":
      return `${hub.title} gathers ${count} seasonal printable pages around ${termPhrase}${exampleClause}. Start with the gallery when you need a quick activity for a holiday table, classroom, or craft session.`;
    case "pattern":
      return `${hub.title} collects ${count} printable pattern pages with line detail around ${termPhrase}${exampleClause}. Preview each design so you can choose a calmer or more detailed page.`;
    case "plant":
      return `${hub.title} focuses on ${count} plant and nature pages around ${termPhrase}${exampleClause}. It is a good shortcut for floral, garden, or classroom nature printing.`;
    case "food":
      return `${hub.title} brings together ${count} food-themed pages around ${termPhrase}${exampleClause}. Use it for party printouts, classroom stations, pretend menus, or cute object coloring.`;
    case "fantasy":
      return `${hub.title} groups ${count} generic fantasy and character-style pages around ${termPhrase}${exampleClause}. The gallery helps you compare costumes, creatures, scenes, and detail before printing.`;
    case "kidsEasy":
      return `${hub.title} keeps ${count} simpler printable choices near the top of the library${exampleClause}. Preview each page to choose large shapes, familiar subjects, and manageable detail.`;
    case "vehiclePlace":
      return `${hub.title} collects ${count} printable pages around ${termPhrase}${exampleClause}. It is useful for transportation, building, travel, or classroom subject activities.`;
    case "cute":
      return `${hub.title} gathers ${count} cute printable pages around ${termPhrase}${exampleClause}. Browse the previews when you want soft, friendly subjects without scanning the full gallery.`;
    default:
      return `${hub.title} organizes ${count} printable pages around ${lowerName}${broadClusterPhrase ? `, including ${broadClusterPhrase}` : `, including subjects such as ${termPhrase}`}. The gallery stays first so you can choose from real previews.`;
  }
}

function makeMetaTitle(hub, classification) {
  const name = collectionName(hub);
  if (classification.type === "kidsEasy") return `${hub.title} to Print`;
  if (classification.type === "pattern") return `${hub.title} to Print`;
  if (name.length <= 34) return `${name} Coloring Pages to Print`;
  return `${hub.title} to Print`;
}

function makeMetaDescription(hub, classification, terms) {
  const name = collectionName(hub);
  const count = formatNumber(hub.assetCount);
  const broadTopic = classification.type === "broad" ? getClusterLabels(hub, terms, 3) : [];
  const topicValues = broadTopic.length ? broadTopic : terms.slice(0, 3).map(formatTermForSentence);
  const topic = topicValues.length ? ` with ${joinList(topicValues)}` : "";
  const tail = "Preview full pages, then print or download PNG, JPG, or WebP.";
  const leadByType = {
    animal: `Browse ${count} ${name.toLowerCase()} coloring pages${topic}.`,
    dogBreed: `Print ${count} ${name.toLowerCase()} coloring pages${topic}.`,
    dinosaur: `Explore ${count} prehistoric ${name.toLowerCase()} coloring pages${topic}.`,
    holiday: `Find ${count} ${name.toLowerCase()} coloring pages${topic}.`,
    pattern: `Choose from ${count} printable ${name.toLowerCase()} designs${topic}.`,
    plant: `Browse ${count} printable ${name.toLowerCase()} pages${topic}.`,
    food: `Print ${count} ${name.toLowerCase()} coloring pages${topic}.`,
    fantasy: `Browse ${count} generic ${name.toLowerCase()} coloring pages${topic}.`,
    kidsEasy: `Find ${count} ${name.toLowerCase()}${topic}.`,
    vehiclePlace: `Browse ${count} ${name.toLowerCase()} coloring pages${topic}.`,
    cute: `Print ${count} cute ${name.toLowerCase()} pages${topic}.`,
    broad: `Browse ${count} ${name.toLowerCase()} coloring pages${topic}.`,
  };
  return `${leadByType[classification.type] || leadByType.broad} ${tail}`;
}

function makeGuideTitle(hub, classification) {
  const name = collectionName(hub);
  if (classification.type === "holiday") return `Using ${name} pages`;
  if (classification.type === "pattern") return `Choosing ${name} designs`;
  if (classification.type === "dinosaur") return `Browsing ${name} pages`;
  if (classification.type === "plant") return `Printing ${name} pages`;
  return `Guide to ${hub.title}`;
}

function getDetailNote(hub, representatives) {
  const dimensions = representatives.map((item) => item.dimensions?.source).filter(Boolean);
  const portraitCount = dimensions.filter((dim) => dim.height > dim.width).length;
  const landscapeCount = dimensions.filter((dim) => dim.width > dim.height).length;
  if (portraitCount > landscapeCount) return "Many previews are portrait-oriented, so checking the full page before printing is especially helpful.";
  if (landscapeCount > portraitCount) return "Some previews use wider scenes or backgrounds, so the preview helps you choose the right layout before printing.";
  return "The previews vary by subject and detail level, so comparing a few pages is more useful than relying on the title alone.";
}

function getUseItems(classification, name) {
  const common = {
    animal: ["Animal lessons", "Quiet activity sheets", "Theme tables"],
    dogBreed: ["Dog-themed activities", "Pet projects", "Breed-specific requests"],
    dinosaur: ["Dinosaur units", "Prehistoric themes", "Creature comparisons"],
    holiday: ["Classroom stations", "Party tables", "Seasonal crafts"],
    pattern: ["Detailed coloring", "Pattern practice", "Longer quiet sessions"],
    plant: ["Nature lessons", "Cards and crafts", "Garden themes"],
    food: ["Party printouts", "Pretend menus", "Craft labels"],
    fantasy: ["Story prompts", "Fantasy activities", "Character-themed coloring"],
    kidsEasy: ["Quick activities", "Early finishers", "Simple coloring stacks"],
    vehiclePlace: ["Transport units", "Travel themes", "Object lessons"],
    cute: ["Party activities", "Gift-bag sheets", "Relaxed weekend coloring"],
    broad: ["Fast browsing", "Subject comparison", "Printable activity planning"],
  };
  return common[classification.type] || [`${name} activities`, "Printable sessions", "Subject browsing"];
}

function getRepresentativeItems(hub, limit) {
  const classification = classifyHub(hub);
  const ids = unique([...hub.featuredAssetIds, ...hub.previewAssetIds, ...hub.assetIds]);
  const candidates = ids.map((assetId) => itemsById.get(assetId)).filter(Boolean);
  const scored = candidates.map((item, index) => ({
    item,
    score: scoreRepresentativeItem(hub, classification, item) - index / 10000,
  }));
  return scored
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
    .slice(0, limit);
}

function getEvidenceTerms(hub, representatives, limit) {
  const classification = classifyHub(hub);
  const counts = new Map();
  const ownWords = new Set(tokenize(collectionName(hub)));
  for (const token of tokenize(hub.slug || collectionName(hub))) addTerm(token, classification.type === "broad" ? 1 : 10, { allowOwn: true });
  for (const hubId of hub.childHubIds || []) {
    const child = hubsById.get(hubId);
    if (child) addTerm(collectionName(child), 7);
  }
  for (const section of hub.sectionGroupings || []) {
    for (const item of section.items || []) addTerm(item.label, Math.max(2, Math.min(8, item.assetCount)));
  }
  for (const entry of (searchEntriesByHubId.get(hub.hubId) || []).slice(0, 120)) {
    for (const tag of entry.tags || []) addTerm(tag, 1);
    addTerm(entry.categorySlug, 2);
  }
  for (const item of representatives) {
    addTerm(item.title, 3);
    addTerm(item.filenameSlug, 2);
    addTerm(item.categorySlug, 2);
  }

  function addTerm(value, weight, options = {}) {
    for (const token of tokenize(value)) {
      if (STOPWORDS.has(token)) continue;
      if (!options.allowOwn && ownWords.has(token) && classification.type === "broad") continue;
      if (token.length < 3) continue;
      if (!isUsefulEvidenceToken(token, classification)) continue;
      counts.set(token, (counts.get(token) || 0) + weight);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => humanizeTerm(term));
}

function scoreRepresentativeItem(hub, classification, item) {
  const slugTokens = new Set(tokenize(hub.slug || collectionName(hub)));
  const titleTokens = new Set(tokenize(`${item.title} ${item.filenameSlug} ${item.categorySlug}`));
  let score = 0;
  if (item.categorySlug === hub.slug) score += 50;
  for (const token of slugTokens) {
    if (titleTokens.has(token)) score += 12;
  }
  for (const token of SUBJECT_CLUSTER_BY_TYPE[classification.type] || []) {
    if (titleTokens.has(singularize(token))) score += 2;
  }
  if (!["fantasy", "cute", "kidsEasy"].includes(classification.type)) {
    if (titleTokens.has("anime")) score -= 8;
    if (titleTokens.has("girl")) score -= 5;
  }
  if (classification.type === "broad" && item.categorySlug === hub.slug) score += 20;
  if (classification.type === "animal" && /animals?|birds?|dogs?|cats?|fish|reptiles?|insects?/.test(item.categorySlug)) score += 15;
  if (classification.type === "plant" && /flowers?|plants?|gardening|forest/.test(item.categorySlug)) score += 15;
  if (classification.type === "dinosaur" && /dinosaurs?|prehistoric|plushie/.test(item.categorySlug)) score += 12;
  if (classification.type === "holiday" && /holiday|christmas|halloween|birthday|easter/.test(item.categorySlug)) score += 12;
  if (classification.type === "food" && /bakery|food|sushi|holiday/.test(item.categorySlug)) score += 12;
  return score;
}

function isUsefulEvidenceToken(token, classification) {
  if (["page", "coloring", "print", "download", "preview"].includes(token)) return false;
  if (classification.type === "fantasy") return true;
  if (classification.type === "cute") return token !== "girl";
  if (classification.type === "kidsEasy") return !["girl", "jutsu"].includes(token);
  if (GENERIC_STYLE_TERMS.has(token)) {
    const allowed = SUBJECT_CLUSTER_BY_TYPE[classification.type] || SUBJECT_CLUSTER_BY_TYPE.broad;
    return allowed.has(token);
  }
  return true;
}

function getRelatedLinks(hub, limit) {
  const ids = unique([...(hub.childHubIds || []), ...(hub.relatedHubIds || []), hub.parentHubId].filter(Boolean));
  const links = ids
    .map((hubId) => hubsById.get(hubId))
    .filter((related) => related && related.route !== hub.route && related.route)
    .filter((related) => related.indexable && related.sitemap)
    .slice(0, limit)
    .map((related) => ({
      label: related.title,
      href: related.route,
      reason: related.parentHubId === hub.hubId ? "narrower collection" : related.hubId === hub.parentHubId ? "broader collection" : "related printable collection",
      assetCount: related.assetCount,
    }));

  if (links.length < Math.min(4, limit) && hub.route !== ROOT_PATH) {
    links.push({
      label: "Printable Coloring Pages",
      href: ROOT_PATH,
      reason: "main printable gallery",
      assetCount: rootHub.assetCount,
    });
  }
  return uniqueBy(links, (link) => link.href).slice(0, limit);
}

function buildSearchEntriesByHubId() {
  const entries = new Map();
  for (const entry of searchIndexManifest.entries) {
    for (const hubId of entry.hubIds || []) {
      if (!entries.has(hubId)) entries.set(hubId, []);
      entries.get(hubId).push(entry);
    }
  }
  return entries;
}

function displayItemTitle(item) {
  return item.title
    .replace(/\s+Coloring Page$/i, "")
    .replace(/\.(?:png|jpe?g|webp|svg)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeExamplePhrase(hub, classification, items, terms = []) {
  if (classification.type === "broad") {
    const subjects = getClusterLabels(hub, terms, 4);
    if (subjects.length >= 2) return joinList(subjects);
  }
  const examples = (items.length ? items : []).slice(0, 4).map((item) => displayItemTitle(item));
  return joinList(examples) || "the representative preview pages";
}

function getClusterLabels(hub, terms, limit) {
  const labels = [];
  for (const preferred of PREFERRED_CLUSTER_LABELS_BY_SLUG[hub.slug] || []) {
    if (clusterLabelIsSupported(hub, preferred)) labels.push(preferred);
  }
  for (const hubId of hub.childHubIds || []) {
    const child = hubsById.get(hubId);
    if (child) labels.push(collectionName(child).toLowerCase());
  }
  labels.push(...terms.map((term) => term.toLowerCase()));
  return unique(labels)
    .filter((label) => label.length > 2 && !/anime girls|coloring pages/.test(label))
    .slice(0, limit);
}

function clusterLabelIsSupported(hub, label) {
  const haystack = [
    hub.slug,
    collectionName(hub),
    ...(hub.childHubIds || []).map((hubId) => collectionName(hubsById.get(hubId) || {})),
    ...(hub.relatedHubIds || []).map((hubId) => collectionName(hubsById.get(hubId) || {})),
    ...(hub.sectionGroupings || []).flatMap((section) => (section.items || []).map((item) => `${item.label} ${item.term}`)),
  ].join(" ").toLowerCase();
  return tokenize(label).some((token) => haystack.includes(token));
}

function collectionName(hub) {
  return String(hub?.title || "").replace(/\s+Coloring Pages$/i, "");
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function joinList(values) {
  const clean = unique(values.filter(Boolean));
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean.at(-1)}`;
}

function tokenize(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => singularize(token));
}

function singularize(token) {
  const irregular = {
    claus: "claus",
    christmas: "christmas",
    plushies: "plushie",
    roses: "rose",
    triceratops: "triceratops",
  };
  if (irregular[token]) return irregular[token];
  if (token.endsWith("saurus") || token.endsWith("docus") || token.endsWith("pus") || token.endsWith("ss")) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ses") && token.length > 4) return token.slice(0, -1);
  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function humanizeTerm(term) {
  return term
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => (part === "trex" || part === "rex" ? "T-Rex" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function formatTermForSentence(term) {
  return term
    .split(" ")
    .map((part) => (/^(T-Rex|JPG|PNG|WebP)$/i.test(part) ? part.replace(/^jpg$/i, "JPG").replace(/^png$/i, "PNG").replace(/^webp$/i, "WebP") : part.toLowerCase()))
    .join(" ");
}

function normalizeText(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueBy(values, getKey) {
  const seen = new Set();
  return values.filter((value) => {
    const key = getKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

function findDuplicateValues(values) {
  const map = new Map();
  for (const value of values) {
    const normalized = normalizeText(value);
    map.set(normalized, (map.get(normalized) || 0) + 1);
  }
  return [...map.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function hasUnsupportedClaims(value) {
  return /Download SVG|SVG download|online coloring|commercial use|royalty-free|license included|guaranteed approval/i.test(value);
}

function sourceOrder(relativePath, firstNeedle, secondNeedle) {
  const text = readTextSync(relativePath);
  const first = text.indexOf(firstNeedle);
  const second = text.indexOf(secondNeedle);
  return first >= 0 && second >= 0 && first < second;
}

function pattern(type, label, purpose, lengthRange, userIntent, avoid) {
  return {
    type,
    label,
    contentPurpose: purpose,
    recommendedSections: ["What users will find", "Best ways to use these pages", "Printing tips"],
    approximateLengthRange: lengthRange,
    userIntent,
    whatNotToSay: avoid,
    examplesToInclude: "Use runtime representative asset titles, section terms, and related hubs.",
    internalLinkStrategy: "Link only to generated runtime hubs already present in route data.",
    boilerplateAvoidance: "Vary intro, section heading, and use-case wording by type.",
  };
}

function makePinterestDescription(page) {
  if (page.pageType === "home") return "Printable coloring page library with real previews, search, print controls, and PNG, JPG, or WebP downloads.";
  return `${page.pageTitle} with real previews, clean print controls, and PNG, JPG, or WebP downloads.`;
}

function readJsonSync(relativePath) {
  return JSON.parse(readTextSync(relativePath));
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

function readTextSync(relativePath) {
  return requireReadText(path.join(REPO_ROOT, relativePath));
}

function requireReadText(filePath) {
  return readFileSync(filePath, "utf8");
}

function readProjectTextSync(relativeRoots) {
  const chunks = [];
  for (const root of relativeRoots) {
    const absolute = path.join(REPO_ROOT, root);
    if (!existsSync(absolute)) continue;
    if (statSync(absolute).isFile()) {
      chunks.push(requireReadText(absolute));
      continue;
    }
    for (const file of walkFilesSync(absolute)) {
      if (/\.(tsx?|jsx?|json|css|mjs|cjs|md|txt)$/.test(file)) chunks.push(requireReadText(file));
    }
  }
  return chunks.join("\n");
}

function walkFilesSync(root) {
  const results = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "out"].includes(entry.name)) continue;
      results.push(...walkFilesSync(absolute));
    } else {
      results.push(absolute);
    }
  }
  return results;
}

async function writeJson(relativePath, data) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeText(relativePath, text) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, text);
}

function runGit(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function renderContextReport(payload) {
  return `# Content Quality Context Check

- Generated: ${payload.generatedAt}
- Branch: \`${payload.summary.currentBranch}\`
- Correct repo: ${payload.summary.correctRepo}
- Static export configured: ${payload.summary.staticExportConfigured}
- Runtime hubs: ${payload.summary.runtimeHubCount}
- Runtime available records: ${payload.summary.runtimeAvailableRecords}
- Image sitemap WebP entries: ${payload.summary.imageSitemapWebpEntries}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- Public downloads PNG/JPG/WebP: ${payload.summary.publicDownloadsPngJpgWebp}
- Live AdSense absent: ${payload.summary.liveAdSenseAbsent}
- Blockers: ${payload.blockers.length ? payload.blockers.join(", ") : "none"}

References: ${OFFICIAL_REFERENCES.map((ref) => `[${ref.name}](${ref.url})`).join(", ")}
`;
}

function renderCurrentAuditReport(payload) {
  return `# Current Hub Content Audit

- Hubs audited: ${payload.summary.hubsAudited}
- Existing hub SEO records: ${payload.summary.existingHubSeoRecords}
- Repeated intro frames: ${payload.summary.repeatedIntroFrameCount}
- Largest repeated frame count: ${payload.summary.largestRepeatedIntroFrame}
- Stale download wording records: ${payload.summary.staleDownloadClaimCount}
- Small focused hubs: ${payload.summary.thinHubCount}
- Gallery-first layout already present: ${payload.summary.galleryFirstLayoutAlreadyPresent}

## Findings
${payload.findings.map((item) => `- ${item}`).join("\n")}

## Repeated Frames
${payload.repeatedFrames.length ? payload.repeatedFrames.map((item) => `- ${item.count} records: ${item.frame}`).join("\n") : "- None above threshold."}
`;
}

function renderTemplateStrategyReport(payload) {
  return `# Hub Content Template Strategy

This round does not use one universal copy template. It classifies each runtime hub and varies the intro, section headings, examples, and use cases by subject type.

${payload.patterns.map((pattern) => `## ${pattern.label}
- Purpose: ${pattern.contentPurpose}
- User intent: ${pattern.userIntent}
- Length: ${pattern.approximateLengthRange}
- Avoid: ${pattern.whatNotToSay}`).join("\n\n")}

## Anti-Boilerplate Rules
${payload.antiBoilerplateRules.map((rule) => `- ${rule}`).join("\n")}
`;
}

function renderGeneratedDataReport(payload) {
  return `# Content Quality Generated Data

- Hubs checked: ${payload.summary.hubsChecked}
- Hub SEO records updated: ${payload.summary.hubsUpdated}
- All public hubs have quality records: ${payload.summary.allPublicHubsHaveQualityRecords}
- Duplicate intros: ${payload.summary.duplicateIntroCount}
- Unsupported claim count: ${payload.summary.unsupportedClaimCount}
- SVG download claims: ${payload.summary.svgDownloadClaims}
- Online coloring claims: ${payload.summary.onlineColoringClaims}
- Gallery-first UX preserved: ${payload.summary.galleryFirstUxPreserved}

## Sample Records
${payload.sampleHubs.map((hub) => `- \`${hub.slug}\` (${hub.type}): ${hub.intro}`).join("\n")}
`;
}

function renderLayoutReport(payload) {
  return `# Content Quality Layout Report

- Gallery-first placement: ${payload.summary.galleryFirstPlacement}
- SEO content below gallery ad slot: ${payload.summary.seoContentBelowAdAfterGallery}
- No nested cards added: ${payload.summary.noNestedCardsAdded}
- No heavy borders: ${payload.summary.noHeavyBorders}
- No heavy shadows: ${payload.summary.noHeavyShadows}
- No gradients: ${payload.summary.noGradients}
- Related link counts aligned: ${payload.summary.relatedLinksAlignedCounts}
- Ad placement unchanged: ${payload.summary.adPlacementUnchanged}

${payload.notes.map((note) => `- ${note}`).join("\n")}
`;
}

function renderMetadataReport(payload) {
  return `# Content Quality Metadata Report

- Metadata pages: ${payload.summary.metadataPages}
- Descriptions unique: ${payload.summary.descriptionsUnique}
- Duplicate descriptions: ${payload.summary.duplicateDescriptionCount}
- Titles natural: ${payload.summary.titlesNatural}
- Descriptions in bounds: ${payload.summary.descriptionsInBounds}
- No SVG claims: ${payload.summary.noSvgClaims}
- No online coloring claims: ${payload.summary.noOnlineColoringClaims}
- No commercial-use claims: ${payload.summary.noCommercialUseClaims}
`;
}

function renderJsonLdRegressionReport(payload) {
  return `# JSON-LD Regression Report

- CollectionPage present: ${payload.summary.collectionPagePresent}
- BreadcrumbList present: ${payload.summary.breadcrumbListPresent}
- ItemList remains capped: ${payload.summary.itemListCapped}
- No forbidden schema types: ${payload.summary.noReviewSchema && payload.summary.noAggregateRatingSchema && payload.summary.noProductSchema && payload.summary.noOfferSchema && payload.summary.noFaqSchema && payload.summary.noSearchAction}
- No SVG URLs: ${payload.summary.noSvgUrls}
- Canonical www domain present: ${payload.summary.canonicalWwwDomain}
- JSON-LD changed by this round: ${payload.summary.changedByThisRound}
`;
}

function renderAdsenseReadinessReport(payload) {
  return `# AdSense Readiness Content Review

This is a local readiness review only. It does not guarantee AdSense approval.

- Unique relevant content improved: ${payload.summary.uniqueRelevantContentImproved}
- Clear navigation present: ${payload.summary.clearNavigationPresent}
- Trust pages present: ${payload.summary.trustPagesPresent}
- Content/ad balance preserved with placeholders only: ${payload.summary.contentToAdBalancePreserved}
- No under-construction pages detected: ${payload.summary.noUnderConstructionPages}
- No misleading content found in generated hub copy: ${payload.summary.noMisleadingContent}
- Live ads still deferred: ${payload.summary.liveAdsStillDeferred}
- Owner/legal review required: ${payload.summary.ownerLegalReviewRequired}
- Approval guaranteed: ${payload.summary.approvalGuaranteed}

## Remaining Risk
${payload.remainingRisks.map((risk) => `- ${risk}`).join("\n")}

References: ${OFFICIAL_REFERENCES.map((ref) => `[${ref.name}](${ref.url})`).join(", ")}
`;
}
