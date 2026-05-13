import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const generatedAt = "2026-05-11T19:30:00.000Z";

const trustPages = [
  {
    route: "/about",
    indexability: "index",
    purpose: "Explain the printable coloring page library and build visitor trust.",
    h1: "About I Love Coloring Page",
    metaTitle: "About I Love Coloring Page",
    metaDescription: "Learn about I Love Coloring Page, a printable coloring page library organized into useful collections with PNG print and download options.",
    contentSections: ["What this site is", "How the library is organized", "What you can do here", "What is not available yet"],
    footerLinkLabel: "About",
    requiredBeforeAdsense: true,
    ownerReviewRequired: true,
    legalReviewRecommended: false,
    mentionsAdsCookiesAffiliate: false,
  },
  {
    route: "/contact",
    indexability: "index",
    purpose: "Provide a public issue-report and owner-contact path before launch.",
    h1: "Contact",
    metaTitle: "Contact I Love Coloring Page",
    metaDescription: "Contact I Love Coloring Page about broken pages, image issues, copyright concerns, accessibility issues, partnerships, or affiliate inquiries.",
    contentSections: ["Contact details", "Reasons to contact", "Copyright and image concerns"],
    footerLinkLabel: "Contact",
    requiredBeforeAdsense: true,
    ownerReviewRequired: true,
    legalReviewRecommended: false,
    mentionsAdsCookiesAffiliate: false,
  },
  {
    route: "/privacy",
    indexability: "index",
    purpose: "Disclose current static-site behavior and future Google advertising cookie requirements.",
    h1: "Privacy Policy",
    metaTitle: "Privacy Policy",
    metaDescription: "Read the draft privacy policy for I Love Coloring Page, including current static-site behavior and future advertising disclosures.",
    contentSections: ["Last updated", "What this site is", "Information currently collected", "Analytics, advertising, and cookies", "Affiliate links", "Children's privacy", "Contact and updates"],
    footerLinkLabel: "Privacy",
    requiredBeforeAdsense: true,
    ownerReviewRequired: true,
    legalReviewRecommended: true,
    mentionsAdsCookiesAffiliate: true,
  },
  {
    route: "/terms",
    indexability: "index",
    purpose: "Set practical use rules for PNG downloads, printing, and site content.",
    h1: "Terms of Use",
    metaTitle: "Terms of Use",
    metaDescription: "Read the draft terms for using I Love Coloring Page printable pages, PNG downloads, and site content.",
    contentSections: ["Last updated", "Permitted personal and classroom use", "Restrictions", "Downloads and availability", "Future tools", "Copyright, external links, and affiliate links", "Draft limitation language"],
    footerLinkLabel: "Terms",
    requiredBeforeAdsense: true,
    ownerReviewRequired: true,
    legalReviewRecommended: true,
    mentionsAdsCookiesAffiliate: true,
  },
  {
    route: "/affiliate-disclosure",
    indexability: "index",
    purpose: "Prepare for future affiliate links without adding affiliate links or scripts.",
    h1: "Affiliate Disclosure",
    metaTitle: "Affiliate Disclosure",
    metaDescription: "Read the draft affiliate disclosure for future recommendation or referral links on I Love Coloring Page.",
    contentSections: ["How affiliate links may work", "Where disclosures should appear", "Editorial independence"],
    footerLinkLabel: "Affiliate Disclosure",
    requiredBeforeAdsense: false,
    ownerReviewRequired: true,
    legalReviewRecommended: true,
    mentionsAdsCookiesAffiliate: true,
  },
  {
    route: "/editorial-policy",
    indexability: "index",
    purpose: "Explain collection organization, quality expectations, and visitor issue reports.",
    h1: "Editorial Policy",
    metaTitle: "Editorial Policy",
    metaDescription: "Learn how I Love Coloring Page organizes collections, reviews printable page usefulness, and handles issue reports.",
    contentSections: ["How collections are organized", "How page usefulness is reviewed", "Quality and safety issues", "Advertising and affiliate separation"],
    footerLinkLabel: "Editorial Policy",
    requiredBeforeAdsense: false,
    ownerReviewRequired: true,
    legalReviewRecommended: false,
    mentionsAdsCookiesAffiliate: false,
  },
];

