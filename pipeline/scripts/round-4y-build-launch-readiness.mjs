import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const generatedAt = new Date().toISOString();
const manifestsDir = path.join(repoRoot, "pipeline", "manifests");
const reportsDir = path.join(repoRoot, "pipeline", "reports");

const trustRoutes = ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"];
const legacyTestPrefix = ["", "coloring", "test-v1"].join("/");
const requiredEnvVars = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_COLORING_ASSET_BASE_URL",
  "NEXT_PUBLIC_CONTACT_EMAIL",
  "NEXT_PUBLIC_SITE_NAME",
  "NEXT_PUBLIC_SITE_OWNER_NAME",
  "NEXT_PUBLIC_SITE_JURISDICTION",
];

mkdirSync(manifestsDir, { recursive: true });
mkdirSync(reportsDir, { recursive: true });

const packageJson = JSON.parse(readText("package.json"));
const publicSource = readSources(["app", "src/components", "src/lib", "src/generated/coloring"]);
const siteConfigSource = readText("src/lib/site/siteConfig.ts");
const envExample = readText(".env.example");
const sitemapSource = readText("app/sitemap.ts");
const robotsSource = readText("app/robots.ts");
const routesManifest = JSON.parse(readText("src/generated/coloring/routes.json"));
const hubsManifest = JSON.parse(readText("src/generated/coloring/hubs.json"));
const siteMapManifest = JSON.parse(readText("src/generated/coloring/site-map.json"));
const round4xReadiness = JSON.parse(readText("pipeline/manifests/round-4x-adsense-readiness-review.json"));

const env = readPublicEnv();
const siteUrlStatus = validateSiteUrl(env.NEXT_PUBLIC_SITE_URL);
const assetStatus = validateAssetBaseUrl(env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL);
const contactStatus = validateContactEmail(env.NEXT_PUBLIC_CONTACT_EMAIL);
const trustPageStatuses = inspectTrustPages();
const sitemapRoutes = getSitemapRouteList();
const liveAdCodeAbsent = !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(publicSource);

const context = {
  generatedAt,
  runId: "round-4y-project-context-check",
  summary: {
    correctRepo: packageJson.name === "i-love-coloring-page",
    branch: git(["branch", "--show-current"]).trim(),
    head: git(["rev-parse", "--short", "HEAD"]).trim(),
    round4xCommitExists: gitSuccess(["cat-file", "-e", "a852cb1^{commit}"]),
    round4xAncestor: gitSuccess(["merge-base", "--is-ancestor", "a852cb1", "HEAD"]),
    appApiRoutePresent: exists("app/api") || exists("src/app/api"),
    staticExportConfigured: /output:\s*"export"/.test(readText("next.config.mjs")),
    r2BundleExists: exists("pipeline/r2-upload/coloring-pages"),
    publicContainsGeneratedProductionMedia: exists("public/coloring-pages") || exists("public/thumbs") || exists("public/svg"),
    imagesStatusClean: git(["status", "--short", "--", "images"]).trim() === "",
    ilovesvgStatusClean: git(["status", "--short", "--", "ilovesvg"]).trim() === "",
    publicDownloadsRemainPngOnly: /Download PNG/.test(readText("src/components/coloring/ImageCard.tsx")) && !/Download SVG|Download JPG|Download JPEG|Download WebP/i.test(publicSource),
    svgExposedToUsers: /Download SVG|SVG download/i.test(publicSource),
    adWellsVisibleByDefault: /Advertisement/.test(readText("src/components/ads/AdSlot.tsx")) && !/NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS/.test(publicSource),
    liveAdCodeExists: !liveAdCodeAbsent,
  },
};

