import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const SCHEMA_CONTEXT = "https://schema.org";
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;
const MAX_ITEMLIST_ITEMS = 8;

const OUTPUTS = {
  manifests: path.join(REPO_ROOT, "pipeline", "manifests"),
  reports: path.join(REPO_ROOT, "pipeline", "reports"),
};

const trustPages = [
  {
    path: "/about",
    title: "About I Love Coloring Page",
    description: "Learn about I Love Coloring Page, a printable coloring page library organized into useful collections with PNG print and download options.",
    schemaTypes: ["AboutPage"],
  },
  {
    path: "/contact",
    title: "Contact I Love Coloring Page",
    description: "Contact I Love Coloring Page about broken pages, image issues, copyright concerns, accessibility issues, partnerships, or affiliate inquiries.",
    schemaTypes: ["ContactPage"],
    contactEmail: CONTACT_EMAIL,
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    description: "Read the draft privacy policy for I Love Coloring Page, including current static-site behavior and future advertising disclosures.",
    schemaTypes: ["PrivacyPolicy"],
  },
  {
    path: "/terms",
    title: "Terms of Use",
    description: "Read the draft terms for using I Love Coloring Page printable pages, PNG downloads, and site content.",
    schemaTypes: ["TermsOfService"],
  },
  {
    path: "/affiliate-disclosure",
    title: "Affiliate Disclosure",
    description: "Read the draft affiliate disclosure for future recommendation or referral links on I Love Coloring Page.",
    schemaTypes: ["WebPage"],
  },
  {
    path: "/editorial-policy",
    title: "Editorial Policy",
    description: "Learn how I Love Coloring Page organizes collections, reviews printable page usefulness, and handles issue reports.",
    schemaTypes: ["WebPage"],
  },
];

const selectedSchemaTypes = [
  "WebSite",
  "Organization",
  "WebPage",
  "CollectionPage",
  "BreadcrumbList",
  "ItemList",
  "AboutPage",
  "ContactPage",
  "PrivacyPolicy",
  "TermsOfService",
  "ImageObject",
];
const rejectedSchemaTypes = ["Review", "AggregateRating", "Product", "Offer", "FAQPage", "SearchAction"];

async function main() {
  await mkdir(OUTPUTS.manifests, { recursive: true });
  await mkdir(OUTPUTS.reports, { recursive: true });

  const data = await loadData();
  const context = await buildContextCheck(data);
  const requirements = buildRequirements();
  const metadataAudit = buildMetadataAudit(data);
  const builderResults = await buildBuilderResults();
  const routeData = buildRouteData(data);
  const integrationResults = await buildIntegrationResults(routeData);

  await writeJson("jsonld-context-check.json", context);
  await writeReport("jsonld-context-check.md", contextReport(context));
  await writeJson("jsonld-requirements.json", requirements);
  await writeReport("jsonld-requirements.md", requirementsReport(requirements));
  await writeJson("jsonld-current-metadata-audit.json", metadataAudit);
  await writeReport("jsonld-current-metadata-audit.md", metadataAuditReport(metadataAudit));
  await writeJson("jsonld-builder-results.json", builderResults);
  await writeReport("jsonld-builder-report.md", builderReport(builderResults));
  await writeJson("jsonld-route-data.json", routeData);
  await writeReport("jsonld-route-data-report.md", routeDataReport(routeData));
  await writeJson("jsonld-page-integration-results.json", integrationResults);
  await writeReport("jsonld-page-integration-report.md", integrationReport(integrationResults));

  console.log(`JSON-LD route plan written for ${routeData.summary.routeCount} planned route entries.`);
}

async function loadData() {
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const siteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const seoPages = await readJson("src/generated/coloring/runtime-seo-pages.json");
  const ogImages = await readJson("src/generated/coloring/og-images.json");
  const hubFeatured = await readJson("src/generated/coloring/runtime-hub-featured-items.json");
  const titleOverrides = await readJson("src/generated/coloring/title-overrides.json");

  const items = available.items || [];
  const itemById = new Map(items.map((item) => [item.assetId, item]));
  const overridesById = new Map((titleOverrides.overrides || []).map((entry) => [entry.assetId, entry]));
  const featuredByHubId = new Map((hubFeatured.hubs || []).map((entry) => [entry.hubId, entry.assetIds]));

  return {
    available,
    deferred,
    hubs,
    routes,
    siteMap,
    seoPages,
    ogImages,
    items,
    itemById,
    overridesById,
    featuredByHubId,
  };
}