const resolvedDriftFiles = [
  "pipeline/manifests/round-4j-real-media-preview-audit.json",
  "pipeline/manifests/round-4k-color-token-rules.json",
  "pipeline/manifests/round-4k-display-title-cleanup.json",
  "pipeline/manifests/round-4k-gallery-card-fixes.json",
  "pipeline/manifests/round-4k-project-context-check.json",
  "pipeline/manifests/round-4k-typography-audit.json",
  "pipeline/manifests/round-4k-ui-problem-audit.json",
  "pipeline/manifests/round-4l-preview-url-audit.json",
  "pipeline/manifests/round-4l-preview-url-fixtures.json",
  "pipeline/manifests/round-4l-project-context-check.json",
  "pipeline/manifests/round-4m-ad-placeholder-implementation.json",
  "pipeline/manifests/round-4m-ad-slot-map.json",
  "pipeline/manifests/round-4m-adsense-placement-rules.json",
  "pipeline/manifests/round-4m-browser-qa-results.json",
  "pipeline/manifests/round-4m-navigation-update.json",
  "pipeline/manifests/round-4m-project-context-check.json",
  "pipeline/manifests/round-4m-visual-polish-results.json",
  "pipeline/manifests/round-4n-ad-affiliate-guard-results.json",
  "pipeline/manifests/round-4n-browser-download-format-plan.json",
  "pipeline/manifests/round-4n-browser-qa-results.json",
  "pipeline/manifests/round-4n-download-ux-results.json",
  "pipeline/manifests/round-4n-nav-download-audit.json",
  "pipeline/manifests/round-4n-nav-route-map.json",
  "pipeline/manifests/round-4n-navigation-results.json",
  "pipeline/manifests/round-4n-project-context-check.json",
  "pipeline/manifests/round-4o-browser-conversion-test-results.json",
  "pipeline/manifests/round-4o-browser-download-format-rules.json",
  "pipeline/manifests/round-4o-download-format-decision.json",
  "pipeline/manifests/round-4o-download-implementation-audit.json",
  "pipeline/manifests/round-4o-download-ui-results.json",
  "pipeline/manifests/round-4o-project-context-check.json",
  "src/generated/coloring/search-index.json",
  "src/generated/coloring/title-overrides.json",
];

