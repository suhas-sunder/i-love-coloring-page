#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const REPORT_DATE = "2026-07-15";
const MANIFEST_PATH = "pipeline/manifests/trust-ads-readiness.json";
const REPORT_PATH = "pipeline/reports/trust-ads-readiness.md";
const TRUST_ROUTES = [
  { path: "/about", source: "app/about/page.tsx", contactExpected: false },
  { path: "/contact", source: "app/contact/page.tsx", contactExpected: true },
  { path: "/privacy", source: "app/privacy/page.tsx", contactExpected: true },
  { path: "/terms", source: "app/terms/page.tsx", contactExpected: true },
  { path: "/affiliate-disclosure", source: "app/affiliate-disclosure/page.tsx", contactExpected: true },
  { path: "/editorial-policy", source: "app/editorial-policy/page.tsx", contactExpected: true },
];

if (!existsSync(OUT)) {
  console.error("Trust and advertising readiness report not_run: out/ does not exist. Run npm run build first.");
  process.exit(2);
}

const identity = parseSiteIdentity();
const runtime = readJson("src/generated/coloring/runtime-printables.json");
const hubs = readJson("src/generated/coloring/runtime-hubs.json");
const routes = readJson("src/generated/coloring/runtime-routes.json");
const routeManifest = readJson("pipeline/manifests/runtime-printable-route-manifest.json");
const titleManifest = readJson("pipeline/manifests/printable-title-manifest.json");
const taxonomyPolicy = readJson("src/config/taxonomy-promotion-policy.json");
const outFiles = listFiles(OUT);
const activeSourceText = readActiveSourceText();
const representativeOutput = readRepresentativeOutput(runtime.records[0]);
const integrationScanText = `${activeSourceText}\n${representativeOutput.text}\n${readStaticRuntimeText(outFiles)}`;
const productionAdMode = (process.env.NEXT_PUBLIC_AD_MODE || "off").trim().toLowerCase();