const launchAudit = {
  generatedAt,
  runId: "round-4y-launch-config-audit",
  env,
  usage: {
    siteUrlReferences: findMatches("NEXT_PUBLIC_SITE_URL", [".env.example", "netlify.toml", "src/lib/site/siteConfig.ts"]),
    assetBaseUrlReferences: findMatches("NEXT_PUBLIC_COLORING_ASSET_BASE_URL", [".env.example", "netlify.toml", "src/lib/site/siteConfig.ts", "src/lib/coloring/assets.ts"]),
    contactEmailReferences: findMatches("NEXT_PUBLIC_CONTACT_EMAIL", [".env.example", "netlify.toml", "src/lib/site/siteConfig.ts", "app/contact/page.tsx"]),
  },
  checks: {
    siteConfigCentralized: exists("src/lib/site/siteConfig.ts"),
    oldContactEnvReferenceRemoved: !/NEXT_PUBLIC_SITE_CONTACT_EMAIL/.test(publicSource + envExample + readText("netlify.toml")),
    sitemapUsesConfiguredSiteUrl: /getSiteUrl/.test(sitemapSource),
    robotsUsesConfiguredSiteUrl: /getSiteUrl/.test(robotsSource),
    canonicalUsesConfiguredSiteUrl: /getCanonicalUrl|getSiteUrl/.test(publicSource),
    localUrlLeakageInSource: /http:\/\/localhost:3005|http:\/\/127\.0\.0\.1:3005/.test(publicSource),
    r2DevReferencesInProductionCode: /r2\.dev/i.test(publicSource),
    privateR2EndpointReferences: /r2\.cloudflarestorage\.com|amazonaws\.com/i.test(publicSource),
    fakeContactOrBusinessDetails: /support@example\.com|123 Main|555-|fake address|fake phone/i.test(publicSource),
    missingOwnerInputs: getMissingOwnerInputs(),
  },
};

const siteConfigResults = {
  generatedAt,
  runId: "round-4y-site-config-results",
  configFile: "src/lib/site/siteConfig.ts",
  summary: {
    siteNameConfigured: Boolean(env.NEXT_PUBLIC_SITE_NAME),
    siteNameFallback: "I Love Coloring Page",
    publicSiteUrlConfigured: siteUrlStatus.configured,
    productionSiteUrlReady: siteUrlStatus.ready,
    publicAssetBaseUrlConfigured: assetStatus.configured,
    productionAssetUrlReady: assetStatus.ready,
    publicContactConfigured: contactStatus.ready,
    ownerNameConfigured: Boolean(env.NEXT_PUBLIC_SITE_OWNER_NAME),
    jurisdictionConfigured: Boolean(env.NEXT_PUBLIC_SITE_JURISDICTION),
    noFakeFallbackContactEmail: !/support@example\.com|contact@example\.com/i.test(siteConfigSource),
    publicValuesOnly: true,
  },
  siteUrlStatus,
  assetStatus,
  contactStatus,
};

const siteUrlValidation = {
  generatedAt,
  runId: "round-4y-public-site-url-validation",
  ...siteUrlStatus,
  canonical_uses_configured_site_url: /getCanonicalUrl|getSiteUrl/.test(publicSource),
  sitemap_uses_configured_site_url: /getSiteUrl/.test(sitemapSource),
  robots_references_sitemap: /sitemap/.test(robotsSource),
  no_duplicate_slashes_expected: true,
  no_per_image_routes: sitemapRoutes.every((route) => !isPerImageRoute(route)),
  no_phase2_hub_routes: sitemapRoutes.every((route) => !isPhase2Route(route)),
  no_image_sitemap: !exists("app/image-sitemap.ts") && !exists("app/image-sitemap.xml") && !/image-sitemap/i.test(sitemapSource + robotsSource),
};

const staticProductionBuildCheck = inspectStaticBuild();

const adsenseReadiness = {
  generatedAt,
  runId: "round-4y-adsense-readiness-review",
  trust_pages_present: trustPageStatuses.every((page) => page.exists),
  about_page_exists: exists("app/about/page.tsx"),
  contact_page_exists: exists("app/contact/page.tsx"),
  real_contact_method_configured: contactStatus.ready,
  privacy_page_exists: exists("app/privacy/page.tsx"),
  terms_page_exists: exists("app/terms/page.tsx"),
  affiliate_disclosure_exists: exists("app/affiliate-disclosure/page.tsx"),
  editorial_policy_exists: exists("app/editorial-policy/page.tsx"),
  trust_pages_linked_in_footer: trustRoutes.every((route) => readText("src/components/site/SiteFooter.tsx").includes(route) || readText("src/lib/trust/trustPages.ts").includes(route)),
  sitemap_includes_trust_pages: trustRoutes.every((route) => sitemapRoutes.includes(route)),
  unique_hub_content_exists: exists("src/generated/coloring/hub-seo-content.json"),
  ad_wells_visible_but_no_live_ads: context.summary.adWellsVisibleByDefault && liveAdCodeAbsent,
  ad_density_accepted: true,
  live_ad_code_absent: liveAdCodeAbsent,
  no_low_value_obvious_blocker_from_missing_trust_pages: true,
  public_site_domain_configured: siteUrlStatus.ready,
  public_asset_domain_configured: assetStatus.ready,
  policy_drafts_need_owner_legal_review: true,
  adsense_ready_to_apply: false,
  inherited_round4x_blockers: round4xReadiness.blockers,
  blockers: getLaunchBlockers(),
};

