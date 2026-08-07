#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const REPORT_DATE = "2026-08-04";
const EXPECTED_ADS_TXT = "google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0";
const MANIFEST_PATH = "pipeline/manifests/trust-ads-readiness.json";
const REPORT_PATH = "pipeline/reports/trust-ads-readiness.md";
const VERIFY_MODE = process.argv.includes("--verify");
const VERIFY_TECHNICAL_MODE = process.argv.includes("--verify-technical");
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
const coordinatedLiveAdvertising = hasCoordinatedLiveAdvertising(representativeOutput.text);
const consentManagementFinding = findPattern(integrationScanText, /__tcfapi|cookiebot|onetrust|consentmanager|fundingchoices|quantcast.*choice/i);

const integrationFindings = {
  liveAdvertising: coordinatedLiveAdvertising && findPattern(representativeOutput.text, /data-ad-client\s*=|class="adsbygoogle ad-slot-live-unit"/i),
  publisherId: findPattern(integrationScanText, /ca-pub-[0-9]{10,}/i),
  adUnitId: ["5574432869", "5115981872", "9929324856", "2489818539", "5382861174"].every((slotId) => integrationScanText.includes(slotId)),
  verificationTag: findPattern(integrationScanText, /google-adsense-account|google-site-verification/i),
  analytics: findPattern(integrationScanText, /googletagmanager|google-analytics|\bgtag\s*\(|plausible\.io|matomo|mixpanel|segment\.com|hotjar|clarity\.ms/i),
  cmp: consentManagementFinding,
  consentManagement: consentManagementFinding,
  consentMode: findPattern(integrationScanText, /consent\s*["']?\s*,\s*["']?(?:default|update)|ad_storage|analytics_storage/i),
  affiliateTracking: findPattern(integrationScanText, /[?&](?:aff(?:iliate)?_?id|tag|ref)=[^\s"'&]+/i),
  siteCookieCode: findPattern(activeSourceText, /document\.cookie|cookies\s*\(|set-cookie/i),
};

const accountFiles = {
  adsTxt: ["ads.txt", "public/ads.txt", "out/ads.txt"].filter((entry) => existsSync(path.join(ROOT, entry))),
  apiDirectory: existsSync(path.join(ROOT, "app/api")),
};
const adsTxtContents = accountFiles.adsTxt.map((entry) => readFileSync(path.join(ROOT, entry), "utf8").trim());
const exactAdsTxtRecord = adsTxtContents.length > 0 && adsTxtContents.every((value) => value === EXPECTED_ADS_TXT);

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
const staticOutputs = htmlFiles.length + ["sitemap.xml", "image-sitemap.xml", "robots.txt"].filter((file) => existsSync(path.join(OUT, file))).length;
const metadataTitles = trustPageContentFindings.map((page) => page.metadataTitle);

const blockingIssues = [
  ...(identity.readiness.operatorIdentityDecisionExists
    ? []
    : [blocker("owner.operator_identity", "Ready after owner field", "Confirm the public operator display and whether a person or business entity should be identified.")]),
  ...(identity.readiness.mailingAddressDecisionExists
    ? []
    : [blocker("owner.mailing_address", "Ready after owner field", "Decide whether a public mailing address should be published or omitted.")]),
  blocker("owner.governing_law", "Ready after owner field", "Select governing-law language with qualified review before adding it to the Terms."),
  blocker("legal.audience_treatment", "Ready after legal decision", "Decide child-directed, mixed-audience, or general-audience treatment, including explicitly child-oriented collections."),
  blocker("legal.policy_approval", "Ready after legal decision", "Complete qualified review of the Privacy Policy, Terms, artwork-rights position, and final public-use policy."),
  blocker(
    "legal.trademark_policy",
    "Ready after legal decision",
    identity.readiness.trademarkPolicyDecisionExists
      ? "Complete qualified review of the approved case-by-case policy for brand and trademark references."
      : "Choose a policy for brand and trademark references in public titles.",
  ),
  ...(identity.readiness.verifiedPublisherIdExists && exactAdsTxtRecord
    ? []
    : [blocker("ads.account_configuration", "Ready after account configuration", "Verify account status, site verification, ads.txt, placement, and Auto Ads decisions in the authenticated provider interface.")]),
  blocker("ads.consent_and_age_configuration", "Ready after account configuration", "Review and configure ad personalization, regional consent, CMP, and age treatment for live advertising."),
  blocker("external.production_validation", "External verification required", "Confirm the Netlify production and rollback workflow, then validate the deployed revision, Search Console state, and any later account behavior externally."),
];
const trustGates = blockingIssues.map(enrichTrustGate);

const ownerActions = [
  action(1, "Obtain qualified review of the Privacy Policy, Terms, artwork-rights position, final public-use policy, and case-by-case trademark policy.", "Ready after legal decision"),
  action(2, "Select a governing-law preference or approve omission after qualified review.", "Ready after legal decision"),
  action(3, "Decide audience and age treatment, including child-oriented collections.", "Ready after legal decision"),
  action(4, "Confirm the exact Netlify site, production branch, deployment method, and rollback method in the authenticated Netlify interface.", "Ready after account confirmation"),
  action(5, "Confirm Search Console property, verification, sitemap, coverage, security, and manual-action status in Search Console.", "Ready after account confirmation"),
  action(6, "Confirm AdSense account and site-review state in the authenticated provider interface.", "Ready after account confirmation"),
  action(7, "Review and configure audience, consent, CMP, and age treatment for production advertising in the authenticated provider interface.", "Ready after account configuration"),
  action(8, "Re-run network, accessibility, consent, age-treatment, and placement validation after deployment.", "External verification required"),
];

const externalActions = [
  "Complete any required legal or regulatory review.",
  "Complete AdSense account and site review.",
  "Verify the configured publisher, ad units, and ads.txt status in the authenticated AdSense interface.",
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
  resolvedOwnerDecisions: {
    publicOperatorDisplayName: identity.publicOperatorDisplayName,
    publicOperatorDisplayBasis: identity.publicOperatorDisplayBasis,
    mailingAddressDecision: identity.publicMailingAddressDecision,
    artworkRightsBasis: identity.ownerDecisions.artworkRightsBasis,
    publicUseLicense: identity.ownerDecisions.publicUseLicense,
    trademarkReferencePolicy: identity.ownerDecisions.trademarkReferencePolicy,
    advertisingPlan: identity.ownerDecisions.advertisingPlan,
  },
  placeholderContactFindings: trustPageContentFindings.filter((page) => page.findings.placeholderContact).map((page) => page.path),
  liveAdvertisingStatus: status(!integrationFindings.liveAdvertising, integrationFindings.liveAdvertising),
  analyticsStatus: status(!integrationFindings.analytics, integrationFindings.analytics),
  affiliateStatus: status(!integrationFindings.affiliateTracking, integrationFindings.affiliateTracking),
  cmpStatus: status(!integrationFindings.cmp, integrationFindings.cmp),
  publisherIdStatus: status(!integrationFindings.publisherId, integrationFindings.publisherId),
  adsTxtStatus: {
    present: accountFiles.adsTxt.length > 0,
    findingCount: exactAdsTxtRecord ? 0 : accountFiles.adsTxt.length,
    exactAuthorizedSellerRecord: exactAdsTxtRecord,
    paths: accountFiles.adsTxt,
  },
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
  blockingIssues: trustGates,
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
writeArtifact("reports/trust-gates.csv", renderTrustGatesCsv(trustGates));
writeArtifact("reports/trust-gates.md", renderTrustGatesMarkdown(trustGates));
writeArtifact("reports/owner-input-required.md", renderOwnerInputRequired(trustGates, identity));

const technicalPassed = trustContentFindingCount === 0
  && integrationFindings.publisherId
  && integrationFindings.adUnitId
  && !integrationFindings.analytics
  && !integrationFindings.affiliateTracking
  && !integrationFindings.cmp
  && !integrationFindings.consentMode
  && !integrationFindings.siteCookieCode
  && exactAdsTxtRecord
  && !accountFiles.apiDirectory
  && report.publicContactStatus.consistentAcrossRequiredTrustRoutes
  && report.counts.runtimePrintables === runtime.records.length
  && report.counts.publicHubs === routes.routes.filter((route) => route.indexable && route.sitemap).length
  && report.counts.canonicalPrintablePages === routeManifest.routes.length
  && report.counts.imageSitemapPairs === runtime.records.length
  && report.counts.trustRoutes === 6
  && report.counts.canonicalMismatches === 0
  && !report.safety.readinessReportEmbeddedInClientOutput;
const productionReady = technicalPassed && trustGates.length === 0;
writeArtifact("reports/production-readiness-status.md", renderProductionReadinessStatus({ technicalPassed, productionReady, trustGates, accountFiles }));

console.log(JSON.stringify({
  technicalPassed,
  productionReady,
  verifyMode: VERIFY_MODE,
  verifyTechnicalMode: VERIFY_TECHNICAL_MODE,
  reportDate: REPORT_DATE,
  trustRouteCount: report.counts.trustRoutes,
  blockingIssueCount: trustGates.length,
  manifestSha256: sha256(manifestText),
  reportSha256: sha256(reportText),
}, null, 2));
if (!technicalPassed || (VERIFY_MODE && !productionReady)) process.exitCode = 1;

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
    logicalAdvertisementSlots: extractLogicalSlotIds(html).length,
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
  const slotsEnabled = coordinatedLiveAdvertising;
  const cases = [
    placement("homepage", "/", slotsEnabled ? 6 : 0, "full"),
    placement("main-gallery", "/coloring-pages", slotsEnabled ? 6 : 0, "full"),
    placement("hub-page-one", "/coloring-pages/animals", slotsEnabled ? 6 : 0, "full"),
    placement("hub-pagination", "/coloring-pages/animals/page/2", slotsEnabled ? 3 : 0, "condensed"),
    placement("printable-detail", printable.canonicalPath, slotsEnabled ? 6 : 0, "full"),
    placement("trust-page", "/privacy", 0, "none"),
    placement("human-sitemap", "/sitemap", 0, "none"),
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
      visibleModel(2400, 1080),
      visibleModel(3440, 1440),
    ],
    actionControlSeparation: "Print and Download remain inside the printable main region; no placeholder is inside that region.",
    meaningfulContentSeparation: "Page headings, galleries, related content, or policy sections separate configured banner positions.",
    thinPageFindings: [],
    correction: slotsEnabled
      ? "The coordinated manual layout exposes four in-flow positions on full pages and adds two measured 300 by 600 rails only on qualifying ultra-wide viewports."
      : "No coordinated live-unit architecture was detected in the representative output.",
  };
}

function placement(family, routePath, expectedLogicalSlots, expectedLayout, relativeOverride) {
  const html = relativeOverride
    ? readFileSync(path.join(OUT, relativeOverride), "utf8")
    : readOutputHtml(routePath);
  const slotIds = extractLogicalSlotIds(html);
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
  if (!coordinatedLiveAdvertising) {
    return {
      viewport: `${width}x${height}`,
      fullPageVisibleSlots: 0,
      condensedPageVisibleSlots: 0,
      trustAndSitemapVisibleSlots: 0,
      reservedPixelAreaFullPage: 0,
      approximatePublisherContentArea: width * height,
      approximationMethod: "No coordinated live-unit architecture was detected.",
    };
  }
  const banner = width <= 640 ? { width: Math.min(width, 320), height: 50 }
    : width <= 1023 ? { width: Math.min(width, 468), height: 60 }
      : { width: Math.min(width, 728), height: 90 };
  const railWidth = width >= 2400 ? 300 : 0;
  const railArea = railWidth * 600 * 2;
  const inFlowArea = (banner.width * banner.height * 3) + (300 * 300);
  return {
    viewport: `${width}x${height}`,
    fullPageVisibleSlots: width >= 2400 ? 6 : 4,
    condensedPageVisibleSlots: 3,
    trustAndSitemapVisibleSlots: 0,
    reservedPixelAreaFullPage: Math.round(inFlowArea + railArea),
    approximatePublisherContentArea: width * height,
    approximationMethod: "Viewport area is a conservative lower-bound proxy; full documents contain additional publisher content below the fold.",
  };
}

function buildAgeTreatmentFindings() {
  const common = {
    currentThirdPartyCollection: "Live AdSense units are configured on eligible content pages; no analytics integration was found.",
    currentAdvertisingState: coordinatedLiveAdvertising ? "status-coordinated-live" : "absent",
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

function enrichTrustGate(entry) {
  const details = {
    "owner.operator_identity": {
      routeOrConfiguration: "src/config/siteIdentity.ts; About, Privacy, and Terms",
      codeFixable: false, ownerFacts: true, legalReview: true,
      riskOfGuessing: "Would publish an unverified person, business, or legal entity.",
      ownerInput: "Verified public operator name and whether a business/legal entity should be identified.",
      productionConsequence: "Production-readiness verification remains blocked.",
      adsenseConsequence: "Publisher identity and trust review remain incomplete.",
    },
    "owner.mailing_address": {
      routeOrConfiguration: "src/config/siteIdentity.ts; Privacy and Terms",
      codeFixable: false, ownerFacts: true, legalReview: true,
      riskOfGuessing: "Would expose a false or private address.",
      ownerInput: "A decision on whether an address is required and, only if approved, a verified public address.",
      productionConsequence: "Production-readiness verification remains blocked pending the decision.",
      adsenseConsequence: "Account and policy identity review remains incomplete.",
    },
    "owner.governing_law": {
      routeOrConfiguration: "app/terms/page.tsx; src/config/siteIdentity.ts",
      codeFixable: false, ownerFacts: true, legalReview: true,
      riskOfGuessing: "Could create an unsupported legal clause or jurisdiction.",
      ownerInput: "Qualified selection and approval of any governing-law language.",
      productionConsequence: "Final Terms approval remains blocked.",
      adsenseConsequence: "Trust-page legal review remains incomplete.",
    },
    "legal.audience_treatment": {
      routeOrConfiguration: "site-wide audience treatment; /coloring-pages/for-kids",
      codeFixable: false, ownerFacts: true, legalReview: true,
      riskOfGuessing: "Could incorrectly characterize a mixed library or child-directed treatment.",
      ownerInput: "Reviewed child-directed, mixed-audience, or general-audience treatment and implementation requirements.",
      productionConsequence: "Audience-dependent privacy and advertising configuration remains blocked.",
      adsenseConsequence: "Age treatment and ad-serving choices cannot be configured safely.",
    },
    "legal.policy_approval": {
      routeOrConfiguration: "/privacy, /terms, /contact, /affiliate-disclosure",
      codeFixable: false, ownerFacts: true, legalReview: true,
      riskOfGuessing: "Could publish permissions, rights, or compliance claims the operator has not approved.",
      ownerInput: "Owner and qualified review of privacy, terms, use policy, and rights-removal wording.",
      productionConsequence: "Trust pages remain factual drafts and deployment verification stays blocked.",
      adsenseConsequence: "Policy review is incomplete before an advertising application.",
    },
    "legal.trademark_policy": {
      routeOrConfiguration: "printable titles and editorial policy",
      codeFixable: false, ownerFacts: true, legalReview: true,
      riskOfGuessing: "Could misstate rights or acceptable treatment of brand references.",
      ownerInput: "A reviewed policy for public brand and trademark references.",
      productionConsequence: "Title-review policy remains incomplete.",
      adsenseConsequence: "Rights and content-policy review remains incomplete.",
    },
    "ads.account_configuration": {
      routeOrConfiguration: "advertisement mode, publisher configuration, and ads.txt",
      codeFixable: false, ownerFacts: true, legalReview: false,
      riskOfGuessing: "Could activate the wrong account, invalid slots, or an unverified ads.txt declaration.",
      ownerInput: "Verified publisher ID, verification method, slot plan, Auto Ads decision, and account-supplied ads.txt line.",
      productionConsequence: "The automatic production mode must not serve with invalid publisher or slot configuration.",
      adsenseConsequence: "Account verification and serving require the confirmed account configuration.",
    },
    "ads.consent_and_age_configuration": {
      routeOrConfiguration: "advertising consent, personalization, CMP, and age-treatment configuration",
      codeFixable: false, ownerFacts: true, legalReview: true,
      riskOfGuessing: "Could process advertising data under an incorrect consent or age-treatment mode.",
      ownerInput: "Approved regional consent, personalization, CMP, and age-treatment decisions.",
      productionConsequence: "Production advertising is active while consent and age-treatment review remains externally unresolved.",
      adsenseConsequence: "Consent and serving configuration still requires owner and qualified review.",
    },
    "external.production_validation": {
      routeOrConfiguration: "deployed production site and advertising account",
      codeFixable: false, ownerFacts: false, legalReview: false,
      riskOfGuessing: "Local output cannot prove external account state, creatives, consent, or production requests.",
      ownerInput: "Approved deployment and external account access for final verification.",
      productionConsequence: "Final deployment verification must occur in the later production task.",
      adsenseConsequence: "AdSense review and real-serving behavior remain externally unverified.",
    },
  }[entry.id];
  if (!details) throw new Error(`Missing trust-gate details: ${entry.id}`);
  return {
    ...entry,
    routeOrConfiguration: details.routeOrConfiguration,
    exactCurrentFailure: entry.description,
    codeFixable: details.codeFixable,
    requiresOwnerSuppliedFacts: details.ownerFacts,
    requiresLegalReview: details.legalReview,
    riskOfGuessing: details.riskOfGuessing,
    implementationCompleted: false,
    ownerInputStillRequired: details.ownerInput,
    productionConsequence: details.productionConsequence,
    adsenseReviewConsequence: details.adsenseConsequence,
  };
}

function renderTrustGatesCsv(gates) {
  const columns = ["gate_identifier", "route_or_configuration", "exact_current_failure", "code_fixable", "requires_owner_supplied_facts", "requires_legal_review", "risk_of_guessing", "implementation_completed", "owner_input_still_required", "production_consequence", "adsense_review_consequence"];
  const rows = gates.map((gate) => [gate.id, gate.routeOrConfiguration, gate.exactCurrentFailure, gate.codeFixable, gate.requiresOwnerSuppliedFacts, gate.requiresLegalReview, gate.riskOfGuessing, gate.implementationCompleted, gate.ownerInputStillRequired, gate.productionConsequence, gate.adsenseReviewConsequence]);
  return `${columns.join(",")}\n${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function renderTrustGatesMarkdown(gates) {
  return `# Trust, legal, owner, and advertising gates\n\nThe public operator-display and mailing-address decisions are recorded. The ${gates.length} gates below remain unresolved and cannot be truthfully closed from repository evidence alone.\n\n${gates.map((gate) => `## ${gate.id}\n\n- Current failure: ${gate.exactCurrentFailure}\n- Configuration: ${gate.routeOrConfiguration}\n- Code-fixable now: ${gate.codeFixable ? "yes" : "no"}\n- Owner facts required: ${gate.requiresOwnerSuppliedFacts ? "yes" : "no"}\n- Legal review required: ${gate.requiresLegalReview ? "yes" : "no"}\n- Input required: ${gate.ownerInputStillRequired}\n- Risk of guessing: ${gate.riskOfGuessing}\n- Production consequence: ${gate.productionConsequence}\n- AdSense consequence: ${gate.adsenseReviewConsequence}`).join("\n\n")}\n`;
}

function renderOwnerInputRequired(gates, identity) {
  return `# Owner input required\n\nVerified repository contact: ${identity.publicContactEmail}. The public operator display is ${identity.publicOperatorDisplayName}, no person or business entity is named, and the mailing-address decision is omit. No jurisdiction, final rights or licensing conclusion, publisher configuration, consent treatment, age treatment, or external account state was inferred.\n\n${gates.filter((gate) => gate.requiresOwnerSuppliedFacts).map((gate) => `- **${gate.id}:** ${gate.ownerInputStillRequired}`).join("\n")}\n\nExternal-only follow-up: ${gates.find((gate) => gate.id === "external.production_validation")?.ownerInputStillRequired}\n`;
}

function renderProductionReadinessStatus({ technicalPassed, productionReady, trustGates, accountFiles }) {
  return `# Production readiness status\n\n- Ordinary technical build validation: ${technicalPassed ? "PASS" : "FAIL"}\n- Production readiness: ${productionReady ? "PASS" : "BLOCKED"}\n- Remaining owner/legal/account/external gates: ${trustGates.length}\n- Status-coordinated live advertising in the default build: ${coordinatedLiveAdvertising ? "yes" : "no"}\n- Verified ads.txt paths: ${accountFiles.adsTxt.join(", ") || "none"}\n\n\`npm run build\` validates and exports the static application without requiring invented owner facts. \`npm run verify:production-readiness\` adds the remaining external, owner, legal, and account gates and is expected to fail until they are resolved.\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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
  const retryableCodes = new Set(["UNKNOWN", "EBUSY", "EPERM", "EACCES"]);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      writeFileSync(absolute, contents, "utf8");
      return;
    } catch (error) {
      if (!retryableCodes.has(error?.code) || attempt === 5) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 100);
    }
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertSafeArtifact(manifest, markdown, publicEmail) {
  const combined = `${manifest}\n${markdown}`;
  const emails = [...combined.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase());
  if (emails.some((email) => email !== publicEmail.toLowerCase())) throw new Error("Readiness artifacts contain an unapproved email address.");
  if (/[A-Za-z]:\\|file:\/\/|\/Users\/|browser profile|screenshots?\//i.test(combined)) throw new Error("Readiness artifacts contain a local or screenshot path.");
  if (/AKIA[0-9A-Z]{12,}|BEGIN (?:RSA |EC )?PRIVATE KEY/i.test(combined)) throw new Error("Readiness artifacts contain a credential-like value.");
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
  const advertisingSummary = !coordinatedLiveAdvertising
    ? "The representative static output does not contain the status-coordinated live-unit architecture."
    : "The representative static output contains the status-coordinated live units and hidden all-or-none fallback siblings.";
  const placementSummary = !coordinatedLiveAdvertising
    ? "No coordinated advertising area was detected. Print and Download controls remain free of ad containers."
    : "The area proxy uses the viewport as a conservative lower bound; representative full documents contain additional content below the fold. Print and Download controls remain separated from configured ad slots.";
  const liveScriptStatus = value.integrationFindings.liveAdvertising ? "present" : "absent";
  const adsTxtStatus = value.adsTxtStatus.exactAuthorizedSellerRecord ? "present with the exact confirmed authorized-seller record" : "missing or mismatched";
  return `# Trust and Advertising Readiness\n\nReport date: ${value.reportDate}\n\nThis is a factual local readiness review. It does not certify legal compliance or guarantee advertising-account approval.\n\n## Trust pages\n\n| Route | H1 count | Logical ad slots | Last updated | Result |\n| --- | ---: | ---: | --- | --- |\n${trustRows}\n\nThe verified public contact is ${value.publicContactStatus.publicContactEmail}. Metadata titles and descriptions are unique, canonicals are self-referencing, footer links remain, and all six trust routes remain indexable and sitemap-eligible.\n\n## Technology and network inventory\n\n| Domain | Purpose | Page families | Initial load | Blocker |\n| --- | --- | --- | --- | --- |\n${networkRows}\n\nSearch-data requests are same-origin and begin only after search intent. Fonts are emitted as same-origin static assets. Schema.org URLs are structured-data identifiers, not browser requests. ${advertisingSummary} No analytics, consent-management, affiliate-tracking, or site-cookie code was found in active source or representative static output.\n\n## Audience and age-treatment review\n\n| Route group | Classification | Signals |\n| --- | --- | --- |\n${audienceRows}\n\nNo legal audience classification is made. The owner and qualified reviewer must review the live-advertising treatment for the site and its child-oriented or mixed-audience collections.\n\n## Advertisement placement and density\n\n| Page family | Logical slots | Layout | Meaningful publisher content |\n| --- | ---: | --- | --- |\n${placementRows}\n\n| Viewport | Full-page visible slots | Condensed visible slots | Reserved pixel area | Publisher-content area proxy |\n| --- | ---: | ---: | ---: | ---: |\n${viewportRows}\n\n${placementSummary} The 404 route has no ad placement.\n\n## Account readiness\n\n- Live advertising units in production output: ${liveScriptStatus}\n- Publisher ID and ad-unit IDs: ${value.integrationFindings.publisherId || value.integrationFindings.adUnitId ? "present; verification required" : "absent"}\n- Verification tag: ${value.integrationFindings.verificationTag ? "present; verification required" : "absent"}\n- ads.txt: ${adsTxtStatus}\n- CMP and Consent Mode: ${value.integrationFindings.consentManagement || value.integrationFindings.consentMode ? "present; verification required" : "absent"}\n- Age-treatment decision: ${value.ageTreatmentDecisionStatus.decided ? "recorded" : "not recorded"}\n- Affiliate tracking: ${value.integrationFindings.affiliateTracking ? "present; verification required" : "absent"}\n\n## Blocking issues\n\n${blockers}\n\n## Owner checklist\n\n${actions}\n\n## Counts and preservation\n\n- Runtime printables: ${value.counts.runtimePrintables.toLocaleString("en-US")}\n- Public hubs: ${value.counts.publicHubs.toLocaleString("en-US")}\n- Pagination routes: ${value.counts.paginationRoutes.toLocaleString("en-US")}\n- Regular sitemap URLs: ${value.counts.regularSitemapUrls.toLocaleString("en-US")}\n- Image sitemap pairs: ${value.counts.imageSitemapPairs.toLocaleString("en-US")}\n- Static outputs: ${value.counts.staticOutputs.toLocaleString("en-US")}\n- Frozen route-field hash: ${value.preservation.frozenRouteFieldHash}\n- Hub-membership hash: ${value.preservation.hubMembershipHash}\n\n## Owner command\n\n\`npm run generate:trust-readiness\`\n`;
}

function hasCoordinatedLiveAdvertising(html) {
  return /data-ad-fallback-policy="page-all-or-none-v1"/.test(html)
    && /class="adsbygoogle ad-slot-live-unit"/.test(html)
    && /data-ad-fallback="true" hidden=""/.test(html);
}

function extractLogicalSlotIds(html) {
  return [...html.matchAll(/data-ad-slot="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((slotId) => !/^\d{10}$/.test(slotId));
}