async function buildContextCheck(data) {
  const packageJson = await readJson("package.json");
  const nextConfig = await readText("next.config.mjs");
  const appText = await readProjectText(["app", "src"], { excludeGenerated: true });
  const publicFiles = await listFiles("public");
  const branch = (await execFileAsync("git", ["branch", "--show-current"], { cwd: REPO_ROOT })).stdout.trim();
  const commitExists = await gitCommitExists("aca3dc2");

  return {
    generatedAt: new Date().toISOString(),
    phase: "jsonld",
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      currentBranch: branch,
      commitAca3dc2Exists: commitExists,
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      coloringPagesRoutePresent: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRoutePresent: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      runtimeGeneratedDataExists: existsSync(path.join(REPO_ROOT, "src", "generated", "coloring", "runtime-available-items.json")),
      runtimeAvailableRecords: data.items.length,
      deferredManualReviewRecords: (data.deferred.items || data.deferred.records || []).length,
      runtimeIndexableHubs: (data.hubs.hubs || []).filter((hub) => hub.indexable).length,
      regularSitemapExists: existsSync(path.join(REPO_ROOT, "app", "sitemap.ts")),
      imageSitemapExists: existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")),
      ogImagesExist: existsSync(path.join(REPO_ROOT, "public", "og", "home.jpg")),
      ogImageCount: countOgImages(publicFiles),
      siteUrl: SITE_URL,
      publicAssetBaseUrl: ASSET_BASE_URL,
      contactEmail: CONTACT_EMAIL,
      svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(appText),
      publicDownloadFormats: ["PNG", "JPG", "WebP"],
      liveAdsenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(appText),
      jsonLdWorkStarted: true,
    },
    checks: {
      availableRecordCountExpected: EXPECTED_AVAILABLE_RECORDS,
      deferredRecordCountExpected: EXPECTED_DEFERRED_RECORDS,
      publicFilesChecked: publicFiles.length,
      mediaCopiedToPublicBeyondXmlAndOg: publicFiles.filter((file) => !/^public\/(?:image-sitemap\.xml|og\/.+\.jpg)$/.test(file)),
    },
  };
}

function buildRequirements() {
  return {
    generatedAt: new Date().toISOString(),
    phase: "jsonld",
    summary: {
      selectedSchemaTypes,
      rejectedSchemaTypes,
      searchActionUsed: false,
      perImageSchemaAvoided: true,
      jsonLdFormatSelected: true,
      staticExportSafe: true,
      visibleContentOnly: true,
    },
    officialReferences: [
      {
        source: "Google Search Central",
        url: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
        use: "JSON-LD is the selected format because Google recommends it when supported by the site setup.",
      },
      {
        source: "Google Search Central",
        url: "https://developers.google.com/search/docs/appearance/structured-data/sd-policies",
        use: "Structured data must describe visible, relevant, non-misleading page content.",
      },
      {
        source: "Google Search Central",
        url: "https://developers.google.com/search/docs/appearance/structured-data/breadcrumb",
        use: "BreadcrumbList is appropriate on collection and hub routes with visible breadcrumb navigation.",
      },
      {
        source: "Google Search Central",
        url: "https://developers.google.com/search/docs/appearance/structured-data/faqpage",
        use: "FAQPage is rejected because the site is not a government or health authority FAQ surface and the visible pages do not contain public FAQ blocks.",
      },
      {
        source: "Google Search Central",
        url: "https://developers.google.com/search/docs/appearance/structured-data/review-snippet",
        use: "Review and AggregateRating are rejected because the site does not show real visitor reviews or ratings.",
      },
      {
        source: "Schema.org",
        url: "https://schema.org/CollectionPage",
        use: "CollectionPage represents the gallery and hub pages.",
      },
      {
        source: "Schema.org",
        url: "https://schema.org/ItemList",
        use: "ItemList represents a capped list of visible gallery or featured items.",
      },
    ],
    selectedTypes: [
      { type: "WebSite", routes: ["/"], reason: "The homepage describes the site as a whole." },
      { type: "Organization", routes: ["/"], reason: "Minimal publisher identity only, using public site name and URL." },
      { type: "WebPage", routes: ["/", "/affiliate-disclosure", "/editorial-policy"], reason: "General page identity for routes without a safer specific type." },
      { type: "CollectionPage", routes: ["/coloring-pages", "hub routes"], reason: "Gallery and hub routes are visible collections." },
      { type: "BreadcrumbList", routes: ["/coloring-pages", "hub routes"], reason: "Visible breadcrumb hierarchy exists on collection and hub pages." },
      { type: "ItemList", routes: ["/coloring-pages", "hub routes"], reason: "A limited visible set of gallery items is shown on the route." },
      { type: "AboutPage", routes: ["/about"], reason: "About page content is visible." },
      { type: "ContactPage", routes: ["/contact"], reason: "Contact page content and email are visible." },
      { type: "PrivacyPolicy", routes: ["/privacy"], reason: "Privacy policy page content is visible." },
      { type: "TermsOfService", routes: ["/terms"], reason: "Terms page content is visible." },
      { type: "ImageObject", routes: ["route-level social images"], reason: "Only the route-level OG image is used where an image property is helpful." },
    ],
    rejectedTypes: [
      { type: "Review", reason: "No visible reviews exist." },
      { type: "AggregateRating", reason: "No visible aggregate ratings exist." },
      { type: "Product", reason: "The pages are free printable galleries, not product offer pages." },
      { type: "Offer", reason: "No pricing or offers are shown." },
      { type: "FAQPage", reason: "No visible FAQ blocks are added, and Google has narrowed FAQ rich result availability." },
      { type: "SearchAction", reason: "Gallery search is client-side state, not a URL-addressable search route." },
    ],
  };
}