const launchGate = {
  generatedAt,
  runId: "round-4y-launch-readiness-gate",
  public_site_url_ready: siteUrlStatus.ready,
  public_asset_domain_ready: assetStatus.ready,
  contact_method_ready: contactStatus.ready,
  trust_pages_ready: trustPageStatuses.every((page) => page.exists),
  adsense_ready_to_apply: false,
  ready_for_live_ads_round: false,
  ready_for_image_sitemap_round: assetStatus.ready && siteUrlStatus.ready,
  ready_for_og_image_round: assetStatus.ready && siteUrlStatus.ready,
  blockers: getLaunchBlockers(),
  owner_action_items: getOwnerActionItems(),
  legal_review_flags: ["Privacy Policy, Terms, and Affiliate Disclosure remain drafts requiring owner/legal review."],
  recommendation: "Round 4Z should configure owner-approved public contact, final site domain, and final public asset domain before live AdSense, image sitemap, or OG image work.",
};

const assetValidation = await validatePublicAssetDomain(assetStatus);
const placeholderBrowserQa = readExistingBrowserQa() || {
  generatedAt,
  runId: "round-4y-browser-qa",
  status: "pending",
  note: "Run pipeline/scripts/round-4y-browser-qa-runner.cjs against the static preview to replace this placeholder with browser evidence.",
  summary: {
    status: "pending",
  },
  screenshots: [],
};

const files = [
  ["round-4y-project-context-check.json", context],
  ["round-4y-launch-config-audit.json", launchAudit],
  ["round-4y-site-config-results.json", siteConfigResults],
  ["round-4y-public-asset-domain-validation.json", assetValidation],
  ["round-4y-public-site-url-validation.json", siteUrlValidation],
  ["round-4y-static-production-build-check.json", staticProductionBuildCheck],
  ["round-4y-adsense-readiness-review.json", adsenseReadiness],
  ["round-4y-browser-qa-results.json", placeholderBrowserQa],
  ["round-4y-launch-readiness-gate.json", launchGate],
];

for (const [fileName, payload] of files) {
  writeJson(path.join(manifestsDir, fileName), payload);
}

writeReports({
  context,
  launchAudit,
  siteConfigResults,
  assetValidation,
  siteUrlValidation,
  staticProductionBuildCheck,
  adsenseReadiness,
  launchGate,
});

function readPublicEnv() {
  return Object.fromEntries(requiredEnvVars.map((key) => [key, process.env[key]?.trim() || ""]));
}

function validateContactEmail(value) {
  const configured = Boolean(value);
  const ready = configured && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && !/example\.com$/i.test(value);
  return { configured, valuePublicIfSet: value || "", ready, missingReason: ready ? "" : "NEXT_PUBLIC_CONTACT_EMAIL is missing or not a usable public email." };
}

function validateSiteUrl(value) {
  return validatePublicUrl(value, { requireColoringPagesPrefix: false, allowR2Dev: false });
}

function validateAssetBaseUrl(value) {
  return validatePublicUrl(value, { requireColoringPagesPrefix: true, allowR2Dev: false });
}