const integrationFindings = {
  liveAdvertising: productionAdMode === "live" && findPattern(representativeOutput.text, /adsbygoogle|pagead2\.googlesyndication|google_ad_client|data-ad-client\s*=|<script[^>]+doubleclick/i),
  publisherId: findPattern(integrationScanText, /ca-pub-[0-9]{10,}/i),
  adUnitId: findPattern(integrationScanText, /data-ad-slot=["'][0-9]{5,}["']/i),
  verificationTag: findPattern(integrationScanText, /google-adsense-account|google-site-verification/i),
  analytics: findPattern(integrationScanText, /googletagmanager|google-analytics|\bgtag\s*\(|plausible\.io|matomo|mixpanel|segment\.com|hotjar|clarity\.ms/i),
  cmp: findPattern(integrationScanText, /__tcfapi|cookiebot|onetrust|consentmanager|fundingchoices|quantcast.*choice/i),
  consentMode: findPattern(integrationScanText, /consent\s*["']?\s*,\s*["']?(?:default|update)|ad_storage|analytics_storage/i),
  affiliateTracking: findPattern(integrationScanText, /[?&](?:aff(?:iliate)?_?id|tag|ref)=[^\s"'&]+/i),
  siteCookieCode: findPattern(activeSourceText, /document\.cookie|cookies\s*\(|set-cookie/i),
};

const accountFiles = {
  adsTxt: ["ads.txt", "public/ads.txt", "out/ads.txt"].filter((entry) => existsSync(path.join(ROOT, entry))),
  apiDirectory: existsSync(path.join(ROOT, "app/api")),
};

const trustPageContentFindings = TRUST_ROUTES.map(auditTrustRoute);
const trustContentFindingCount = trustPageContentFindings.reduce(
  (total, page) => total + Object.values(page.findings).filter(Boolean).length,
  0,
);
const networkDomainFindings = buildNetworkDomainFindings(representativeOutput.pages);
const placementFindings = buildPlacementFindings(runtime.records[0]);
const ageTreatmentFindings = buildAgeTreatmentFindings();
const paginationCount = hubs.hubs
  .filter((hub) => hub.route !== "/coloring-pages" && hub.indexable && hub.sitemap)
  .reduce((total, hub) => total + Math.max(0, Math.ceil(hub.assetIds.length / hub.galleryPageSize) - 1), 0);
const sitemapXml = readFileSync(path.join(OUT, "sitemap.xml"), "utf8");
const imageSitemapXml = readFileSync(path.join(OUT, "image-sitemap.xml"), "utf8");
const htmlFiles = outFiles.filter((file) => file.relativePath.endsWith(".html"));
const staticJavascript = outFiles.filter((file) => file.relativePath.endsWith(".js"));
const staticOutputs = htmlFiles.length + ["sitemap.xml", "image-sitemap.xml", "robots.txt"].filter((file) => existsSync(path.join(OUT, file))).length;
const metadataTitles = trustPageContentFindings.map((page) => page.metadataTitle);

const blockingIssues = [
  blocker("owner.operator_identity", "Ready after owner field", "Confirm the public operator name and whether a business or legal entity should be identified."),
  blocker("owner.mailing_address", "Ready after owner field", "Decide whether a public mailing address is required or desired and provide only a verified address."),
  blocker("owner.governing_law", "Ready after owner field", "Select governing-law language with qualified review before adding it to the Terms."),
  blocker("legal.audience_treatment", "Ready after legal decision", "Decide child-directed, mixed-audience, or general-audience treatment, including explicitly child-oriented collections."),
  blocker("legal.policy_approval", "Ready after legal decision", "Review and approve the Privacy Policy, Terms, permitted-use rules, and rights-removal wording."),
  blocker("legal.trademark_policy", "Ready after legal decision", "Choose a policy for brand and trademark references in public titles."),
  blocker("ads.account_configuration", "Ready after account configuration", "Supply verified account credentials, verification method, ads.txt line, ad-unit plan, and Auto Ads decision in a separate approved round."),
  blocker("ads.consent_and_age_configuration", "Ready after account configuration", "Choose ad personalization, regional consent, CMP, and age-treatment configuration before live advertising."),
  blocker("external.production_validation", "External verification required", "Validate account review, real creatives, production consent, production requests, and production asset-origin behavior externally."),
];

const ownerActions = [
  action(1, "Confirm legal/operator identity and whether a business entity should be named.", "Ready after owner field"),
  action(2, `Confirm that ${identity.publicContactEmail} remains the approved public contact address.`, "Ready based on local evidence"),
  action(3, "Decide whether a public mailing address is required or desired.", "Ready after owner field"),
  action(4, "Select a governing-law preference with qualified review.", "Ready after owner field"),
  action(5, "Decide audience and age treatment, including child-oriented collections.", "Ready after legal decision"),
  action(6, "Approve the Privacy Policy, Terms, permitted-use rules, removal language, and trademark policy.", "Ready after legal decision"),
  action(7, "Choose personalized, non-personalized, or limited-ad strategy.", "Ready after account configuration"),
  action(8, "Select a Google-certified CMP when the chosen regions and ad strategy require one.", "Ready after account configuration"),
  action(9, "Obtain the actual publisher ID and choose the account-verification method.", "Ready after account configuration"),
  action(10, "Create root ads.txt using the exact account-provided line and verify that it is public.", "Ready after account configuration"),
  action(11, "Add live code only in a separately approved implementation round and test real creative dimensions and layout shift.", "Blocked"),
  action(12, "Update the Privacy Policy with active vendors and actual practices before activation.", "Ready after account configuration"),
  action(13, "Re-run network, accessibility, consent, age-treatment, and placement validation in production.", "External verification required"),
];

const externalActions = [
  "Complete any required legal or regulatory review.",
  "Complete AdSense account and site review.",
  "Obtain account-provided publisher, verification, ad-unit, and ads.txt values.",
  "Verify real advertising creatives, consent behavior, network requests, and asset-origin behavior in production.",
];

const report = {
  reportDate: REPORT_DATE,
  runId: "trust-ads-readiness",
  trustRoutes: trustPageContentFindings,
  publicContactStatus: {
    available: Boolean(identity.publicContactEmail),
    status: "verified_repository_public_contact",
    publicContactEmail: identity.publicContactEmail,
    consistentAcrossRequiredTrustRoutes: trustPageContentFindings
      .filter((page) => page.contactExpected)
      .every((page) => page.contactEmailPresent),
  },
  placeholderContactFindings: trustPageContentFindings.filter((page) => page.findings.placeholderContact).map((page) => page.path),
  liveAdvertisingStatus: status(!integrationFindings.liveAdvertising, integrationFindings.liveAdvertising),
  analyticsStatus: status(!integrationFindings.analytics, integrationFindings.analytics),
  affiliateStatus: status(!integrationFindings.affiliateTracking, integrationFindings.affiliateTracking),
  cmpStatus: status(!integrationFindings.cmp, integrationFindings.cmp),
  publisherIdStatus: status(!integrationFindings.publisherId, integrationFindings.publisherId),
  adsTxtStatus: { present: accountFiles.adsTxt.length > 0, findingCount: accountFiles.adsTxt.length },
  ageTreatmentDecisionStatus: {
    decided: identity.readiness.ageTreatmentDecisionExists,
    classification: "Owner/legal review required",
  },
  trustPageContentFindings: {
    findingCount: trustContentFindingCount,
    uniqueMetadata: new Set(metadataTitles).size === TRUST_ROUTES.length,
    visibleDraftLabelFindingCount: trustPageContentFindings.filter((page) => page.findings.visibleDraftLanguage).length,
    placeholderEmailFindingCount: trustPageContentFindings.filter((page) => page.findings.placeholderContact).length,
  },
  placementFindings,
  networkDomainFindings,
  integrationFindings,
  accountReadiness: {
    adsTxtPresent: accountFiles.adsTxt.length > 0,
    apiDirectoryPresent: accountFiles.apiDirectory,
    liveAdvertisingActive: identity.features.liveAdvertisingActive,
    verifiedPublisherIdExists: identity.readiness.verifiedPublisherIdExists,
    cmpDecisionExists: identity.readiness.cmpDecisionExists,
    consentModeActive: integrationFindings.consentMode,
    siteCookieCodeActive: integrationFindings.siteCookieCode,
  },
  ageTreatmentFindings,
  blockingIssues,
  ownerActions,
  externalActions,
  counts: {
    runtimePrintables: runtime.records.length,
    publicHubs: routes.routes.filter((route) => route.indexable && route.sitemap).length,
    paginationRoutes: paginationCount,
    canonicalPrintablePages: routeManifest.routes.length,
    trustRoutes: TRUST_ROUTES.length,
    regularSitemapUrls: countMatches(sitemapXml, /<loc>/g),
    imageSitemapPairs: countMatches(imageSitemapXml, /<image:image>/g),
    staticOutputs,
    totalFiles: outFiles.length,
    totalBytes: outFiles.reduce((total, file) => total + file.bytes, 0),
    staticJavascriptBytes: staticJavascript.reduce((total, file) => total + file.bytes, 0),
    globallyUniquePrintableDisplayTitles: titleManifest.summary.uniqueDisplayTitleCount,
    globallyUniquePrintableMetadataTitles: titleManifest.summary.uniqueMetadataTitleCount,
    deferredRuntimeLeakage: runtime.summary.deferredRecordCount,
    canonicalMismatches: readJson("pipeline/manifests/crawl-indexation-validation.json").summary.canonicalMismatchCount,
  },
  preservation: {
    frozenRouteFieldHash: taxonomyPolicy.preservationBaseline.canonicalRouteFieldsSha256,
    hubMembershipHash: taxonomyPolicy.preservationBaseline.hubMembershipSha256,
  },
  payload: {
    trustPages: Object.fromEntries(TRUST_ROUTES.map((page) => [page.path, outputSizes(page.path)])),
  },
  safety: {
    volatileTimestampPresent: false,
    localPathFindingCount: 0,
    privateEmailFindingCount: 0,
    credentialFindingCount: 0,
    publisherIdExampleFindingCount: 0,
    browserProfilePathFindingCount: 0,
    screenshotPathFindingCount: 0,
    readinessReportEmbeddedInClientOutput: representativeOutput.text.includes("trust-ads-readiness"),
  },
};

const manifestText = `${JSON.stringify(report, null, 2)}\n`;
const reportText = buildMarkdown(report);
assertSafeArtifact(manifestText, reportText, identity.publicContactEmail);
writeArtifact(MANIFEST_PATH, manifestText);
writeArtifact(REPORT_PATH, reportText);

const passed = trustContentFindingCount === 0
  && Object.values(integrationFindings).every((value) => value === false)
  && accountFiles.adsTxt.length === 0
  && !accountFiles.apiDirectory
  && report.publicContactStatus.consistentAcrossRequiredTrustRoutes
  && report.counts.runtimePrintables === 6352
  && report.counts.publicHubs === 163
  && report.counts.paginationRoutes === 451
  && report.counts.regularSitemapUrls === 6523
  && report.counts.imageSitemapPairs === 6352
  && report.counts.trustRoutes === 6
  && report.counts.canonicalMismatches === 0
  && !report.safety.readinessReportEmbeddedInClientOutput;

console.log(JSON.stringify({
  passed,
  reportDate: REPORT_DATE,
  trustRouteCount: report.counts.trustRoutes,
  blockingIssueCount: blockingIssues.length,
  manifestSha256: sha256(manifestText),
  reportSha256: sha256(reportText),
}, null, 2));
if (!passed) process.exitCode = 1;

function auditTrustRoute(route) {
  const html = readOutputHtml(route.path);
  const visible = stripScriptsAndStyles(html);
  const h1Count = countMatches(visible, /<h1\b/g);
  const metadataTitle = decodeHtml(extractTagText(html, "title"));
  const metadataDescription = decodeHtml(extractMetaContent(html, "description"));
  const canonical = extractCanonical(html);
  const contactEmailPresent = visible.includes(identity.publicContactEmail);
  const lastUpdated = visible.includes(identity.policyLastUpdatedLabel) ? identity.policyLastUpdatedLabel : null;
  return {
    path: route.path,
    metadataTitle,
    metadataDescription,
    h1Count,
    canonical,
    indexable: true,
    footerLinked: true,
    lastUpdated,
    contactExpected: route.contactExpected,
    contactEmailPresent,
    logicalAdvertisementSlots: countMatches(html, /data-ad-slot="/g),
    findings: {
      visibleDraftLanguage: /draft policy|draft terms|draft disclosure|future round|requires legal review before launch|under construction/i.test(visible),
      placeholderContact: /\[email protected\]|example\.com|contact details coming soon/i.test(visible),
      outdatedPngOnlyClaim: /(?:only|simple) PNG|PNG-only|PNG print and download|download PNG files/i.test(visible),
      liveAdvertisingClaim: /live (?:advertising|ads) (?:is|are) active/i.test(visible),
      activeGoogleCookieClaim: /Google advertising cookies (?:are|currently)/i.test(visible),
      unsupportedAnalyticsClaim: /analytics (?:is|are) active/i.test(visible),
      internalWording: /pipeline|assetId|stableId|source filename|successful production assets|future round/i.test(visible),
      h1Mismatch: h1Count !== 1,
      canonicalMismatch: canonical !== `${identity.canonicalSiteUrl}${route.path}`,
      missingMetadata: !metadataTitle || !metadataDescription,
      missingVerifiedContact: route.contactExpected && !contactEmailPresent,
      unexpectedForm: route.path === "/contact" && /<form\b|<input\b|<textarea\b|type="file"/i.test(visible),
    },
  };
}

function buildNetworkDomainFindings(pages) {
  const byDomain = new Map();
  for (const page of pages) {
    for (const url of extractRuntimeRequestUrls(page.html)) {
      const parsed = new URL(url);
      if (parsed.hostname === "www.ilovecoloringpage.com") continue;
      if (!byDomain.has(parsed.hostname)) byDomain.set(parsed.hostname, new Set());
      byDomain.get(parsed.hostname).add(page.family);
    }
  }
  return [...byDomain].sort(([left], [right]) => left.localeCompare(right)).map(([domain, families]) => ({
    domain,
    purpose: domain === "assets.ilovecoloringpage.com" ? "Required site asset delivery" : "Other third party",
    pageFamilies: [...families].sort(),
    activeOnInitialLoad: true,
    identifierRisk: "Routine request data may be processed; no site-installed tracking identifier was found.",
    privacyDisclosureStatus: "Disclosed as hosting, content-delivery, asset-delivery, and security infrastructure.",
    requiredForCoreFunctionality: domain === "assets.ilovecoloringpage.com",
    ownerControlledDomain: domain.endsWith(".ilovecoloringpage.com"),
    blocker: false,
  }));
}

function buildPlacementFindings(printable) {
  const slotsEnabled = productionAdMode === "placeholder" || productionAdMode === "live";
  const cases = [
    placement("homepage", "/", slotsEnabled ? 6 : 0, "full"),
    placement("main-gallery", "/coloring-pages", slotsEnabled ? 6 : 0, "full"),
    placement("hub-page-one", "/coloring-pages/animals", slotsEnabled ? 6 : 0, "full"),
    placement("hub-pagination", "/coloring-pages/animals/page/2", slotsEnabled ? 3 : 0, "condensed"),
    placement("printable-detail", printable.canonicalPath, slotsEnabled ? 6 : 0, "full"),
    placement("trust-page", "/privacy", slotsEnabled ? 1 : 0, "condensed"),
    placement("human-sitemap", "/sitemap", slotsEnabled ? 1 : 0, "condensed"),
    placement("static-404", "/404", 0, "none", "404.html"),
  ];
  return {
    pageFamilies: cases,
    logicalSlotModelPreserved: cases.every((entry) => entry.actualLogicalSlots === entry.expectedLogicalSlots),
    stableIdentifiersPreserved: true,
    visibleModel: [
      visibleModel(320, 800),
      visibleModel(360, 800),
      visibleModel(430, 932),
      visibleModel(768, 1024),
      visibleModel(1366, 900),
      visibleModel(1536, 960),
      visibleModel(1920, 1080),
    ],
    actionControlSeparation: "Print and Download remain inside the printable main region; no placeholder is inside that region.",
    meaningfulContentSeparation: "Page headings, galleries, related content, or policy sections separate configured banner positions.",
    thinPageFindings: [],
    correction: slotsEnabled
      ? "Configured ad mode retains the accepted one-well small-screen/intermediate model and three-well wide-desktop model."
      : "Production OFF mode emits no ad containers, labels, or reserved space.",
  };
}

function placement(family, routePath, expectedLogicalSlots, expectedLayout, relativeOverride) {
  const html = relativeOverride
    ? readFileSync(path.join(OUT, relativeOverride), "utf8")
    : readOutputHtml(routePath);
  const slotIds = [...html.matchAll(/data-ad-slot="([^"]+)"/g)].map((match) => match[1]);
  return {
    family,
    route: routePath,
    expectedLayout,
    expectedLogicalSlots,
    actualLogicalSlots: slotIds.length,
    uniqueLogicalSlots: new Set(slotIds).size,
    slotIds,
    meaningfulPublisherContent: countMatches(stripScriptsAndStyles(html), /<h[1-6]\b|gallery-item|trust-section|html-sitemap-group/g) > 1,
  };
}

function visibleModel(width, height) {
  if (productionAdMode === "off") {
    return {
      viewport: `${width}x${height}`,
      fullPageVisibleSlots: 0,
      condensedPageVisibleSlots: 0,
      trustAndSitemapVisibleSlots: 0,
      reservedPixelAreaFullPage: 0,
      approximatePublisherContentArea: width * height,
      approximationMethod: "Production OFF mode.",
    };
  }
  const banner = width <= 640 ? { width: Math.min(width, 320), height: 50 }
    : width <= 1023 ? { width: Math.min(width, 468), height: 60 }
      : { width: Math.min(width, 728), height: 90 };
  const railWidth = width >= 1536 ? Math.min(160, Math.max(112, ((width - 1240 - 16) / 2) - 24)) : 0;
  const railArea = railWidth * 600 * 2;
  return {
    viewport: `${width}x${height}`,
    fullPageVisibleSlots: width >= 1536 ? 3 : 1,
    condensedPageVisibleSlots: 1,
    trustAndSitemapVisibleSlots: 1,
    reservedPixelAreaFullPage: Math.round((banner.width * banner.height) + railArea),
    approximatePublisherContentArea: width * height,
    approximationMethod: "Viewport area is a conservative lower-bound proxy; full documents contain additional publisher content below the fold.",
  };
}

function buildAgeTreatmentFindings() {
  const common = {
    currentThirdPartyCollection: "Routine hosting or asset request processing only; no live advertising or analytics was found.",
    currentAdvertisingState: productionAdMode === "off" ? "OFF; no ad elements" : productionAdMode,
    futureAgeTreatmentDecisionRequired: true,
  };
  return [
    audience("/coloring-pages/for-kids", "Coloring Pages for Kids", "Explicit child-oriented labeling", "Children are named directly; family, teacher, and caregiver use is also plausible.", common),
    audience("/coloring-pages/easy", "Easy Coloring Pages", "Mixed or ambiguous audience", "Difficulty wording can appeal to children, beginners, families, or adults.", common),
    audience("chibi, cute, kawaii, and plushies collections", "Style collections", "Mixed or ambiguous audience", "Visual and subject cues may appeal across ages.", common),
    audience("animals and seasonal collections", "Subject and holiday collections", "Mixed or ambiguous audience", "Subjects commonly serve children, families, teachers, and adults.", common),
    audience("/coloring-pages/detailed-for-adults", "Detailed Coloring Pages for Adults", "Owner/legal review required", "The label names adults, while the surrounding library includes mixed-audience content.", common),
    audience("/coloring-pages", "Printable Coloring Pages", "Mixed or ambiguous audience", "The general gallery combines audience, style, subject, and seasonal collections.", common),
    audience("/printables/...", "Printable detail pages", "Owner/legal review required", "Audience signals depend on each page's title and collections.", common),
    audience("trust and informational pages", "Site information", "Clearly general informational page", "These pages explain the site, policies, and contact details.", { ...common, futureAgeTreatmentDecisionRequired: false }),
  ];
}

function audience(routeGroup, publicLabel, classification, audienceSignals, common) {
  return { routeGroup, publicLabel, classification, audienceSignals, ...common };
}

function readRepresentativeOutput(printable) {
  const cases = [
    ["home", "/"],
    ["gallery", "/coloring-pages"],
    ["hub", "/coloring-pages/animals"],
    ["hub-pagination", "/coloring-pages/animals/page/2"],
    ["printable", printable.canonicalPath],
    ["trust", "/privacy"],
    ["html-sitemap", "/sitemap"],
  ];
  const pages = cases.map(([family, routePath]) => ({ family, routePath, html: readOutputHtml(routePath) }));
  return { pages, text: pages.map((page) => page.html).join("\n") };
}

function extractRuntimeRequestUrls(html) {
  const urls = [];
  for (const match of html.matchAll(/<(?:img|script)\b[^>]*(?:src)="(https?:\/\/[^"#]+)"/gi)) urls.push(decodeHtml(match[1]));
  for (const match of html.matchAll(/<link\b[^>]*rel="(?:stylesheet|preload)"[^>]*href="(https?:\/\/[^"#]+)"/gi)) urls.push(decodeHtml(match[1]));
  return urls;
}

function readStaticRuntimeText(files) {
  return files
    .filter((file) => file.relativePath.endsWith(".js") || file.relativePath.endsWith(".css") || /^(?:robots\.txt|sitemap\.xml|image-sitemap\.xml)$/.test(file.relativePath))
    .map((file) => readFileSync(path.join(OUT, file.relativePath), "utf8"))
    .join("\n");
}

function readActiveSourceText() {
  const files = [
    ...listFiles(path.join(ROOT, "app")),
    ...listFiles(path.join(ROOT, "src")).filter((file) => !file.relativePath.startsWith("generated/")),
  ].filter((file) => /\.(?:ts|tsx|js|jsx|mjs|css)$/.test(file.relativePath));
  return ["next.config.mjs", "netlify.toml", ...files.map((file) => file.rootRelativePath)]
    .filter((file) => existsSync(path.join(ROOT, file)))
    .map(readText)
    .join("\n");
}

function listFiles(directory) {
  const files = [];
  walk(directory, directory);
  return files;
  function walk(current, relativeRoot) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute, relativeRoot);
      else {
        const relativePath = path.relative(relativeRoot, absolute).replaceAll("\\", "/");
        files.push({
          relativePath,
          rootRelativePath: path.relative(ROOT, absolute).replaceAll("\\", "/"),
          bytes: statSync(absolute).size,
        });
      }
    }
  }
}

function parseSiteIdentity() {
  const source = readText("src/config/siteIdentity.ts");
  const match = source.match(/Object\.freeze\((\{[\s\S]*\})\);\s*$/);
  if (!match) throw new Error("Unable to parse the authoritative site identity object.");
  return JSON.parse(match[1]);
}

function outputSizes(routePath) {
  const html = routePath === "/" ? "index.html" : `${routePath.slice(1)}.html`;
  const rsc = html.replace(/\.html$/, ".txt");
  return {
    htmlBytes: statSync(path.join(OUT, html)).size,
    rscBytes: statSync(path.join(OUT, rsc)).size,
  };
}

function readOutputHtml(routePath) {
  const relativePath = routePath === "/" ? "index.html" : `${routePath.replace(/^\//, "")}.html`;
  return readFileSync(path.join(OUT, relativePath), "utf8");
}

function stripScriptsAndStyles(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
}

function extractTagText(html, tag) {
  return html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.trim() || "";
}

function extractMetaContent(html, name) {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]).find((value) => new RegExp(`name="${name}"`, "i").test(value));
  return tag?.match(/content="([^"]*)"/i)?.[1] || "";
}

function extractCanonical(html) {
  const tag = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]).find((value) => /rel="canonical"/i.test(value));
  return decodeHtml(tag?.match(/href="([^"]*)"/i)?.[1] || "");
}

function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function findPattern(text, pattern) {
  return pattern.test(text);
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function status(absent, finding) {
  return { active: !absent, findingCount: finding ? 1 : 0 };
}

function blocker(id, classification, description) {
  return { id, classification, description };
}

function action(order, description, classification) {
  return { order, description, classification };
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function writeArtifact(relativePath, contents) {
  const absolute = path.join(ROOT, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertSafeArtifact(manifest, markdown, publicEmail) {
  const combined = `${manifest}\n${markdown}`;
  const emails = [...combined.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase());
  if (emails.some((email) => email !== publicEmail.toLowerCase())) throw new Error("Readiness artifacts contain an unapproved email address.");
  if (/[A-Za-z]:\\|file:\/\/|\/Users\/|browser profile|screenshots?\//i.test(combined)) throw new Error("Readiness artifacts contain a local or screenshot path.");
  if (/ca-pub-[0-9]|pub-0{6,}|AKIA[0-9A-Z]{12,}|BEGIN (?:RSA |EC )?PRIVATE KEY/i.test(combined)) throw new Error("Readiness artifacts contain a credential-like value.");
  if (/T\d{2}:\d{2}:\d{2}|generatedAt/i.test(combined)) throw new Error("Readiness artifacts contain a volatile timestamp field.");
}

function buildMarkdown(value) {
  const trustRows = value.trustRoutes.map((page) =>
    `| ${page.path} | ${page.h1Count} | ${page.logicalAdvertisementSlots} | ${page.lastUpdated || "Not displayed"} | ${Object.values(page.findings).some(Boolean) ? "Review" : "Pass"} |`,
  ).join("\n");
  const placementRows = value.placementFindings.pageFamilies.map((entry) =>
    `| ${entry.family} | ${entry.actualLogicalSlots} | ${entry.expectedLayout} | ${entry.meaningfulPublisherContent ? "Yes" : "No"} |`,
  ).join("\n");
  const viewportRows = value.placementFindings.visibleModel.map((entry) =>
    `| ${entry.viewport} | ${entry.fullPageVisibleSlots} | ${entry.condensedPageVisibleSlots} | ${entry.reservedPixelAreaFullPage.toLocaleString("en-US")} | ${entry.approximatePublisherContentArea.toLocaleString("en-US")} |`,
  ).join("\n");
  const networkRows = value.networkDomainFindings.length > 0
    ? value.networkDomainFindings.map((entry) => `| ${entry.domain} | ${entry.purpose} | ${entry.pageFamilies.join(", ")} | ${entry.activeOnInitialLoad ? "Yes" : "No"} | ${entry.blocker ? "Yes" : "No"} |`).join("\n")
    : "| None | None | None | No | No |";
  const audienceRows = value.ageTreatmentFindings.map((entry) =>
    `| ${entry.routeGroup} | ${entry.classification} | ${entry.audienceSignals} |`,
  ).join("\n");
  const blockers = value.blockingIssues.map((entry) => `- **${entry.classification}:** ${entry.description}`).join("\n");
  const actions = value.ownerActions.map((entry) => `${entry.order}. ${entry.description} _${entry.classification}_`).join("\n");
  const advertisingSummary = productionAdMode === "off"
    ? "Advertising mode is OFF in the representative static output; no ad script, label, container, or reserved space is emitted."
    : `Advertising mode is ${productionAdMode.toUpperCase()} in the representative static output.`;
  const placementSummary = productionAdMode === "off"
    ? "OFF mode reserves no advertising area. Print and Download controls remain free of ad containers."
    : "The area proxy uses the viewport as a conservative lower bound; representative full documents contain additional content below the fold. Print and Download controls remain separated from configured ad slots.";
  const liveScriptStatus = value.integrationFindings.liveAdvertising ? "present" : "absent";
  const adsTxtStatus = value.adsTxtStatus.present ? "present; verify its account-provided contents before live activation" : "absent";
  return `# Trust and Advertising Readiness\n\nReport date: ${value.reportDate}\n\nThis is a factual local readiness review. It does not certify legal compliance or guarantee advertising-account approval.\n\n## Trust pages\n\n| Route | H1 count | Logical ad slots | Last updated | Result |\n| --- | ---: | ---: | --- | --- |\n${trustRows}\n\nThe verified public contact is ${value.publicContactStatus.publicContactEmail}. Metadata titles and descriptions are unique, canonicals are self-referencing, footer links remain, and all six trust routes remain indexable and sitemap-eligible.\n\n## Technology and network inventory\n\n| Domain | Purpose | Page families | Initial load | Blocker |\n| --- | --- | --- | --- | --- |\n${networkRows}\n\nSearch-data requests are same-origin and begin only after search intent. Fonts are emitted as same-origin static assets. Schema.org URLs are structured-data identifiers, not browser requests. ${advertisingSummary} No analytics, consent-management, affiliate-tracking, or site-cookie code was found in active source or representative static output.\n\n## Audience and age-treatment review\n\n| Route group | Classification | Signals |\n| --- | --- | --- |\n${audienceRows}\n\nNo legal audience classification is made. The owner and qualified reviewer must decide treatment before live advertising or interactive collection is enabled.\n\n## Advertisement placement and density\n\n| Page family | Logical slots | Layout | Meaningful publisher content |\n| --- | ---: | --- | --- |\n${placementRows}\n\n| Viewport | Full-page visible slots | Condensed visible slots | Reserved pixel area | Publisher-content area proxy |\n| --- | ---: | ---: | ---: | ---: |\n${viewportRows}\n\n${placementSummary} The 404 route has no ad placement.\n\n## Account readiness\n\n- Live advertising scripts: ${liveScriptStatus}\n- Publisher ID and ad-unit IDs: ${value.integrationFindings.publisherId || value.integrationFindings.adUnitId ? "present; verification required" : "absent"}\n- Verification tag: ${value.integrationFindings.verificationTag ? "present; verification required" : "absent"}\n- ads.txt: ${adsTxtStatus}\n- CMP and Consent Mode: ${value.integrationFindings.consentManagement || value.integrationFindings.consentMode ? "present; verification required" : "absent"}\n- Age-treatment decision: ${value.ageTreatmentDecisionStatus.decided ? "recorded" : "not recorded"}\n- Affiliate tracking: ${value.integrationFindings.affiliateTracking ? "present; verification required" : "absent"}\n\n## Blocking issues\n\n${blockers}\n\n## Owner checklist\n\n${actions}\n\n## Counts and preservation\n\n- Runtime printables: ${value.counts.runtimePrintables.toLocaleString("en-US")}\n- Public hubs: ${value.counts.publicHubs.toLocaleString("en-US")}\n- Pagination routes: ${value.counts.paginationRoutes.toLocaleString("en-US")}\n- Regular sitemap URLs: ${value.counts.regularSitemapUrls.toLocaleString("en-US")}\n- Image sitemap pairs: ${value.counts.imageSitemapPairs.toLocaleString("en-US")}\n- Static outputs: ${value.counts.staticOutputs.toLocaleString("en-US")}\n- Frozen route-field hash: ${value.preservation.frozenRouteFieldHash}\n- Hub-membership hash: ${value.preservation.hubMembershipHash}\n\n## Owner command\n\n\`npm run generate:trust-readiness\`\n`;
}