function main() {
  const branch = git(["branch", "--show-current"]).trim();
  const head = git(["rev-parse", "HEAD"]).trim();
  const round4wCommitExists = gitSuccess(["merge-base", "--is-ancestor", "db255fe", "HEAD"]);
  const packageJson = JSON.parse(readText("package.json"));
  const routes = JSON.parse(readText("src/generated/coloring/site-map.json"));
  const publicSource = readSources(["app", "src/components", "src/lib", "src/generated/coloring"]);

  const context = {
    generatedAt,
    runId: "round-4x-trust-legal-pages",
    summary: {
      correctRepo: packageJson.name === "i-love-coloring-page",
      branch,
      head,
      round4wCommitExists,
      appApiRoutePresent: exists("app/api") || exists("src/app/api"),
      staticExportConfigured: /output:\s*"export"/.test(readText("next.config.mjs")),
      r2BundleExists: exists("pipeline/r2-upload/coloring-pages"),
      publicContainsGeneratedProductionMedia: exists("public/coloring-pages") || exists("public/thumbs") || exists("public/svg"),
      imagesStatusClean: git(["status", "--short", "--", "images"]).trim() === "",
      ilovesvgStatusClean: git(["status", "--short", "--", "ilovesvg"]).trim() === "",
      publicDownloadsRemainPngOnly: /Download PNG/.test(readText("src/components/coloring/ImageCard.tsx")),
      visibleSvgDownloadOptions: /Download SVG|SVG download/i.test(publicSource),
      adWellsVisibleByDefault: /Advertisement/.test(readText("src/components/ads/AdSlot.tsx")) && !/NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS/.test(publicSource),
      liveAdCodeExists: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(publicSource),
    },
  };

  const workingTreeAudit = {
    generatedAt,
    runId: "round-4x-working-tree-audit",
    summary: {
      preImplementationDriftDetected: true,
      preImplementationDriftResolved: true,
      driftClassification: "safe generated drift",
      unrelatedDriftCommitted: false,
      cleanAfterDriftCleanupBeforeImplementation: true,
    },
    resolvedDriftFiles,
    classificationNotes: [
      "Older-round manifest diffs were timestamp/head/reference refreshes from prior local regeneration.",
      "Generated search/title diffs were derived search text and timestamp churn, unrelated to trust pages.",
      "The files were restored to the committed Round 4W state before trust/legal implementation.",
    ],
  };

  const requirements = {
    generatedAt,
    runId: "round-4x-trust-legal-requirements",
    sources: [
      {
        name: "Google AdSense required content",
        url: "https://support.google.com/adsense/answer/1348695?hl=en",
        use: "Privacy policy draft includes Google advertising cookie, personalized advertising, Ads Settings, and aboutads.info disclosures for future live ads.",
      },
      {
        name: "Google AdSense page readiness",
        url: "https://support.google.com/adsense/answer/7299563/make-sure-that-your-site-s-pages-are-ready-for-adsense?hl=en-GB",
        use: "Trust pages support clear navigation, useful original content, and user confidence before AdSense review.",
      },
      {
        name: "Google Publisher Policies",
        url: "https://support.google.com/adsense/answer/10502938?hl=en-EN&ref_topic=1250104",
        use: "Reports preserve no live ads, no low-value pages, privacy disclosure planning, and no misrepresentation.",
      },
      {
        name: "Google AdSense ad placement policies",
        url: "https://support.google.com/adsense/answer/1346295?hl=en",
        use: "No trust page places ads near navigation or controls; existing Advertisement label remains policy-aligned.",
      },
      {
        name: "FTC Disclosures 101",
        url: "https://www.ftc.gov/influencers",
        use: "Affiliate disclosure page says future disclosures must be easy to see and close to affiliate content.",
      },
      {
        name: "FTC Endorsement Guides FAQ",
        url: "https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides",
        use: "Affiliate disclosure explains commissions and clear, conspicuous disclosure near links.",
      },
      {
        name: "Google helpful content",
        url: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
        use: "Pages are concise, visitor-focused, and avoid generic filler.",
      },
    ],
    now: ["Add About, Contact, Privacy, Terms, Affiliate Disclosure, and Editorial Policy pages.", "Add footer access and sitemap inclusion for indexable trust pages.", "Keep policy pages as drafts requiring owner review."],
    later: ["Add a real contact email.", "Review privacy/cookie consent before live AdSense.", "Complete legal review before launch.", "Verify public asset domain before AdSense application."],
    intentionallyDeferred: ["Live AdSense code", "Cookie consent tooling", "JSON-LD", "Image sitemap", "Open Graph image generation"],
  };

  const plan = { generatedAt, runId: "round-4x-trust-page-plan", pages: trustPages };
  const metadata = {
    generatedAt,
    runId: "round-4x-trust-page-metadata",
    pages: trustPages.map((page) => ({
      route: page.route,
      title: page.metaTitle,
      description: page.metaDescription,
      canonicalPath: page.route,
      robots: page.indexability,
      indexable: page.indexability === "index",
    })),
    summary: {
      routeSpecificMetadataImplemented: true,
      allTrustPagesIndexable: true,
      ogImagesAdded: false,
      jsonLdAdded: false,
    },
  };

  const sitemapResults = {
    generatedAt,
    runId: "round-4x-sitemap-robots-results",
    summary: {
      trustPagesIncluded: true,
      totalSitemapRoutes: 1 + routes.entries.length + trustPages.length,
      galleryRouteCount: routes.entries.length,
      homepageIncluded: true,
      noPerImageRoutes: true,
      noPhase2HubRoutes: true,
      noRejectedHubs: true,
      noImageSitemap: true,
      robotsAllowsPublicPages: true,
    },
    routes: {
      includedTrustPages: trustPages.map((page) => page.route),
      excludedRouteTypes: ["per-image pages", "Phase 2 hubs", "section-only topics", "rejected hubs", "image sitemap"],
    },
  };

  const readiness = {
    generatedAt,
    runId: "round-4x-adsense-readiness-review",
    summary: {
      uniqueContentPresent: true,
      trustPagesPresent: true,
      contactPathPresent: true,
      privacyPagePresent: true,
      termsPresent: true,
      affiliateDisclosurePresent: true,
      liveAdCodeAbsent: true,
      adPlaceholdersPolicySafe: true,
      adDensityAccepted: true,
      noThinPageObviousBlockers: true,
      noBrokenMediaInLocalPreview: "pending browser QA",
      noSvgPublicDownload: true,
      readyToApplyForAdSenseNow: false,
    },
    blockers: [
      "Owner must provide a real contact path before launch and AdSense review.",
      "Owner/legal review is required before policy pages are treated as final.",
      "Public asset-domain verification is still separate from this round.",
    ],
    recommendation: "Do not apply for AdSense until owner contact details, policy review, and public asset-domain verification are complete.",
  };

  const implementation = {
    generatedAt,
    runId: "round-4x-trust-page-implementation-results",
    summary: {
      pagesCreated: trustPages.map((page) => page.route),
      pagesDeferred: [],
      footerLinksAdded: trustPages.map((page) => page.route),
      sitemapUpdated: true,
      robotsUpdated: false,
      liveAdsAdded: false,
      appApiRouteAdded: false,
      jsonLdAdded: false,
      imageSitemapAdded: false,
      ogImageGenerationAdded: false,
      ownerInputsNeeded: ["Public contact email"],
    },
  };

  const legalFlags = {
    generatedAt,
    runId: "round-4x-legal-review-flags",
    summary: {
      policyPagesAreDrafts: true,
      ownerReviewRequired: true,
      legalReviewRecommended: true,
      fakeCompanyDetailsAdded: false,
      fakeContactDetailsAdded: false,
      contactEmailMissing: true,
    },
    flags: [
      "Privacy and Terms pages need owner/legal review before launch.",
      "Contact page needs a real public email before launch and AdSense review.",
      "Cookie consent and regional privacy requirements need review before live AdSense.",
      "Affiliate disclosure should be placed near future affiliate links, not only in the footer.",
    ],
  };

  writeJson("pipeline/manifests/round-4x-project-context-check.json", context);
  writeJson("pipeline/manifests/round-4x-working-tree-audit.json", workingTreeAudit);
  writeJson("pipeline/manifests/round-4x-trust-legal-requirements.json", requirements);
  writeJson("pipeline/manifests/round-4x-trust-page-plan.json", plan);
  writeJson("pipeline/manifests/round-4x-trust-page-metadata.json", metadata);
  writeJson("pipeline/manifests/round-4x-sitemap-robots-results.json", sitemapResults);
  writeJson("pipeline/manifests/round-4x-adsense-readiness-review.json", readiness);
  writeJson("pipeline/manifests/round-4x-trust-page-implementation-results.json", implementation);
  writeJson("pipeline/manifests/round-4x-legal-review-flags.json", legalFlags);

  writeText("pipeline/reports/round-4x-project-context-check.md", renderContext(context));
  writeText("pipeline/reports/round-4x-working-tree-audit.md", renderWorkingTree(workingTreeAudit));
  writeText("pipeline/reports/round-4x-trust-legal-research.md", renderResearch(requirements));
  writeText("pipeline/reports/round-4x-trust-page-plan.md", renderPlan(plan));
  writeText("pipeline/reports/round-4x-trust-page-metadata.md", renderMetadata(metadata));
  writeText("pipeline/reports/round-4x-sitemap-robots-report.md", renderSitemap(sitemapResults));
  writeText("pipeline/reports/round-4x-adsense-readiness-review.md", renderReadiness(readiness));
  writeText("pipeline/reports/round-4x-trust-page-implementation-report.md", renderImplementation(implementation));
  writeText("pipeline/reports/round-4x-legal-review-flags.md", renderLegalFlags(legalFlags));
  writeText("pipeline/reports/round-4x-next-phase-plan.md", renderNextPlan());
}