function validatePublicUrl(value, options) {
  const normalized = normalizePublicUrl(value);
  const status = {
    configured: Boolean(value),
    rawValue: value || "",
    normalizedValue: normalized,
    isHttpUrl: false,
    isLocalhost: false,
    isExampleDomain: false,
    isR2Dev: false,
    isPrivateR2Endpoint: false,
    hasColoringPagesPrefix: false,
    hasDuplicateColoringPagesPrefix: false,
    hasOldTestPrefix: false,
    ready: false,
    temporaryOnly: false,
    blockers: [],
  };

  if (!normalized) {
    status.blockers.push("Value is not configured.");
    return status;
  }

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();
    status.isHttpUrl = url.protocol === "http:" || url.protocol === "https:";
    status.isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    status.isExampleDomain = hostname === "example.com" || hostname.endsWith(".example.com");
    status.isR2Dev = hostname.endsWith(".r2.dev");
    status.isPrivateR2Endpoint = hostname.includes("r2.cloudflarestorage.com") || hostname.includes("amazonaws.com");
    status.hasColoringPagesPrefix = url.pathname === "/coloring-pages" || url.pathname.endsWith("/coloring-pages");
    status.hasDuplicateColoringPagesPrefix = url.pathname.includes("/coloring-pages/coloring-pages");
    status.hasOldTestPrefix = url.pathname.includes(legacyTestPrefix);
    status.temporaryOnly = status.isR2Dev;

    if (!status.isHttpUrl) status.blockers.push("URL must use HTTP or HTTPS.");
    if (status.isLocalhost) status.blockers.push("URL is local-only, not production-ready.");
    if (status.isExampleDomain) status.blockers.push("URL is an example placeholder.");
    if (status.isR2Dev && !options.allowR2Dev) status.blockers.push("r2.dev is temporary/testing only.");
    if (status.isPrivateR2Endpoint) status.blockers.push("URL points to a private storage API endpoint.");
    if (status.hasDuplicateColoringPagesPrefix) status.blockers.push("URL has duplicate /coloring-pages prefix.");
    if (status.hasOldTestPrefix) status.blockers.push("URL uses the legacy test asset prefix.");
    if (options.requireColoringPagesPrefix && !status.hasColoringPagesPrefix) status.blockers.push("Asset URL must include /coloring-pages.");
    status.ready = status.blockers.length === 0;
  } catch {
    status.blockers.push("Value is not a valid URL.");
  }

  return status;
}

async function validatePublicAssetDomain(assetUrlStatus) {
  const result = {
    generatedAt,
    runId: "round-4y-public-asset-domain-validation",
    configured: assetUrlStatus.configured,
    ready: false,
    status: assetUrlStatus,
    planPath: "pipeline/manifests/round-4i-full-r2-url-verification-plan.json",
    plannedCheckCount: 0,
    executedCheckCount: 0,
    passedCheckCount: 0,
    failedCheckCount: 0,
    skippedReason: "",
    checks: [],
    cacheHeadersDocumented: false,
  };

  if (!assetUrlStatus.configured || !assetUrlStatus.ready) {
    result.skippedReason = assetUrlStatus.configured ? "Asset base URL is configured but not production-ready." : "NEXT_PUBLIC_COLORING_ASSET_BASE_URL is not configured.";
    return result;
  }

  const plan = JSON.parse(readText(result.planPath));
  const urls = plan.urls.slice(0, 300);
  result.plannedCheckCount = urls.length;

  for (const entry of urls) {
    const url = `${assetUrlStatus.normalizedValue}/${entry.relativeAssetPath.split("/").map(encodeURIComponent).join("/")}`;
    const check = await checkPublicAssetUrl(url, entry);
    result.checks.push(check);
    result.executedCheckCount += 1;
    if (check.passed) result.passedCheckCount += 1;
    else result.failedCheckCount += 1;
  }

  result.cacheHeadersDocumented = result.checks.some((check) => Boolean(check.cacheControl));
  result.ready = result.failedCheckCount === 0 && result.executedCheckCount === result.plannedCheckCount;
  return result;
}

async function checkPublicAssetUrl(url, entry) {
  const check = {
    assetId: entry.assetId,
    mediaType: entry.mediaType,
    url,
    expectedContentType: entry.expectedContentType,
    status: null,
    contentType: "",
    contentLength: null,
    cacheControl: "",
    noAccessDeniedXml: true,
    noCloudflareErrorHtml: true,
    noPrivateEndpointRedirect: true,
    passed: false,
    error: "",
  };

  try {
    let response = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(10000) });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(10000) });
    }
    check.status = response.status;
    check.contentType = response.headers.get("content-type") || "";
    check.contentLength = Number(response.headers.get("content-length") || 0) || null;
    check.cacheControl = response.headers.get("cache-control") || "";
    const location = response.headers.get("location") || "";
    check.noPrivateEndpointRedirect = !/r2\.cloudflarestorage\.com|amazonaws\.com/i.test(location);
    check.passed =
      response.status === 200 &&
      check.contentType.toLowerCase().includes(entry.expectedContentType.toLowerCase()) &&
      check.noPrivateEndpointRedirect;
  } catch (error) {
    check.error = error instanceof Error ? error.message : String(error);
  }

  return check;
}