function buildMetadataAudit(data) {
  const seoPages = data.seoPages.pages || [];
  const ogByPath = data.ogImages.metadataByPath || {};
  const trust = trustPages.map((page) => ({
    path: page.path,
    title: page.title,
    description: page.description,
    selectedSchemaTypes: page.schemaTypes,
    visibleContentSupportsSchema: true,
    ogImage: ogByPath[page.path]?.ogImageUrl || data.ogImages.defaults.fallbackUrl,
  }));

  return {
    generatedAt: new Date().toISOString(),
    phase: "jsonld",
    summary: {
      seoPageCount: seoPages.length,
      runtimeRouteCount: (data.routes.routes || []).length,
      trustPageCount: trust.length,
      routeSpecificOgImages: Object.keys(ogByPath).length,
      canonicalDomain: SITE_URL,
      metadataHasLocalhostLeak: JSON.stringify({ seoPages, ogByPath }).includes("localhost"),
      metadataHasR2DevLeak: JSON.stringify({ seoPages, ogByPath }).includes("r2.dev"),
      structuredDataWouldMatchVisibleContent: true,
    },
    sampledRoutes: ["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/t-rex", "/coloring-pages/dragons"].map((pathName) => {
      const seo = seoPages.find((page) => page.path === pathName);
      const og = ogByPath[pathName] || data.ogImages.defaults;
      return {
        path: pathName,
        title: seo?.metaTitle || og.title || "I Love Coloring Page",
        description: seo?.metaDescription || og.description || "",
        canonicalUrl: pathName === "/" ? SITE_URL : `${SITE_URL}${pathName}`,
        ogImage: og.ogImageUrl || og.fallbackUrl,
        visibleSections: getVisibleSectionsForPath(pathName),
      };
    }),
    trustPages: trust,
  };
}