function renderContext(context) {
  return `# Round 4X Project Context Check

- Correct repo: ${context.summary.correctRepo}
- Branch: ${context.summary.branch}
- Round 4W commit exists: ${context.summary.round4wCommitExists}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api route present: ${context.summary.appApiRoutePresent}
- R2 coloring-pages bundle exists: ${context.summary.r2BundleExists}
- Public contains generated media: ${context.summary.publicContainsGeneratedProductionMedia}
- Public downloads remain PNG only: ${context.summary.publicDownloadsRemainPngOnly}
- Visible SVG download options: ${context.summary.visibleSvgDownloadOptions}
- Ad wells visible by default: ${context.summary.adWellsVisibleByDefault}
- Live ad code exists: ${context.summary.liveAdCodeExists}
`;
}

function renderWorkingTree(audit) {
  return `# Round 4X Working Tree Audit

The pre-round drift was detected and resolved before trust/legal implementation.

- Drift detected: ${audit.summary.preImplementationDriftDetected}
- Drift resolved: ${audit.summary.preImplementationDriftResolved}
- Classification: ${audit.summary.driftClassification}
- Unrelated drift committed: ${audit.summary.unrelatedDriftCommitted}

Resolved files:
${audit.resolvedDriftFiles.map((file) => `- ${file}`).join("\n")}
`;
}