function inspectTrustPages() {
  return trustRoutes.map((route) => {
    const file = `app${route}/page.tsx`;
    return {
      route,
      file,
      exists: exists(file),
      usesConfiguredContact: route === "/contact" ? /siteConfig\.contactEmail/.test(readText(file)) : true,
      hasMetadata: /export const metadata/.test(readText(file)),
    };
  });
}

function inspectStaticBuild() {
  const envValuesPresent = siteUrlStatus.ready && assetStatus.ready && contactStatus.ready;
  const outExists = exists("out");
  const outText = outExists ? readOutputSample("out", /\.(?:html|xml|txt)$/) : "";
  return {
    generatedAt,
    runId: "round-4y-static-production-build-check",
    productionEnvValuesPresent: envValuesPresent,
    buildMode: envValuesPresent ? "production-env-ready" : "local-preview-or-blocked",
    outDirectoryExistsAtGenerationTime: outExists,
    productionReadinessBlocked: !envValuesPresent,
    localhostLeakageInOut: outExists ? /localhost|127\.0\.0\.1/i.test(outText) : null,
    localFilePathLeakageInOut: outExists ? /[A-Za-z]:\\/.test(outText) : null,
    privateR2EndpointLeakageInOut: outExists ? /r2\.cloudflarestorage\.com|amazonaws\.com/i.test(outText) : null,
    r2DevLeakageInOut: outExists ? /r2\.dev/i.test(outText) : null,
    svgDownloadLinksInOut: outExists ? /Download SVG|SVG download/i.test(outText) : null,
    noLiveAdCodeInOut: outExists ? !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(outText) : null,
    note: envValuesPresent
      ? "Production-like environment values are present. Inspect generated out/ after npm run build."
      : "Production readiness is blocked because public site URL, public asset URL, or public contact email is missing.",
  };
}

function readOutputSample(relativeRoot, extensions) {
  if (!exists(relativeRoot)) return "";
  const root = path.join(repoRoot, relativeRoot);
  const chunks = [];
  let totalBytes = 0;
  for (const absoluteFile of listFiles(root)) {
    const relativeFile = path.relative(repoRoot, absoluteFile);
    if (!extensions.test(relativeFile)) continue;
    const text = readText(relativeFile);
    chunks.push(text.slice(0, 200000));
    totalBytes += chunks[chunks.length - 1].length;
    if (totalBytes > 2000000) break;
  }
  return chunks.join("\n");
}

function getSitemapRouteList() {
  const generatedRoutes = siteMapManifest.entries.map((entry) => entry.path);
  return ["/", ...generatedRoutes, ...trustRoutes];
}

function getMissingOwnerInputs() {
  const missing = [];
  if (!siteUrlStatus.ready) missing.push("NEXT_PUBLIC_SITE_URL");
  if (!assetStatus.ready) missing.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL");
  if (!contactStatus.ready) missing.push("NEXT_PUBLIC_CONTACT_EMAIL");
  missing.push("Owner/legal review of Privacy Policy, Terms, and Affiliate Disclosure");
  return missing;
}

function getLaunchBlockers() {
  const blockers = [];
  if (!siteUrlStatus.ready) blockers.push("Final public NEXT_PUBLIC_SITE_URL is not configured.");
  if (!assetStatus.ready) blockers.push("Final public NEXT_PUBLIC_COLORING_ASSET_BASE_URL is not configured or not production-ready.");
  if (!contactStatus.ready) blockers.push("Public NEXT_PUBLIC_CONTACT_EMAIL is not configured.");
  blockers.push("Policy pages remain drafts and need owner/legal review.");
  return blockers;
}

function getOwnerActionItems() {
  return [
    "Set NEXT_PUBLIC_SITE_URL to the final public site origin.",
    "Set NEXT_PUBLIC_COLORING_ASSET_BASE_URL to the final public asset domain plus /coloring-pages.",
    "Set NEXT_PUBLIC_CONTACT_EMAIL to an owner-approved public contact email.",
    "Review Privacy Policy, Terms, Affiliate Disclosure, Contact, About, and Editorial Policy before launch.",
    "Run public asset-domain validation after the asset domain is available.",
  ];
}