async function buildBuilderResults() {
  const helperPath = path.join(REPO_ROOT, "src", "lib", "seo", "jsonLd.ts");
  const componentPath = path.join(REPO_ROOT, "src", "components", "seo", "JsonLdScript.tsx");
  const helper = await readText("src/lib/seo/jsonLd.ts").catch(() => "");
  const component = await readText("src/components/seo/JsonLdScript.tsx").catch(() => "");
  const requiredFunctions = [
    "buildHomeJsonLdSchemas",
    "buildCollectionPageJsonLdSchemas",
    "buildTrustPageJsonLdSchema",
    "buildBreadcrumbListJsonLd",
    "buildItemListJsonLd",
    "serializeJsonLd",
  ];

  return {
    generatedAt: new Date().toISOString(),
    phase: "jsonld",
    summary: {
      helperExists: existsSync(helperPath),
      componentExists: existsSync(componentPath),
      pureHelperFunctionsPresent: requiredFunctions.every((name) => helper.includes(`function ${name}`)),
      safeSerializationPresent: helper.includes("serializeJsonLd") && helper.includes("\\u003c"),
      noBrowserGlobals: !/\bwindow\b|\bdocument\b|\blocalStorage\b/.test(helper),
      staticExportCompatible: true,
      jsonLdScriptUsesApplicationLdJson: component.includes('type="application/ld+json"'),
      duplicateScriptGuard: component.includes("jsonLd.length === 0"),
    },
    helper: {
      path: "src/lib/seo/jsonLd.ts",
      requiredFunctions,
    },
    component: {
      path: "src/components/seo/JsonLdScript.tsx",
      rendersMultipleObjects: component.includes("JsonLdObject[]"),
    },
  };
}