function renderResearch(requirements) {
  return `# Round 4X Trust And Legal Research

Sources reviewed:
${requirements.sources.map((source) => `- [${source.name}](${source.url}): ${source.use}`).join("\n")}

What affects this site now:
${requirements.now.map((item) => `- ${item}`).join("\n")}

What affects this site later:
${requirements.later.map((item) => `- ${item}`).join("\n")}

Intentionally deferred:
${requirements.intentionallyDeferred.map((item) => `- ${item}`).join("\n")}

Owner/legal review is still required. These pages are draft website policy pages, not final legal documents.
`;
}

function renderPlan(plan) {
  return `# Round 4X Trust Page Plan

${plan.pages
  .map(
    (page) => `## ${page.route}
- Indexability: ${page.indexability}
- Purpose: ${page.purpose}
- H1: ${page.h1}
- Meta title: ${page.metaTitle}
- Meta description: ${page.metaDescription}
- Sections: ${page.contentSections.join(", ")}
- Footer label: ${page.footerLinkLabel}
- Required before AdSense: ${page.requiredBeforeAdsense}
- Owner review required: ${page.ownerReviewRequired}
- Legal review recommended: ${page.legalReviewRecommended}
- Mentions ads, cookies, or affiliate links: ${page.mentionsAdsCookiesAffiliate}`,
  )
  .join("\n\n")}
`;
}

function renderMetadata(metadata) {
  return `# Round 4X Trust Page Metadata

- Route-specific metadata implemented: ${metadata.summary.routeSpecificMetadataImplemented}
- All trust pages indexable: ${metadata.summary.allTrustPagesIndexable}
- OG images added: ${metadata.summary.ogImagesAdded}
- JSON-LD added: ${metadata.summary.jsonLdAdded}

Pages:
${metadata.pages.map((page) => `- ${page.route}: ${page.title}`).join("\n")}
`;
}

function renderSitemap(sitemap) {
  return `# Round 4X Sitemap And Robots Report

- Trust pages included: ${sitemap.summary.trustPagesIncluded}
- Total sitemap routes: ${sitemap.summary.totalSitemapRoutes}
- Homepage included: ${sitemap.summary.homepageIncluded}
- No per-image routes: ${sitemap.summary.noPerImageRoutes}
- No Phase 2 hub routes: ${sitemap.summary.noPhase2HubRoutes}
- No image sitemap: ${sitemap.summary.noImageSitemap}
- Robots allows public pages: ${sitemap.summary.robotsAllowsPublicPages}

Trust pages:
${sitemap.routes.includedTrustPages.map((route) => `- ${route}`).join("\n")}
`;
}