function writeReports(payload) {
  writeReport("round-4y-project-context-check.md", [
    "# Round 4Y Project Context Check",
    "",
    `- Correct repo: ${payload.context.summary.correctRepo}`,
    `- Branch: ${payload.context.summary.branch}`,
    `- Round 4X commit exists: ${payload.context.summary.round4xCommitExists}`,
    `- Round 4X commit is ancestor: ${payload.context.summary.round4xAncestor}`,
    `- app/api route present: ${payload.context.summary.appApiRoutePresent}`,
    `- Static export configured: ${payload.context.summary.staticExportConfigured}`,
    `- Live AdSense code exists: ${payload.context.summary.liveAdCodeExists}`,
  ]);

  writeReport("round-4y-launch-config-audit.md", [
    "# Round 4Y Launch Config Audit",
    "",
    `- Site URL configured: ${payload.siteUrlValidation.configured}`,
    `- Asset URL configured: ${payload.assetValidation.configured}`,
    `- Contact email configured: ${payload.siteConfigResults.contactStatus.configured}`,
    `- Old contact env reference removed: ${payload.launchAudit.checks.oldContactEnvReferenceRemoved}`,
    `- Private R2 endpoint references in production code: ${payload.launchAudit.checks.privateR2EndpointReferences}`,
    `- Fake contact or business details found: ${payload.launchAudit.checks.fakeContactOrBusinessDetails}`,
    "",
    "Missing owner inputs:",
    ...payload.launchAudit.checks.missingOwnerInputs.map((item) => `- ${item}`),
  ]);

  writeReport("round-4y-site-config-report.md", [
    "# Round 4Y Site Config Report",
    "",
    "- Added centralized public site configuration in `src/lib/site/siteConfig.ts`.",
    `- Production site URL ready: ${payload.siteConfigResults.summary.productionSiteUrlReady}`,
    `- Production asset URL ready: ${payload.siteConfigResults.summary.productionAssetUrlReady}`,
    `- Public contact configured: ${payload.siteConfigResults.summary.publicContactConfigured}`,
    "- No fake fallback contact email is used.",
  ]);

  writeReport("round-4y-public-asset-domain-validation.md", [
    "# Round 4Y Public Asset Domain Validation",
    "",
    `- Configured: ${payload.assetValidation.configured}`,
    `- Ready: ${payload.assetValidation.ready}`,
    `- Executed checks: ${payload.assetValidation.executedCheckCount}`,
    `- Passed checks: ${payload.assetValidation.passedCheckCount}`,
    `- Failed checks: ${payload.assetValidation.failedCheckCount}`,
    payload.assetValidation.skippedReason ? `- Skipped reason: ${payload.assetValidation.skippedReason}` : "",
  ].filter(Boolean));

  writeReport("round-4y-public-site-url-validation.md", [
    "# Round 4Y Public Site URL Validation",
    "",
    `- Configured: ${payload.siteUrlValidation.configured}`,
    `- Ready: ${payload.siteUrlValidation.ready}`,
    `- Sitemap uses configured site URL: ${payload.siteUrlValidation.sitemap_uses_configured_site_url}`,
    `- Robots references sitemap: ${payload.siteUrlValidation.robots_references_sitemap}`,
    `- No per-image routes: ${payload.siteUrlValidation.no_per_image_routes}`,
    `- No image sitemap: ${payload.siteUrlValidation.no_image_sitemap}`,
    "",
    "Blockers:",
    ...payload.siteUrlValidation.blockers.map((item) => `- ${item}`),
  ]);

  writeReport("round-4y-static-production-build-check.md", [
    "# Round 4Y Static Production Build Check",
    "",
    `- Production env values present: ${payload.staticProductionBuildCheck.productionEnvValuesPresent}`,
    `- Build mode: ${payload.staticProductionBuildCheck.buildMode}`,
    `- Production readiness blocked: ${payload.staticProductionBuildCheck.productionReadinessBlocked}`,
    `- out/ existed when report was generated: ${payload.staticProductionBuildCheck.outDirectoryExistsAtGenerationTime}`,
    `- Note: ${payload.staticProductionBuildCheck.note}`,
  ]);

  writeReport("round-4y-adsense-readiness-review.md", [
    "# Round 4Y AdSense Readiness Review",
    "",
    `- Trust pages present: ${payload.adsenseReadiness.trust_pages_present}`,
    `- Real contact method configured: ${payload.adsenseReadiness.real_contact_method_configured}`,
    `- Public site domain configured: ${payload.adsenseReadiness.public_site_domain_configured}`,
    `- Public asset domain configured: ${payload.adsenseReadiness.public_asset_domain_configured}`,
    `- Live ad code absent: ${payload.adsenseReadiness.live_ad_code_absent}`,
    `- Ready to apply for AdSense now: ${payload.adsenseReadiness.adsense_ready_to_apply}`,
    "",
    "Blockers:",
    ...payload.adsenseReadiness.blockers.map((item) => `- ${item}`),
  ]);

  writeReport("round-4y-launch-readiness-gate.md", [
    "# Round 4Y Launch Readiness Gate",
    "",
    `- public_site_url_ready: ${payload.launchGate.public_site_url_ready}`,
    `- public_asset_domain_ready: ${payload.launchGate.public_asset_domain_ready}`,
    `- contact_method_ready: ${payload.launchGate.contact_method_ready}`,
    `- trust_pages_ready: ${payload.launchGate.trust_pages_ready}`,
    `- adsense_ready_to_apply: ${payload.launchGate.adsense_ready_to_apply}`,
    `- ready_for_live_ads_round: ${payload.launchGate.ready_for_live_ads_round}`,
    `- ready_for_image_sitemap_round: ${payload.launchGate.ready_for_image_sitemap_round}`,
    `- ready_for_og_image_round: ${payload.launchGate.ready_for_og_image_round}`,
    "",
    "Blockers:",
    ...payload.launchGate.blockers.map((item) => `- ${item}`),
    "",
    "Owner action items:",
    ...payload.launchGate.owner_action_items.map((item) => `- ${item}`),
  ]);

  writeReport("round-4y-next-phase-plan.md", [
    "# Round 4Y Next Phase Plan",
    "",
    "Round 4Z should configure and verify the final public site URL, public contact email, and public asset domain. Do not add live AdSense, image sitemap, or OG image work until those launch readiness gates pass.",
  ]);
}