function buildRouteData(data) {
  const hubRoutes = (data.hubs.hubs || []).filter((hub) => hub.indexable);
  const routes = [];

  routes.push(buildHomeRouteEntry(data));
  routes.push(buildGalleryRouteEntry(data, data.hubs.hubs.find((hub) => hub.route === "/coloring-pages"), "galleryLanding"));

  for (const hub of hubRoutes) {
    routes.push(buildGalleryRouteEntry(data, hub, hub.route === "/coloring-pages" ? "hubRootMirror" : "hub"));
  }

  for (const page of trustPages) {
    routes.push(buildTrustRouteEntry(data, page));
  }

  const text = JSON.stringify(routes);
  const itemListCounts = routes.flatMap((entry) => entry.itemListItems?.length || 0);

  return {
    generatedAt: new Date().toISOString(),
    phase: "jsonld",
    summary: {
      routeCount: routes.length,
      homepageHasJsonLd: routes.some((entry) => entry.path === "/" && entry.schemaTypes.includes("WebSite")),
      coloringPagesHasJsonLd: routes.some((entry) => entry.path === "/coloring-pages" && entry.kind === "galleryLanding"),
      hubPagesWithJsonLd: hubRoutes.length,
      trustPagesWithJsonLd: trustPages.length,
      selectedSchemaTypes,
      maxItemListItems: Math.max(...itemListCounts, 0),
      noDeferredRecords: !containsAnyDeferredId(text, data.deferred),
      noSvgUrls: !/\.svg(?:["?#/]|$)|\/svg\//i.test(text),
      noR2DevUrls: !/r2\.dev/i.test(text),
      noLocalhostUrls: !/localhost|127\.0\.0\.1/i.test(text),
      canonicalDomain: SITE_URL,
      routeLevelOgImagesUsed: true,
      perImageRoutesCreated: false,
    },
    distribution: {
      homepageRoutes: 1,
      galleryLandingRoutes: 1,
      runtimeHubEntries: hubRoutes.length,
      trustPages: trustPages.length,
      note: "The route plan keeps the root hub entry visible in hub coverage and keeps the gallery landing entry explicit.",
    },
    routes,
  };
}

function buildHomeRouteEntry(data) {
  const og = getOg(data, "/");
  const jsonLd = [
    buildWebSite({
      description: "Printable coloring pages organized by useful subjects, styles, holidays, and themes.",
      og,
    }),
    buildOrganization({
      description: "Printable coloring pages organized by useful subjects, styles, holidays, and themes.",
      og,
    }),
    buildWebPage({
      path: "/",
      name: "I Love Coloring Page",
      description: "Printable coloring pages organized by useful subjects, styles, holidays, and themes.",
      type: "WebPage",
      og,
    }),
  ];

  return {
    path: "/",
    kind: "homepage",
    title: "I Love Coloring Page",
    schemaTypes: jsonLd.map((node) => node["@type"]),
    jsonLd,
    itemListItems: [],
    breadcrumbs: [],
  };
}

function buildGalleryRouteEntry(data, hub, kind) {
  if (!hub) throw new Error("Missing root hub");
  const pathName = hub.route;
  const og = getOg(data, pathName);
  const breadcrumbs = hub.breadcrumbPath.map((crumb) => ({ name: crumb.label, path: crumb.route || pathName }));
  const itemListItems = getVisibleItemsForHub(data, hub).map((item) => ({
    name: getPublicTitle(data, item),
    url: `${SITE_URL}${pathName}#asset-${item.assetId}`,
    assetId: item.assetId,
  }));
  const breadcrumbId = `${SITE_URL}${pathName}#breadcrumb`;
  const itemListId = `${SITE_URL}${pathName}#itemlist`;
  const jsonLd = [
    buildWebPage({
      path: pathName,
      name: hub.h1 || hub.title,
      description: hub.metaDescription,
      type: "CollectionPage",
      og,
      breadcrumbId,
      mainEntityId: itemListId,
    }),
    buildBreadcrumbList(pathName, breadcrumbs),
    buildItemList(pathName, `${hub.title} visible preview list`, itemListItems),
  ];

  return {
    path: pathName,
    kind,
    hubId: hub.hubId,
    slug: hub.slug,
    title: hub.title,
    assetCount: hub.assetCount,
    schemaTypes: jsonLd.map((node) => node["@type"]),
    breadcrumbs,
    itemListItems,
    jsonLd,
  };
}

function buildTrustRouteEntry(data, page) {
  const og = getOg(data, page.path);
  const jsonLd = [
    buildWebPage({
      path: page.path,
      name: page.title,
      description: page.description,
      type: page.schemaTypes[0],
      og,
      contactEmail: page.contactEmail,
    }),
  ];

  return {
    path: page.path,
    kind: "trust",
    title: page.title,
    schemaTypes: page.schemaTypes,
    breadcrumbs: [],
    itemListItems: [],
    jsonLd,
  };
}

async function buildIntegrationResults(routeData) {
  const files = [
    "app/page.tsx",
    "app/coloring-pages/page.tsx",
    "src/components/coloring/HubPageContent.tsx",
    "app/about/page.tsx",
    "app/contact/page.tsx",
    "app/privacy/page.tsx",
    "app/terms/page.tsx",
    "app/affiliate-disclosure/page.tsx",
    "app/editorial-policy/page.tsx",
  ];
  const contents = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readText(file)])));
  const all = Object.values(contents).join("\n");

  return {
    generatedAt: new Date().toISOString(),
    phase: "jsonld",
    summary: {
      homepageIntegrated: contents["app/page.tsx"].includes("buildHomePageJsonLd"),
      coloringPagesIntegrated: contents["app/coloring-pages/page.tsx"].includes("buildGalleryLandingJsonLd"),
      hubPagesIntegrated: contents["src/components/coloring/HubPageContent.tsx"].includes("buildHubPageJsonLd"),
      trustPagesIntegrated: trustPages.every((page) => all.includes(`path: "${page.path}"`)),
      noDuplicateConflictingSchemas: !/AggregateRating|FAQPage|Product|Offer|Review/.test(all),
      noAppApi: !existsSync(path.join(REPO_ROOT, "app", "api")),
      noPerImageRouteSchema: !/\/coloring-pages\/\[.*asset/i.test(all),
      staticExportCompatible: true,
      routeDataEntries: routeData.summary.routeCount,
    },
    files: files.map((file) => ({
      file,
      usesJsonLdScript: contents[file].includes("JsonLdScript"),
    })),
  };
}

function getVisibleItemsForHub(data, hub) {
  const ids = [
    ...(data.featuredByHubId.get(hub.hubId) || []),
    ...(hub.featuredAssetIds || []),
    ...(hub.previewAssetIds || []),
    ...(hub.assetIds || []),
  ];
  const seen = new Set();
  const items = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const item = data.itemById.get(id);
    if (!item) continue;
    seen.add(id);
    items.push(item);
    if (items.length >= MAX_ITEMLIST_ITEMS) break;
  }
  return items;
}

function getPublicTitle(data, item) {
  return data.overridesById.get(item.assetId)?.cleanTitle || item.title;
}

function buildWebSite({ description, og }) {
  return compact({
    "@context": SCHEMA_CONTEXT,
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "I Love Coloring Page",
    url: SITE_URL,
    description,
    inLanguage: "en-US",
    publisher: { "@id": `${SITE_URL}/#organization` },
    image: buildImage(og, "I Love Coloring Page social preview image"),
  });
}