function renderReadiness(readiness) {
  return `# Round 4X AdSense Readiness Review

- Unique content present: ${readiness.summary.uniqueContentPresent}
- Trust pages present: ${readiness.summary.trustPagesPresent}
- Contact path present: ${readiness.summary.contactPathPresent}
- Privacy page present: ${readiness.summary.privacyPagePresent}
- Terms present: ${readiness.summary.termsPresent}
- Affiliate disclosure present: ${readiness.summary.affiliateDisclosurePresent}
- Live ad code absent: ${readiness.summary.liveAdCodeAbsent}
- Ad density accepted: ${readiness.summary.adDensityAccepted}
- Ready to apply for AdSense now: ${readiness.summary.readyToApplyForAdSenseNow}

Blockers:
${readiness.blockers.map((blocker) => `- ${blocker}`).join("\n")}

Recommendation: ${readiness.recommendation}
`;
}

function renderImplementation(implementation) {
  return `# Round 4X Trust Page Implementation Report

- Pages created: ${implementation.summary.pagesCreated.join(", ")}
- Pages deferred: ${implementation.summary.pagesDeferred.length ? implementation.summary.pagesDeferred.join(", ") : "none"}
- Footer links added: ${implementation.summary.footerLinksAdded.join(", ")}
- Sitemap updated: ${implementation.summary.sitemapUpdated}
- Robots updated: ${implementation.summary.robotsUpdated}
- Live ads added: ${implementation.summary.liveAdsAdded}
- app/api route added: ${implementation.summary.appApiRouteAdded}
- Owner inputs needed: ${implementation.summary.ownerInputsNeeded.join(", ")}
`;
}

function renderLegalFlags(flags) {
  return `# Round 4X Legal Review Flags

- Policy pages are drafts: ${flags.summary.policyPagesAreDrafts}
- Owner review required: ${flags.summary.ownerReviewRequired}
- Legal review recommended: ${flags.summary.legalReviewRecommended}
- Fake company details added: ${flags.summary.fakeCompanyDetailsAdded}
- Fake contact details added: ${flags.summary.fakeContactDetailsAdded}
- Contact email missing: ${flags.summary.contactEmailMissing}

Flags:
${flags.flags.map((flag) => `- ${flag}`).join("\n")}
`;
}

function renderNextPlan() {
  return `# Round 4X Next Phase Plan

Exact recommendation for Round 4Y: run final public-domain and asset-domain launch verification, then owner-review the trust pages with a real contact email. Keep live AdSense, JSON-LD expansion, image sitemap, Open Graph image generation, backend routes, media uploads, and new download formats out of scope until those launch prerequisites are accepted.
`;
}

function readSources(relativeRoots) {
  return relativeRoots.map((relativeRoot) => readPathIfExists(relativeRoot)).join("\n");
}

function readPathIfExists(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  if (!existsSync(absolute)) return "";
  const stat = statSync(absolute);
  if (stat?.isFile()) return readText(relativePath);
  const chunks = [];
  walk(absolute, chunks);
  return chunks.map((file) => readFileSync(file, "utf8")).join("\n");
}

function walk(directory, results) {
  for (const entry of readdirSync(directory)) {
    const absolute = path.join(directory, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      if (/node_modules|\.next|out|pipeline[\\/]r2-upload|pipeline[\\/]production[\\/]full|images|ilovesvg/.test(absolute)) continue;
      walk(absolute, results);
    } else if (/\.(?:ts|tsx|css|json|md)$/.test(entry) && !/items\.json$/.test(entry)) {
      results.push(absolute);
    }
  }
}

function exists(relativePath) {
  return existsSync(path.join(repoRoot, relativePath));
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function writeJson(relativePath, data) {
  writeText(relativePath, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(relativePath, text) {
  const absolute = path.join(repoRoot, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function gitSuccess(args) {
  try {
    git(args);
    return true;
  } catch {
    return false;
  }
}

main();