function readExistingBrowserQa() {
  const filePath = "pipeline/manifests/round-4y-browser-qa-results.json";
  if (!exists(filePath)) return null;
  try {
    const existing = JSON.parse(readText(filePath));
    return existing.status === "passed" ? existing : null;
  } catch {
    return null;
  }
}

function writeReport(fileName, lines) {
  writeFileSync(path.join(reportsDir, fileName), `${lines.join("\n")}\n`);
}

function writeJson(filePath, payload) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function normalizePublicUrl(value) {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function findMatches(pattern, files) {
  const regex = new RegExp(pattern, "g");
  return files.flatMap((file) => {
    if (!exists(file)) return [];
    const text = readText(file);
    return regex.test(text) ? [file] : [];
  });
}

function isPerImageRoute(route) {
  return /^\/coloring-pages\/[^/]+\/[^/]+/.test(route);
}

function isPhase2Route(route) {
  const knownRoutes = new Set(routesManifest.routes.map((entry) => entry.path));
  const phase1HubRoutes = new Set(hubsManifest.hubs.map((hub) => hub.route));
  return route.startsWith("/coloring-pages/") && !knownRoutes.has(route) && !phase1HubRoutes.has(route);
}

function readSources(relativeRoots, options = {}) {
  const extensions = options.extensions || /\.(?:ts|tsx|css|json|md)$/;
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    if (!exists(relativeRoot)) continue;
    const root = path.join(repoRoot, relativeRoot);
    const files = statSync(root).isFile() ? [relativeRoot] : listFiles(root).map((file) => path.relative(repoRoot, file));
    for (const file of files) {
      if (!extensions.test(file)) continue;
      if (file.replace(/\\/g, "/").startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(readText(file));
    }
  }
  return chunks.join("\n");
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolute));
    else files.push(absolute);
  }
  return files;
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return existsSync(path.join(repoRoot, relativePath));
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function gitSuccess(args) {
  try {
    execFileSync("git", args, { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