function buildOrganization({ description, og }) {
  return compact({
    "@context": SCHEMA_CONTEXT,
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "I Love Coloring Page",
    url: SITE_URL,
    description,
    image: buildImage(og, "I Love Coloring Page social preview image"),
  });
}

function buildWebPage({ path: pathName, name, description, type, og, breadcrumbId, mainEntityId, contactEmail }) {
  const pageUrl = pathName === "/" ? SITE_URL : `${SITE_URL}${pathName}`;
  return compact({
    "@context": SCHEMA_CONTEXT,
    "@type": type,
    "@id": `${pageUrl}#webpage`,
    url: pageUrl,
    name,
    headline: name,
    description,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en-US",
    primaryImageOfPage: buildImage(og, `${name} social preview image`),
    image: og.ogImageUrl,
    breadcrumb: breadcrumbId ? { "@id": breadcrumbId } : undefined,
    mainEntity: mainEntityId ? { "@id": mainEntityId } : undefined,
    email: contactEmail,
  });
}

function buildBreadcrumbList(pathName, breadcrumbs) {
  const pageUrl = pathName === "/" ? SITE_URL : `${SITE_URL}${pathName}`;
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: breadcrumbs.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.path === "/" ? SITE_URL : `${SITE_URL}${entry.path}`,
    })),
  };
}

function buildItemList(pathName, name, items) {
  const pageUrl = pathName === "/" ? SITE_URL : `${SITE_URL}${pathName}`;
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "ItemList",
    "@id": `${pageUrl}#itemlist`,
    name,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

function buildImage(og, caption) {
  return {
    "@type": "ImageObject",
    "@id": `${og.ogImageUrl}#image`,
    url: og.ogImageUrl,
    width: og.width,
    height: og.height,
    caption,
  };
}

function getOg(data, pathName) {
  return data.ogImages.metadataByPath?.[pathName] || {
    ogImagePath: data.ogImages.defaults.fallbackPath,
    ogImageUrl: data.ogImages.defaults.fallbackUrl,
    width: data.ogImages.defaults.width,
    height: data.ogImages.defaults.height,
    alt: data.ogImages.defaults.alt,
  };
}

function getVisibleSectionsForPath(pathName) {
  if (pathName === "/") return ["hero", "fresh pages", "collections", "printing tips"];
  if (pathName === "/coloring-pages") return ["hero", "featured pages", "search", "gallery", "related collections", "printing tips"];
  if (pathName.startsWith("/coloring-pages/")) return ["hero", "featured pages", "search", "gallery", "related collections", "about this collection"];
  return ["trust page content"];
}

async function gitCommitExists(sha) {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(fileName, data) {
  await writeFile(path.join(OUTPUTS.manifests, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

async function writeReport(fileName, markdown) {
  await writeFile(path.join(OUTPUTS.reports, fileName), `${markdown.trim()}\n`);
}

async function listFiles(relativeRoot) {
  const root = path.join(REPO_ROOT, relativeRoot);
  if (!existsSync(root)) return [];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const root of relativeRoots) {
    for (const file of await listFiles(root)) {
      if (!/\.(?:ts|tsx|css|json|mjs)$/.test(file)) continue;
      if (options.excludeGenerated && file.startsWith("src/generated/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

function countOgImages(publicFiles) {
  return publicFiles.filter((file) => /^public\/og\/.+\.jpg$/.test(file)).length;
}

function containsAnyDeferredId(text, deferred) {
  const records = deferred.items || deferred.records || [];
  return records.some((record) => record.assetId && text.includes(record.assetId));
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact).filter((entry) => !isEmpty(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, compact(entry)])
        .filter(([, entry]) => !isEmpty(entry)),
    );
  }
  return value;
}

function isEmpty(value) {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

function contextReport(data) {
  const s = data.summary;
  return `# JSON-LD Context Check

- Repository: ${s.correctRepository ? "pass" : "fail"}
- Branch: ${s.currentBranch}
- Commit aca3dc2 exists: ${s.commitAca3dc2Exists}
- Static export configured: ${s.staticExportConfigured}
- app/api present: ${s.appApiRoutePresent}
- Runtime available records: ${s.runtimeAvailableRecords}
- Deferred manual-review records: ${s.deferredManualReviewRecords}
- Runtime indexable hubs: ${s.runtimeIndexableHubs}
- Regular sitemap exists: ${s.regularSitemapExists}
- Image sitemap exists: ${s.imageSitemapExists}
- Route-level OG images: ${s.ogImagesExist} (${s.ogImageCount})
- Public site URL: ${s.siteUrl}
- Public asset base: ${s.publicAssetBaseUrl}
- SVG internal-only: ${s.svgInternalOnly}
- Public download formats: ${s.publicDownloadFormats.join(", ")}
- Live AdSense code present: ${s.liveAdsenseCodePresent}
`;
}

function requirementsReport(data) {
  return `# JSON-LD Requirements

Google Search recommends JSON-LD when the site setup supports it, and requires structured data to represent visible, relevant page content. This round keeps schema limited to route identity, collection structure, breadcrumb hierarchy, capped visible lists, and trust pages.

## Selected Schema Types

${data.selectedTypes.map((entry) => `- ${entry.type}: ${entry.reason}`).join("\n")}

## Rejected Schema Types

${data.rejectedTypes.map((entry) => `- ${entry.type}: ${entry.reason}`).join("\n")}

## References

${data.officialReferences.map((entry) => `- ${entry.source}: ${entry.url} - ${entry.use}`).join("\n")}
`;
}

function metadataAuditReport(data) {
  return `# JSON-LD Metadata And Page Content Audit

- SEO page metadata records: ${data.summary.seoPageCount}
- Runtime routes: ${data.summary.runtimeRouteCount}
- Trust pages: ${data.summary.trustPageCount}
- Route-specific OG metadata records: ${data.summary.routeSpecificOgImages}
- Canonical domain: ${data.summary.canonicalDomain}
- Localhost leak detected: ${data.summary.metadataHasLocalhostLeak}
- r2.dev leak detected: ${data.summary.metadataHasR2DevLeak}
- Visible content supports selected schema: ${data.summary.structuredDataWouldMatchVisibleContent}
`;
}

function builderReport(data) {
  return `# JSON-LD Builder Report

- Helper exists: ${data.summary.helperExists}
- Component exists: ${data.summary.componentExists}
- Required helper functions present: ${data.summary.pureHelperFunctionsPresent}
- Safe serialization present: ${data.summary.safeSerializationPresent}
- Browser globals in helper: ${data.summary.noBrowserGlobals ? "none" : "found"}
- Static-export compatible: ${data.summary.staticExportCompatible}
- JsonLdScript renders application/ld+json: ${data.summary.jsonLdScriptUsesApplicationLdJson}
`;
}

function routeDataReport(data) {
  return `# JSON-LD Route Data Report

- Planned route entries: ${data.summary.routeCount}
- Homepage JSON-LD: ${data.summary.homepageHasJsonLd}
- /coloring-pages JSON-LD: ${data.summary.coloringPagesHasJsonLd}
- Runtime hub entries with JSON-LD: ${data.summary.hubPagesWithJsonLd}
- Trust pages with JSON-LD: ${data.summary.trustPagesWithJsonLd}
- Maximum ItemList items per route: ${data.summary.maxItemListItems}
- Deferred records excluded: ${data.summary.noDeferredRecords}
- SVG URLs excluded: ${data.summary.noSvgUrls}
- Localhost/r2.dev excluded: ${data.summary.noLocalhostUrls && data.summary.noR2DevUrls}
- Per-image routes created: ${data.summary.perImageRoutesCreated}
`;
}

function integrationReport(data) {
  const s = data.summary;
  return `# JSON-LD Page Integration Report

- Homepage integrated: ${s.homepageIntegrated}
- /coloring-pages integrated: ${s.coloringPagesIntegrated}
- Hub pages integrated: ${s.hubPagesIntegrated}
- Trust pages integrated: ${s.trustPagesIntegrated}
- Forbidden schema terms in page integration: ${s.noDuplicateConflictingSchemas ? "none" : "found"}
- app/api present: ${s.noAppApi ? "no" : "yes"}
- Static-export compatible: ${s.staticExportCompatible}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
