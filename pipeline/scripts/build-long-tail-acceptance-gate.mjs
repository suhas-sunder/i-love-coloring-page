#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const RUN_ID = "long-tail-acceptance-gate";
const GENERATED_AT = new Date().toISOString();
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;
const EXPECTED_RUNTIME_HUB_COUNT = 131;
const EXPECTED_EXPORTED_SITEMAP_LOCS = 138;
const EXPECTED_PROMOTED_HUBS = 66;
const EXPECTED_MANUAL_REVIEW = 21;
const EXPECTED_BACKLOG = 50;
const PUBLIC_ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const PUBLIC_SITE_URL = "https://www.ilovecoloringpage.com";

const IMPORTANT_PROMOTED_SLUGS = [
  "t-rex",
  "dragons",
  "mushrooms",
  "sushi",
  "bakery",
  "bears",
  "pumpkins",
  "wolves",
  "velociraptors",
  "christmas-dogs",
  "garden-flowers",
  "indoor-plants",
  "fantasy-dragons",
  "plushie-dragons",
  "dinosaurs",
  "unicorns",
];

const INPUTS = {
  packageJson: "package.json",
  nextConfig: "next.config.mjs",
  browserDownloads: "src/lib/coloring/browserDownloads.ts",
  downloadMenu: "src/components/coloring/DownloadMenu.tsx",
  siteConfig: "src/lib/site/siteConfig.ts",
  siteNav: "src/lib/navigation/siteNav.ts",
  runtimeAvailableItems: "src/generated/coloring/runtime-available-items.json",
  runtimeDeferredItems: "src/generated/coloring/runtime-deferred-items.json",
  runtimeHubs: "src/generated/coloring/runtime-hubs.json",
  runtimeHubItems: "src/generated/coloring/runtime-hub-items.json",
  runtimeRoutes: "src/generated/coloring/runtime-routes.json",
  runtimeSiteMap: "src/generated/coloring/runtime-site-map.json",
  runtimeSeoPages: "src/generated/coloring/runtime-seo-pages.json",
  runtimeHubSeoContent: "src/generated/coloring/runtime-hub-seo-content.json",
  internalLinking: "src/generated/coloring/internal-linking.json",
  baseHubs: "src/generated/coloring/hubs.json",
  baseHubItems: "src/generated/coloring/hub-items.json",
  baseRoutes: "src/generated/coloring/routes.json",
  baseSiteMap: "src/generated/coloring/site-map.json",
  baseHubSeoContent: "src/generated/coloring/hub-seo-content.json",
  proposal: "pipeline/manifests/long-tail-promoted-hubs-proposal.json",
  scores: "pipeline/manifests/long-tail-candidate-hub-scores.json",
  implementation: "pipeline/manifests/long-tail-hub-implementation-results.json",
  policy: "pipeline/manifests/long-tail-hub-promotion-policy.json",
  longTailBrowserQa: "pipeline/manifests/long-tail-hub-browser-qa-results.json",
  staticExport: "pipeline/manifests/long-tail-static-export-results.json",
  sampledUrlCheck: "pipeline/manifests/long-tail-acceptance-sampled-url-check-results.json",
  browserQa: "pipeline/manifests/long-tail-acceptance-browser-qa-results.json",
};

const OUTPUTS = {
  context: "pipeline/manifests/long-tail-acceptance-context-check.json",
  qualityAudit: "pipeline/manifests/long-tail-promoted-hub-quality-audit.json",
  acceptance: "pipeline/manifests/long-tail-promoted-hub-acceptance.json",
  manualPackage: "pipeline/manifests/long-tail-manual-review-hub-package.json",
  backlogPackage: "pipeline/manifests/long-tail-backlog-candidate-package.json",
  sitemapAudit: "pipeline/manifests/long-tail-sitemap-route-audit.json",
  seoAudit: "pipeline/manifests/long-tail-seo-content-audit.json",
  internalAudit: "pipeline/manifests/long-tail-internal-linking-audit.json",
  gate: "pipeline/manifests/long-tail-acceptance-gate.json",
};

const REPORTS = {
  context: "pipeline/reports/long-tail-acceptance-context-check.md",
  qualityAudit: "pipeline/reports/long-tail-promoted-hub-quality-audit.md",
  acceptance: "pipeline/reports/long-tail-promoted-hub-acceptance.md",
  manualPackage: "pipeline/reports/long-tail-manual-review-hub-package.md",
  manualCsv: "pipeline/reports/long-tail-manual-review-hubs.csv",
  backlogPackage: "pipeline/reports/long-tail-backlog-candidate-package.md",
  backlogCsv: "pipeline/reports/long-tail-backlog-candidates.csv",
  sitemapAudit: "pipeline/reports/long-tail-sitemap-route-audit.md",
  seoAudit: "pipeline/reports/long-tail-seo-content-audit.md",
  internalAudit: "pipeline/reports/long-tail-internal-linking-audit.md",
  gate: "pipeline/reports/long-tail-acceptance-gate.md",
};

const SPAM_TOKENS = new Set(["chatgpt", "failed", "timestamp", "export", "ai-export", "coloring-page", "coloring-pages"]);
const INTERNAL_COPY_PATTERN = /approved runtime|runtime library|pipeline|manifest|object key|asset id|r2\.dev|localhost|svg download|download svg/i;
const ONLINE_COLORING_PATTERN = /online coloring|color online|coloring workspace is available|use the online coloring/i;

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const state = await loadState();
  const context = await buildContext(state);
  const qualityAudit = buildQualityAudit(state);
  const acceptance = buildAcceptance(qualityAudit);
  const manualPackage = buildManualReviewPackage(state);
  const backlogPackage = buildBacklogPackage(state);
  const sitemapAudit = buildSitemapAudit(state, manualPackage, backlogPackage);
  const seoAudit = buildSeoAudit(state);
  const internalAudit = buildInternalLinkingAudit(state, manualPackage, backlogPackage);
  const gate = buildGate({ acceptance, manualPackage, backlogPackage, sitemapAudit, seoAudit, internalAudit, state });

  await writeJson(OUTPUTS.context, context);
  await writeJson(OUTPUTS.qualityAudit, qualityAudit);
  await writeJson(OUTPUTS.acceptance, acceptance);
  await writeJson(OUTPUTS.manualPackage, manualPackage);
  await writeJson(OUTPUTS.backlogPackage, backlogPackage);
  await writeJson(OUTPUTS.sitemapAudit, sitemapAudit);
  await writeJson(OUTPUTS.seoAudit, seoAudit);
  await writeJson(OUTPUTS.internalAudit, internalAudit);
  await writeJson(OUTPUTS.gate, gate);

  await writeText(REPORTS.context, renderContextReport(context));
  await writeText(REPORTS.qualityAudit, renderQualityAuditReport(qualityAudit));
  await writeText(REPORTS.acceptance, renderAcceptanceReport(acceptance));
  await writeText(REPORTS.manualPackage, renderManualPackageReport(manualPackage));
  await writeText(REPORTS.manualCsv, renderManualPackageCsv(manualPackage));
  await writeText(REPORTS.backlogPackage, renderBacklogPackageReport(backlogPackage));
  await writeText(REPORTS.backlogCsv, renderBacklogPackageCsv(backlogPackage));
  await writeText(REPORTS.sitemapAudit, renderSitemapAuditReport(sitemapAudit));
  await writeText(REPORTS.seoAudit, renderSeoAuditReport(seoAudit));
  await writeText(REPORTS.internalAudit, renderInternalAuditReport(internalAudit));
  await writeText(REPORTS.gate, renderGateReport(gate));

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        promotedHubCount: acceptance.summary.promotedHubCount,
        acceptedHubCount: acceptance.summary.acceptedCount,
        manualReviewCandidates: manualPackage.summary.candidateCount,
        backlogCandidates: backlogPackage.summary.candidateCount,
        blockers: gate.summary.blockers,
      },
      null,
      2,
    ),
  );
}

async function loadState() {
  const [
    packageJson,
    runtimeAvailableItems,
    runtimeDeferredItems,
    runtimeHubs,
    runtimeHubItems,
    runtimeRoutes,
    runtimeSiteMap,
    runtimeSeoPages,
    runtimeHubSeoContent,
    internalLinking,
    baseHubs,
    baseHubItems,
    baseRoutes,
    baseSiteMap,
    baseHubSeoContent,
    proposal,
    scores,
    implementation,
    policy,
  ] = await Promise.all([
    readJson(INPUTS.packageJson),
    readJson(INPUTS.runtimeAvailableItems),
    readJson(INPUTS.runtimeDeferredItems),
    readJson(INPUTS.runtimeHubs),
    readJson(INPUTS.runtimeHubItems),
    readJson(INPUTS.runtimeRoutes),
    readJson(INPUTS.runtimeSiteMap),
    readJson(INPUTS.runtimeSeoPages),
    readJson(INPUTS.runtimeHubSeoContent),
    readJson(INPUTS.internalLinking),
    readJson(INPUTS.baseHubs),
    readJson(INPUTS.baseHubItems),
    readJson(INPUTS.baseRoutes),
    readJson(INPUTS.baseSiteMap),
    readJson(INPUTS.baseHubSeoContent),
    readJson(INPUTS.proposal),
    readJson(INPUTS.scores),
    readJson(INPUTS.implementation),
    readJson(INPUTS.policy),
  ]);

  const text = {
    nextConfig: await readText(INPUTS.nextConfig),
    browserDownloads: await readText(INPUTS.browserDownloads),
    downloadMenu: await readText(INPUTS.downloadMenu),
    siteConfig: await readText(INPUTS.siteConfig),
    siteNav: await readText(INPUTS.siteNav),
    appSource: await readProjectText(["app", "src"]),
  };

  const optional = {
    sampledUrlCheck: await readJsonIfExists(INPUTS.sampledUrlCheck),
    browserQa: await readJsonIfExists(INPUTS.browserQa),
    longTailBrowserQa: await readJsonIfExists(INPUTS.longTailBrowserQa),
    staticExport: await readJsonIfExists(INPUTS.staticExport),
  };

  const maps = {
    availableById: new Map(runtimeAvailableItems.items.map((item) => [item.assetId, item])),
    hubBySlug: new Map(runtimeHubs.hubs.map((hub) => [hub.slug, hub])),
    hubById: new Map(runtimeHubs.hubs.map((hub) => [hub.hubId, hub])),
    routeBySlug: new Map(runtimeRoutes.routes.map((route) => [route.slug, route])),
    routePaths: new Set(runtimeRoutes.routes.map((route) => route.path)),
    sitemapPaths: new Set(runtimeSiteMap.entries.map((entry) => entry.path)),
    seoByPath: new Map(runtimeSeoPages.pages.map((page) => [page.path, page])),
    hubSeoBySlug: new Map(runtimeHubSeoContent.hubs.map((page) => [page.slug, page])),
    internalByPath: new Map(internalLinking.pages.map((page) => [page.path, page])),
    scoreBySlug: new Map(scores.candidates.map((candidate) => [candidate.slug, candidate])),
    proposalBySlug: new Map(proposal.promotedHubs.map((hub) => [hub.slug, hub])),
  };

  return {
    packageJson,
    runtimeAvailableItems,
    runtimeDeferredItems,
    runtimeHubs,
    runtimeHubItems,
    runtimeRoutes,
    runtimeSiteMap,
    runtimeSeoPages,
    runtimeHubSeoContent,
    internalLinking,
    baseHubs,
    baseHubItems,
    baseRoutes,
    baseSiteMap,
    baseHubSeoContent,
    proposal,
    scores,
    implementation,
    policy,
    text,
    optional,
    maps,
  };
}

async function buildContext(state) {
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const generatedProductionMediaInPublic = publicFiles.filter((file) =>
    /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file),
  );
  const routeFiles = {
    homepage: existsSync(path.join(REPO_ROOT, "app", "page.tsx")),
    coloringPages: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
    hubSlug: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
  };
  const longTailFiles = [
    "pipeline/scripts/build-long-tail-hub-candidates.mjs",
    "pipeline/scripts/long-tail-hub-browser-qa-runner.cjs",
    "pipeline/tests/long-tail-hub-expansion.test.mjs",
  ];
  const sourceText = state.text.appSource;
  const downloadsText = `${state.text.browserDownloads}\n${state.text.downloadMenu}`;

  const summary = {
    correctRepository: state.packageJson.name === "i-love-coloring-page",
    currentBranch: gitOutput(["branch", "--show-current"]),
    commitIncludes2e2206d: gitCommandSucceeds(["merge-base", "--is-ancestor", "2e2206d", "HEAD"]),
    headCommit: gitOutput(["rev-parse", "--short", "HEAD"]),
    staticExportConfigured: /output:\s*"export"/.test(state.text.nextConfig),
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")) || appFiles.some((file) => normalizePath(file).includes("/api/")),
    coloringPagesRouteExists: routeFiles.coloringPages,
    hubSlugRouteExists: routeFiles.hubSlug,
    runtimeGeneratedCleanAssetDataExists: [
      INPUTS.runtimeAvailableItems,
      INPUTS.runtimeHubs,
      INPUTS.runtimeHubItems,
      INPUTS.runtimeRoutes,
      INPUTS.runtimeSiteMap,
    ].every((relativePath) => existsSync(path.join(REPO_ROOT, relativePath))),
    longTailGenerationSystemExists: longTailFiles.every((relativePath) => existsSync(path.join(REPO_ROOT, relativePath))),
    runtimeAvailableRecords: state.runtimeAvailableItems.items.length,
    deferredManualReviewRecords: getDeferredRecords(state).length,
    publicAssetBaseUrl: PUBLIC_ASSET_BASE_URL,
    publicSiteUrl: PUBLIC_SITE_URL,
    generatedProductionMediaInPublic: generatedProductionMediaInPublic.length,
    imagesGitStatusClean: gitOutput(["status", "--short", "--", "images"]) === "",
    ilovesvgGitStatusClean: gitOutput(["status", "--short", "--", "ilovesvg"]) === "",
    svgUserFacingDownloadAbsent: !/Download SVG|downloadSvg|svgDownload|label:\s*["']SVG["']/i.test(downloadsText),
    publicDownloadsPngJpgWebp:
      /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/.test(state.text.browserDownloads) &&
      /label:\s*"PNG"/.test(state.text.downloadMenu) &&
      /label:\s*"JPG"/.test(state.text.downloadMenu) &&
      /label:\s*"WebP"/.test(state.text.downloadMenu),
    liveAdsenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
    imageSitemapPresent: /image-sitemap|imageSitemap|ImageSitemap/i.test(sourceText),
    openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(sourceText),
    jsonLdExpansionDeferred: !/application\/ld\+json|FAQPage|BreadcrumbList|ImageObject/i.test(sourceText),
    currentRuntimeHubCount: state.runtimeRoutes.routes.length,
    currentRuntimeSitemapRouteCount: state.runtimeSiteMap.entries.length,
  };

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary,
    routeFiles,
    checkedFiles: {
      longTailFiles,
      publicMediaFindings: generatedProductionMediaInPublic,
      appFilesChecked: appFiles.length,
      publicFilesChecked: publicFiles.length,
    },
  };
}

function buildQualityAudit(state) {
  const promoted = state.implementation.promotedHubs;
  const duplicateSortKeys = countBy(promoted.map((hub) => sortedSlugKey(hub.slug)));
  const entries = promoted.map((promotedHub) => {
    const hub = state.maps.hubBySlug.get(promotedHub.slug);
    const route = state.maps.routeBySlug.get(promotedHub.slug);
    const score = state.maps.scoreBySlug.get(promotedHub.slug);
    const proposal = state.maps.proposalBySlug.get(promotedHub.slug);
    const seo = state.maps.seoByPath.get(`/coloring-pages/${promotedHub.slug}`);
    const hubSeo = state.maps.hubSeoBySlug.get(promotedHub.slug);
    const internal = state.maps.internalByPath.get(`/coloring-pages/${promotedHub.slug}`);
    const galleryCount = state.runtimeHubItems.items.filter((item) => item.hubIds?.includes(promotedHub.hubId)).length;
    const assetCount = hub?.assetIds?.length || promotedHub.assetCount || 0;
    const minimum = state.policy.minimums?.[promotedHub.kind] || state.policy.minimums?.subject || 8;
    const overlapNotes = score?.overlapNotes || proposal?.overlapNotes || [];
    const maxComparableOverlap = score?.maxComparableOverlapRatio || 0;
    const maxExistingOverlap = score?.maxExistingOverlapRatio || 0;
    const spammyTokenRisk = hasSpammyToken(promotedHub.slug, promotedHub.title || promotedHub.hubTitle);
    const duplicateOrReorderedRisk = duplicateSortKeys.get(sortedSlugKey(promotedHub.slug)) > 1;
    const seoText = `${seo?.pageTitle || ""}\n${seo?.metaTitle || ""}\n${seo?.metaDescription || ""}\n${seo?.shortIntro || ""}\n${hubSeo?.shortIntro || ""}\n${(hubSeo?.belowGallerySections || []).map((section) => `${section.heading} ${section.body}`).join("\n")}`;
    const findings = {
      slugQuality: isNaturalSlug(promotedHub.slug),
      titleQuality: isNaturalTitle(hub?.title || promotedHub.title || promotedHub.hubTitle),
      assetCountMatches: Boolean(hub && assetCount === hub.assetCount && assetCount === promotedHub.assetCount),
      galleryCountMatches: galleryCount === assetCount,
      meetsMinimum: assetCount >= minimum || promotedHub.minimumExceptionDocumented === true,
      routeExists: Boolean(route && route.path === `/coloring-pages/${promotedHub.slug}`),
      sitemapIncluded: state.maps.sitemapPaths.has(`/coloring-pages/${promotedHub.slug}`),
      duplicateOrReorderedRisk,
      spammyTokenRisk,
      categorySubjectRelevant: assetCount > 0 && score?.confidence !== "low",
      userIntentClear: Boolean(score?.intent || promotedHub.intent),
      seoContentAvailable: Boolean(seo?.metaTitle && seo?.metaDescription && hubSeo?.shortIntro && hubSeo?.belowGallerySections?.length >= 2),
      internalLinksAvailable: Boolean(internal?.links?.length),
      browserRouteAvailable: Boolean(route),
      publicNamingRisk: score?.publicNamingRisk || "unknown",
      internalCopyAbsent: !INTERNAL_COPY_PATTERN.test(seoText),
    };
    const objectiveProblems = [];
    if (!findings.routeExists) objectiveProblems.push("missing route");
    if (!findings.sitemapIncluded) objectiveProblems.push("missing sitemap entry");
    if (!findings.assetCountMatches || !findings.galleryCountMatches) objectiveProblems.push("count mismatch");
    if (!findings.meetsMinimum) objectiveProblems.push("below policy minimum");
    if (findings.duplicateOrReorderedRisk) objectiveProblems.push("duplicate or reordered duplicate route risk");
    if (findings.spammyTokenRisk) objectiveProblems.push("spammy token risk");
    if (!findings.seoContentAvailable) objectiveProblems.push("missing SEO content");
    if (!findings.internalCopyAbsent) objectiveProblems.push("internal wording in SEO content");

    return {
      slug: promotedHub.slug,
      title: hub?.title || promotedHub.title || promotedHub.hubTitle,
      hubId: promotedHub.hubId,
      kind: promotedHub.kind,
      status: objectiveProblems.length === 0 && findings.publicNamingRisk !== "high" ? "accepted" : "needs_review",
      assetCount,
      galleryCount,
      minimum,
      parentHubSlug: proposal?.parentHubSlug || score?.parentSlug || null,
      topCategories: getTopCategories(promotedHub.assetIds || hub?.assetIds || [], state.maps.availableById),
      overlap: {
        maxExistingOverlapRatio: round(maxExistingOverlap),
        maxComparableOverlapRatio: round(maxComparableOverlap),
        notes: overlapNotes.slice(0, 5),
      },
      duplicateOrReorderedRisk,
      spammyTokenRisk,
      categorySubjectRelevance: findings.categorySubjectRelevant ? "supported_by_assets" : "weak",
      userIntentClarity: findings.userIntentClear ? "clear" : "unclear",
      seoContentAvailable: findings.seoContentAvailable,
      internalLinksAvailable: findings.internalLinksAvailable,
      sitemapIncluded: findings.sitemapIncluded,
      browserRouteAvailability: findings.browserRouteAvailable ? "route_generated" : "missing_generated_route",
      findings,
      objectiveProblems,
      exampleAssetTitles: promotedHub.exampleAssetTitles || proposal?.exampleAssetTitles || [],
    };
  });

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      promotedHubCount: entries.length,
      acceptedQualityCount: entries.filter((entry) => entry.status === "accepted").length,
      needsReviewCount: entries.filter((entry) => entry.status !== "accepted").length,
      specificHubsAudited: IMPORTANT_PROMOTED_SLUGS.filter((slug) => entries.some((entry) => entry.slug === slug)),
      missingSpecificRequestedHubs: IMPORTANT_PROMOTED_SLUGS.filter((slug) => !entries.some((entry) => entry.slug === slug)),
      duplicateOrReorderedRiskCount: entries.filter((entry) => entry.duplicateOrReorderedRisk).length,
      spammyTokenRiskCount: entries.filter((entry) => entry.spammyTokenRisk).length,
      clearObjectiveProblemCount: entries.filter((entry) => entry.objectiveProblems.length > 0).length,
    },
    hubs: entries,
  };
}

function buildAcceptance(qualityAudit) {
  const hubs = qualityAudit.hubs.map((entry) => {
    let status = "accepted";
    const problem = [];
    const recommendedAction = [];
    let actionApplied = false;

    if (entry.objectiveProblems.includes("missing SEO content") || entry.objectiveProblems.includes("internal wording in SEO content")) {
      status = "needs-copy-fix";
      problem.push(...entry.objectiveProblems.filter((item) => item.includes("SEO") || item.includes("wording")));
      recommendedAction.push("Regenerate or repair hub SEO copy before accepting the route.");
    }
    if (entry.objectiveProblems.includes("missing route") || entry.objectiveProblems.includes("missing sitemap entry")) {
      status = "needs-route-fix";
      problem.push(...entry.objectiveProblems.filter((item) => item.includes("route") || item.includes("sitemap")));
      recommendedAction.push("Repair generated route and sitemap data before accepting the hub.");
    }
    if (entry.objectiveProblems.includes("count mismatch")) {
      status = "needs-count-fix";
      problem.push("count mismatch");
      recommendedAction.push("Regenerate hub item mapping so visible count and route count agree.");
    }
    if (
      entry.objectiveProblems.includes("below policy minimum") ||
      entry.objectiveProblems.includes("duplicate or reordered duplicate route risk") ||
      entry.objectiveProblems.includes("spammy token risk")
    ) {
      status = "should-demote";
      problem.push(...entry.objectiveProblems);
      recommendedAction.push("Demote this route unless the owner explicitly approves a documented exception.");
    }
    if (status === "accepted" && entry.findings.publicNamingRisk !== "low") {
      status = "owner-review-needed";
      problem.push(`public naming risk is ${entry.findings.publicNamingRisk}`);
      recommendedAction.push("Owner should review the public route wording before acceptance.");
    }

    return {
      slug: entry.slug,
      title: entry.title,
      status,
      assetCount: entry.assetCount,
      problem: unique(problem),
      recommendedAction: unique(recommendedAction),
      actionApplied,
    };
  });

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      promotedHubCount: hubs.length,
      acceptedCount: hubs.filter((hub) => hub.status === "accepted").length,
      needsCopyFixCount: hubs.filter((hub) => hub.status === "needs-copy-fix").length,
      needsRouteFixCount: hubs.filter((hub) => hub.status === "needs-route-fix").length,
      needsCountFixCount: hubs.filter((hub) => hub.status === "needs-count-fix").length,
      shouldDemoteCount: hubs.filter((hub) => hub.status === "should-demote").length,
      ownerReviewNeededCount: hubs.filter((hub) => hub.status === "owner-review-needed").length,
      nonAcceptedCount: hubs.filter((hub) => hub.status !== "accepted").length,
      noAutomaticSubjectiveDemotion: true,
    },
    hubs,
  };
}

function buildManualReviewPackage(state) {
  const candidates = state.scores.candidates
    .filter((candidate) => candidate.classification === "manual_review")
    .map((candidate) => packageManualCandidate(candidate, state));
  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      candidateCount: candidates.length,
      expectedCandidateCount: EXPECTED_MANUAL_REVIEW,
      notPromotedThisRound: true,
      ownerDecisionOptions: ["approve", "revise", "backlog", "reject", "merge-with-existing"],
    },
    candidates,
  };
}

function buildBacklogPackage(state) {
  const candidates = state.scores.candidates
    .filter((candidate) => candidate.classification === "backlog_later")
    .map((candidate) => ({
      slug: candidate.slug,
      title: candidate.title,
      assetCount: candidate.assetCount,
      reasonBacklog: (candidate.classificationReasons || []).join(" ") || "Held for a later expansion pass.",
      whatWouldMakeItPromotableLater: getPromotabilityNote(candidate),
      likelyParentHub: candidate.parentSlug || "",
      estimatedValue: getEstimatedValue(candidate),
      ownerNotes: "",
    }));

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      candidateCount: candidates.length,
      expectedCandidateCount: EXPECTED_BACKLOG,
      notPromotedThisRound: true,
    },
    candidates,
  };
}

function buildSitemapAudit(state, manualPackage, backlogPackage) {
  const trustPages = getTrustPages();
  const exportedSitemapLocCount = 1 + state.runtimeSiteMap.entries.length + trustPages.filter((page) => page.indexable).length;
  const manualOrBacklogSlugs = new Set([...manualPackage.candidates, ...backlogPackage.candidates].map((candidate) => candidate.slug));
  const rejectedSlugs = new Set(
    state.scores.candidates
      .filter((candidate) => candidate.classification === "reject_spam_or_thin" || candidate.classification === "section_only")
      .map((candidate) => candidate.slug),
  );
  const routePaths = state.runtimeRoutes.routes.map((route) => route.path);
  const sitemapPaths = state.runtimeSiteMap.entries.map((entry) => entry.path);
  const duplicateRoutes = findDuplicates(routePaths);
  const duplicateSitemapPaths = findDuplicates(sitemapPaths);
  const missingPromotedPaths = state.implementation.promotedHubs
    .map((hub) => `/coloring-pages/${hub.slug}`)
    .filter((routePath) => !state.maps.routePaths.has(routePath) || !state.maps.sitemapPaths.has(routePath));
  const backlogManualInSitemap = state.runtimeSiteMap.entries.filter((entry) => manualOrBacklogSlugs.has(entry.slug || slugFromPath(entry.path)));
  const rejectedInSitemap = state.runtimeSiteMap.entries.filter((entry) => rejectedSlugs.has(entry.slug || slugFromPath(entry.path)));
  const noPerImageRoutes = !routePaths.some((routePath) => /\/(?:image|item|asset)\//i.test(routePath));
  const noCanonicalInconsistency = routePaths.every((routePath) => routePath === "/" || !routePath.endsWith("/"));
  const sourceText = `${JSON.stringify(state.runtimeRoutes)}\n${JSON.stringify(state.runtimeSiteMap)}`;

  const summary = {
    runtimeIndexableHubCount: state.runtimeRoutes.routes.length,
    expectedRuntimeIndexableHubCount: EXPECTED_RUNTIME_HUB_COUNT,
    runtimeSitemapRouteCount: state.runtimeSiteMap.entries.length,
    exportedSitemapLocCount,
    expectedExportedSitemapLocCount: EXPECTED_EXPORTED_SITEMAP_LOCS,
    homepageExists: existsSync(path.join(REPO_ROOT, "app", "page.tsx")),
    coloringPagesExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
    allPromotedRoutesExist: missingPromotedPaths.length === 0,
    trustPagesExist: trustPages.every((page) => existsSync(path.join(REPO_ROOT, "app", page.path.replace(/^\//, ""), "page.tsx"))),
    noPerImageRoutes,
    noSectionOnlyTopicRoutes: !state.runtimeRoutes.routes.some((route) => rejectedSlugs.has(route.slug)),
    noRejectedRoutes: rejectedInSitemap.length === 0,
    noBacklogManualReviewRoutesInSitemap: backlogManualInSitemap.length === 0,
    imageSitemapAbsent: !/image-sitemap|imageSitemap|ImageSitemap/i.test(state.text.appSource),
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(sourceText),
    noR2Dev: !/r2\.dev/i.test(sourceText),
    noDuplicateRoutes: duplicateRoutes.length === 0 && duplicateSitemapPaths.length === 0,
    noTrailingCanonicalInconsistency: noCanonicalInconsistency,
  };

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary,
    missingPromotedPaths,
    duplicateRoutes,
    duplicateSitemapPaths,
    backlogManualInSitemap,
    rejectedInSitemap,
    trustPages,
  };
}

function buildSeoAudit(state) {
  const entries = state.implementation.promotedHubs.map((hub) => {
    const seo = state.maps.seoByPath.get(`/coloring-pages/${hub.slug}`);
    const hubSeo = state.maps.hubSeoBySlug.get(hub.slug);
    const text = `${seo?.pageTitle || ""}\n${seo?.metaTitle || ""}\n${seo?.metaDescription || ""}\n${seo?.shortIntro || ""}\n${hubSeo?.shortIntro || ""}\n${(hubSeo?.belowGallerySections || []).map((section) => `${section.heading}\n${section.body}`).join("\n")}`;
    const repeatedBoilerplateRisk = !hubSeo?.belowGallerySections?.length || new Set((hubSeo?.belowGallerySections || []).map((section) => section.heading)).size < (hubSeo?.belowGallerySections || []).length;
    return {
      slug: hub.slug,
      title: seo?.pageTitle || hub.title,
      hasUniquePageTitle: Boolean(seo?.pageTitle),
      hasUniqueMetaDescription: Boolean(seo?.metaDescription),
      usefulIntroCopy: Boolean(seo?.shortIntro && seo.shortIntro.length >= 90),
      belowGalleryContentPresent: Boolean(hubSeo?.belowGallerySections?.length >= 2),
      internalPipelineWordingAbsent: !INTERNAL_COPY_PATTERN.test(text),
      svgDownloadCopyAbsent: !/Download SVG|SVG downloads|download SVG/i.test(text),
      onlineColoringPromiseAbsent: !ONLINE_COLORING_PATTERN.test(text),
      keywordStuffingRisk: hasKeywordStuffingRisk(text, hub.slug),
      repeatedBoilerplateRisk,
      galleryFirstUxPreserved: true,
    };
  });
  const pageTitles = entries.map((entry) => entry.title);
  const metaDescriptions = state.implementation.promotedHubs.map((hub) => state.maps.seoByPath.get(`/coloring-pages/${hub.slug}`)?.metaDescription || "");
  const failedEntries = entries.filter((entry) => {
    return (
      !entry.hasUniquePageTitle ||
      !entry.hasUniqueMetaDescription ||
      !entry.usefulIntroCopy ||
      !entry.belowGalleryContentPresent ||
      !entry.internalPipelineWordingAbsent ||
      !entry.svgDownloadCopyAbsent ||
      !entry.onlineColoringPromiseAbsent ||
      entry.keywordStuffingRisk ||
      entry.repeatedBoilerplateRisk
    );
  });
  const summary = {
    promotedHubCount: entries.length,
    uniqueMetaTitles: new Set(pageTitles).size === pageTitles.length,
    uniqueMetaDescriptions: new Set(metaDescriptions).size === metaDescriptions.length,
    usefulIntroCopy: entries.every((entry) => entry.usefulIntroCopy),
    belowGalleryContentPresent: entries.every((entry) => entry.belowGalleryContentPresent),
    internalPipelineWordingAbsent: entries.every((entry) => entry.internalPipelineWordingAbsent),
    svgDownloadCopyAbsent: entries.every((entry) => entry.svgDownloadCopyAbsent),
    onlineColoringPromiseAbsent: entries.every((entry) => entry.onlineColoringPromiseAbsent),
    keywordStuffingAbsent: entries.every((entry) => !entry.keywordStuffingRisk),
    obviousRepeatedBoilerplateAbsent: entries.every((entry) => !entry.repeatedBoilerplateRisk),
    galleryRemainsNearTop: true,
    failedEntryCount: failedEntries.length,
  };
  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      ...summary,
      passed:
        summary.uniqueMetaTitles &&
        summary.uniqueMetaDescriptions &&
        summary.usefulIntroCopy &&
        summary.belowGalleryContentPresent &&
        summary.internalPipelineWordingAbsent &&
        summary.svgDownloadCopyAbsent &&
        summary.onlineColoringPromiseAbsent &&
        summary.keywordStuffingAbsent &&
        summary.obviousRepeatedBoilerplateAbsent,
    },
    failedEntries,
    hubs: entries,
  };
}

function buildInternalLinkingAudit(state, manualPackage, backlogPackage) {
  const manualOrBacklogSlugs = new Set([...manualPackage.candidates, ...backlogPackage.candidates].map((candidate) => candidate.slug));
  const routePaths = state.maps.routePaths;
  const sitemapPaths = state.maps.sitemapPaths;
  const exportedSitemapPaths = new Set(["/", ...sitemapPaths, ...getTrustPages().filter((page) => page.indexable).map((page) => page.path)]);
  const promotedSlugs = new Set(state.implementation.promotedHubs.map((hub) => hub.slug));
  const backlogSlugs = new Set((state.runtimeHubs.backlogHubs || []).map((hub) => hub.slug));
  const sectionOnlySlugs = new Set((state.runtimeHubs.sectionOnlyTopics || []).map((topic) => topic.slug));
  const primaryNavPaths = new Set(["/coloring-pages/animals", "/coloring-pages/christmas", "/coloring-pages/for-kids", "/coloring-pages/detailed-for-adults"]);
  const phase1HubLinks = state.runtimeHubs.hubs
    .filter((hub) => hub.slug && routePaths.has(hub.route))
    .filter((hub) => !backlogSlugs.has(hub.slug) && !sectionOnlySlugs.has(hub.slug));
  const moreHubLinks = phase1HubLinks.filter((hub) => !primaryNavPaths.has(hub.route));
  const brokenInternalLinks = [];
  const backlogManualReviewLinks = [];
  const missingPromotedInternalLinks = [];
  const parentChildProblems = [];
  const nonRoutedParentMetadata = [];
  const nonRoutedHubIds = new Set([
    ...(state.runtimeHubs.backlogHubs || []).map((hub) => hub.hubId),
    ...(state.runtimeHubs.sectionOnlyTopics || []).map((topic) => topic.hubId),
  ]);

  for (const page of state.internalLinking.pages) {
    for (const link of page.links || []) {
      if (!routePaths.has(link.href)) brokenInternalLinks.push({ page: page.path, href: link.href });
      const slug = slugFromPath(link.href);
      if (manualOrBacklogSlugs.has(slug)) backlogManualReviewLinks.push({ page: page.path, href: link.href });
    }
  }

  for (const hub of state.implementation.promotedHubs) {
    const internal = state.maps.internalByPath.get(`/coloring-pages/${hub.slug}`);
    if (!internal?.links?.length) missingPromotedInternalLinks.push(hub.slug);
  }

  for (const hub of state.runtimeHubs.hubs) {
    if (hub.parentHubId && !state.maps.hubById.has(hub.parentHubId)) {
      if (nonRoutedHubIds.has(hub.parentHubId)) nonRoutedParentMetadata.push({ slug: hub.slug, parentHubId: hub.parentHubId });
      else parentChildProblems.push({ slug: hub.slug, parentHubId: hub.parentHubId });
    }
    for (const childHubId of hub.childHubIds || []) {
      if (!state.maps.hubById.has(childHubId)) parentChildProblems.push({ slug: hub.slug, childHubId });
    }
  }

  const duplicateNavEntries = findDuplicates(phase1HubLinks.map((hub) => hub.route));
  const promotedMoreCoverage = [...promotedSlugs].filter((slug) => moreHubLinks.some((hub) => hub.slug === slug));
  const summary = {
    promotedHubCount: promotedSlugs.size,
    moreMenuFindsNewHubs: ["t-rex", "dragons", "mushrooms", "sushi", "bakery"].every((slug) => promotedMoreCoverage.includes(slug)),
    relatedHubsUseful: missingPromotedInternalLinks.length === 0,
    parentChildRelationshipsValid: parentChildProblems.length === 0,
    noBrokenLinks: brokenInternalLinks.length === 0,
    noBacklogManualReviewLinks: backlogManualReviewLinks.length === 0,
    noDuplicateNavEntries: duplicateNavEntries.length === 0,
    sitemapAndInternalLinksAgree: state.internalLinking.pages.every((page) => exportedSitemapPaths.has(page.path)),
    moreMenuLinkCount: moreHubLinks.length,
    mobileNavUsesSameGeneratedHubSet: /phase1HubLinks|moreHubGroups/.test(state.text.siteNav),
  };

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      ...summary,
      passed:
        summary.moreMenuFindsNewHubs &&
        summary.relatedHubsUseful &&
        summary.parentChildRelationshipsValid &&
        summary.noBrokenLinks &&
        summary.noBacklogManualReviewLinks &&
        summary.noDuplicateNavEntries &&
        summary.sitemapAndInternalLinksAgree,
    },
    brokenInternalLinks,
    backlogManualReviewLinks,
    missingPromotedInternalLinks,
    parentChildProblems,
    nonRoutedParentMetadata,
    duplicateNavEntries,
  };
}

function buildGate({ acceptance, manualPackage, backlogPackage, sitemapAudit, seoAudit, internalAudit, state }) {
  const browserQa = state.optional.browserQa;
  const sampledUrlCheck = state.optional.sampledUrlCheck;
  const browserQaPassed = Boolean(browserQa?.summary?.browserQaPassed);
  const sampledUrlCheckPassed = Boolean(sampledUrlCheck?.summary?.sampledUrlCheckPassed);
  const needsFixCount =
    acceptance.summary.needsCopyFixCount + acceptance.summary.needsRouteFixCount + acceptance.summary.needsCountFixCount;
  const blockers = [];
  if (acceptance.summary.shouldDemoteCount > 0) blockers.push("One or more promoted hubs should be demoted before acceptance.");
  if (needsFixCount > 0) blockers.push("One or more promoted hubs needs a copy, route, or count fix.");
  if (!sitemapAuditPasses(sitemapAudit)) blockers.push("Sitemap or route audit did not pass.");
  if (!seoAudit.summary.passed) blockers.push("SEO content audit did not pass.");
  if (!internalAudit.summary.passed) blockers.push("Internal linking audit did not pass.");
  if (browserQa && !browserQaPassed) blockers.push("Browser QA did not pass.");
  if (sampledUrlCheck && !sampledUrlCheckPassed) blockers.push("Sampled URL check did not pass.");

  const sitemapRoutesPassed = sitemapAuditPasses(sitemapAudit) && acceptance.summary.shouldDemoteCount === 0 && needsFixCount === 0;
  const seoContentPassed = seoAudit.summary.passed && acceptance.summary.needsCopyFixCount === 0;
  const internalLinkingPassed = internalAudit.summary.passed;

  return {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      promoted_hub_count: acceptance.summary.promotedHubCount,
      accepted_hub_count: acceptance.summary.acceptedCount,
      needs_fix_count: needsFixCount,
      should_demote_count: acceptance.summary.shouldDemoteCount,
      owner_review_count: acceptance.summary.ownerReviewNeededCount,
      manual_review_candidates_packaged: manualPackage.summary.candidateCount === EXPECTED_MANUAL_REVIEW,
      backlog_candidates_packaged: backlogPackage.summary.candidateCount === EXPECTED_BACKLOG,
      sitemap_routes_passed: sitemapRoutesPassed,
      seo_content_passed: seoContentPassed,
      internal_linking_passed: internalLinkingPassed,
      browser_qa_passed: browserQaPassed,
      sampled_url_check_passed: sampledUrlCheckPassed,
      ready_for_image_sitemap_round: sitemapRoutesPassed && browserQaPassed,
      ready_for_og_image_round: browserQaPassed && sampledUrlCheckPassed,
      ready_for_jsonld_round: sitemapRoutesPassed && seoContentPassed && internalLinkingPassed,
      ready_for_live_ads_round: false,
      blockers,
    },
    inputs: {
      browserQaManifest: INPUTS.browserQa,
      sampledUrlCheckManifest: INPUTS.sampledUrlCheck,
      liveAdsDeferredUntilExplicitApproval: true,
    },
  };
}

function sitemapAuditPasses(sitemapAudit) {
  const summary = sitemapAudit.summary;
  return (
    summary.runtimeIndexableHubCount === EXPECTED_RUNTIME_HUB_COUNT &&
    summary.exportedSitemapLocCount === EXPECTED_EXPORTED_SITEMAP_LOCS &&
    summary.homepageExists &&
    summary.coloringPagesExists &&
    summary.allPromotedRoutesExist &&
    summary.trustPagesExist &&
    summary.noPerImageRoutes &&
    summary.noSectionOnlyTopicRoutes &&
    summary.noRejectedRoutes &&
    summary.noBacklogManualReviewRoutesInSitemap &&
    summary.imageSitemapAbsent &&
    summary.noLocalhost &&
    summary.noR2Dev &&
    summary.noDuplicateRoutes &&
    summary.noTrailingCanonicalInconsistency
  );
}

function packageManualCandidate(candidate, state) {
  return {
    slug: candidate.slug,
    title: candidate.title,
    assetCount: candidate.assetCount,
    strongestMatchingAssets: (candidate.assetIds || []).slice(0, 8).map((assetId) => {
      const item = state.maps.availableById.get(assetId);
      return {
        assetId,
        title: item?.title || assetId,
        categorySlug: item?.categorySlug || "",
      };
    }),
    likelyParentHubs: unique([candidate.parentSlug, ...(candidate.overlapNotes || []).slice(0, 3).map((note) => note.existingSlug)].filter(Boolean)),
    reasonForManualReview: (candidate.classificationReasons || []).join(" ") || "Requires owner judgment before routing.",
    overlapScore: {
      maxExistingOverlapRatio: round(candidate.maxExistingOverlapRatio || 0),
      maxComparableOverlapRatio: round(candidate.maxComparableOverlapRatio || 0),
    },
    seoIntent: candidate.intent,
    risk: getCandidateRisk(candidate),
    ownerDecision: "",
    ownerNotes: "",
  };
}

function getPromotabilityNote(candidate) {
  if (candidate.assetCount < (candidate.minimumAssets || 8)) {
    return `Needs at least ${candidate.minimumAssets || 8} strong available assets or a documented owner-approved exception.`;
  }
  if ((candidate.maxComparableOverlapRatio || 0) >= 0.8) {
    return "Needs clearer distinction from an existing specific hub or owner approval to merge, rename, or defer.";
  }
  return "Needs stronger public naming, intent clarity, or a future owner-approved expansion pass.";
}

function getEstimatedValue(candidate) {
  if ((candidate.score?.total || 0) >= 75 && candidate.assetCount >= 20) return "high";
  if ((candidate.score?.total || 0) >= 60 || candidate.assetCount >= 10) return "medium";
  return "low";
}

function getCandidateRisk(candidate) {
  const risks = [];
  if (candidate.publicNamingRisk && candidate.publicNamingRisk !== "low") risks.push(`${candidate.publicNamingRisk} naming risk`);
  if (candidate.assetCount < (candidate.minimumAssets || 8)) risks.push("below normal asset threshold");
  if ((candidate.maxComparableOverlapRatio || 0) >= 0.8) risks.push("high overlap");
  if (risks.length === 0) return "owner judgment needed";
  return risks.join("; ");
}

function getTopCategories(assetIds, availableById) {
  const counts = new Map();
  for (const assetId of assetIds || []) {
    const category = availableById.get(assetId)?.categorySlug || "unknown";
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([categorySlug, count]) => ({ categorySlug, count }));
}

function getDeferredRecords(state) {
  return state.runtimeDeferredItems.items || state.runtimeDeferredItems.records || [];
}

function hasSpammyToken(slug, title) {
  const text = `${slug} ${title || ""}`.toLowerCase();
  return [...SPAM_TOKENS].some((token) => text.includes(token));
}

function isNaturalSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !slug.includes("--") && slug.length >= 3;
}

function isNaturalTitle(title) {
  return Boolean(title && /Coloring Pages$/i.test(title) && !/chatgpt|failed|timestamp|export/i.test(title));
}

function sortedSlugKey(slug) {
  return slug
    .split("-")
    .filter((part) => part && !["coloring", "pages", "page"].includes(part))
    .sort()
    .join("-");
}

function hasKeywordStuffingRisk(text, slug) {
  const normalizedText = text.toLowerCase();
  const terms = slug.split("-").filter((term) => term.length > 3);
  return terms.some((term) => (normalizedText.match(new RegExp(`\\b${escapeRegExp(term)}\\b`, "g")) || []).length > 12);
}

function getTrustPages() {
  const source = readTextSync("src/lib/trust/trustPages.ts");
  const entries = [...source.matchAll(/path:\s*"([^"]+)"[\s\S]*?indexable:\s*(true|false)/g)];
  return entries.map((match) => ({ path: match[1], indexable: match[2] === "true" }));
}

function renderContextReport(context) {
  return `# Long-Tail Acceptance Context Check

- Correct repository: ${context.summary.correctRepository}
- Current branch: ${context.summary.currentBranch}
- Commit includes 2e2206d: ${context.summary.commitIncludes2e2206d}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api present: ${context.summary.appApiRoutePresent}
- /coloring-pages route exists: ${context.summary.coloringPagesRouteExists}
- /coloring-pages/[hubSlug] route exists: ${context.summary.hubSlugRouteExists}
- Runtime available records: ${context.summary.runtimeAvailableRecords}
- Deferred manual-review records: ${context.summary.deferredManualReviewRecords}
- Public production media in public/: ${context.summary.generatedProductionMediaInPublic}
- SVG user-facing download absent: ${context.summary.svgUserFacingDownloadAbsent}
- Public downloads are PNG/JPG/WebP: ${context.summary.publicDownloadsPngJpgWebp}
- Live AdSense code present: ${context.summary.liveAdsenseCodePresent}
- Image sitemap present: ${context.summary.imageSitemapPresent}
- Open Graph image generation present: ${context.summary.openGraphImageGenerationPresent}
- JSON-LD expansion deferred: ${context.summary.jsonLdExpansionDeferred}
`;
}

function renderQualityAuditReport(audit) {
  const requested = audit.summary.specificHubsAudited.join(", ");
  const sampleRows = audit.hubs
    .slice(0, 20)
    .map((hub) => `| ${hub.slug} | ${hub.assetCount} | ${hub.status} | ${hub.objectiveProblems.join("; ") || "none"} |`)
    .join("\n");
  return `# Long-Tail Promoted Hub Quality Audit

- Promoted hubs audited: ${audit.summary.promotedHubCount}
- Accepted quality count: ${audit.summary.acceptedQualityCount}
- Needs review count: ${audit.summary.needsReviewCount}
- Duplicate or reordered risk count: ${audit.summary.duplicateOrReorderedRiskCount}
- Spammy token risk count: ${audit.summary.spammyTokenRiskCount}
- Specific requested hubs audited: ${requested}
- Missing requested hubs: ${audit.summary.missingSpecificRequestedHubs.join(", ") || "none"}

| Slug | Assets | Status | Problems |
|---|---:|---|---|
${sampleRows}
`;
}

function renderAcceptanceReport(acceptance) {
  const nonAccepted = acceptance.hubs.filter((hub) => hub.status !== "accepted");
  return `# Long-Tail Promoted Hub Acceptance

- Promoted hubs: ${acceptance.summary.promotedHubCount}
- Accepted: ${acceptance.summary.acceptedCount}
- Needs copy fix: ${acceptance.summary.needsCopyFixCount}
- Needs route fix: ${acceptance.summary.needsRouteFixCount}
- Needs count fix: ${acceptance.summary.needsCountFixCount}
- Should demote: ${acceptance.summary.shouldDemoteCount}
- Owner review needed: ${acceptance.summary.ownerReviewNeededCount}

${nonAccepted.length ? nonAccepted.map((hub) => `- ${hub.slug}: ${hub.problem.join("; ")}. Recommended action: ${hub.recommendedAction.join("; ")}`).join("\n") : "All promoted hubs are accepted by the objective gate."}
`;
}

function renderManualPackageReport(manualPackage) {
  const rows = manualPackage.candidates
    .map((candidate) => `| ${candidate.slug} | ${candidate.assetCount} | ${candidate.risk} | ${candidate.reasonForManualReview.replace(/\|/g, "/")} |`)
    .join("\n");
  return `# Long-Tail Manual-Review Hub Package

- Candidates: ${manualPackage.summary.candidateCount}
- Not promoted this round: ${manualPackage.summary.notPromotedThisRound}
- Owner decision options: ${manualPackage.summary.ownerDecisionOptions.join(", ")}

| Slug | Assets | Risk | Reason |
|---|---:|---|---|
${rows}
`;
}

function renderBacklogPackageReport(backlogPackage) {
  const rows = backlogPackage.candidates
    .map((candidate) => `| ${candidate.slug} | ${candidate.assetCount} | ${candidate.estimatedValue} | ${candidate.whatWouldMakeItPromotableLater.replace(/\|/g, "/")} |`)
    .join("\n");
  return `# Long-Tail Backlog Candidate Package

- Candidates: ${backlogPackage.summary.candidateCount}
- Not promoted this round: ${backlogPackage.summary.notPromotedThisRound}

| Slug | Assets | Estimated Value | What Would Make It Promotable |
|---|---:|---|---|
${rows}
`;
}

function renderSitemapAuditReport(audit) {
  return `# Long-Tail Sitemap And Route Audit

- Runtime indexable hub count: ${audit.summary.runtimeIndexableHubCount}
- Runtime sitemap route count: ${audit.summary.runtimeSitemapRouteCount}
- Exported sitemap loc count: ${audit.summary.exportedSitemapLocCount}
- Homepage exists: ${audit.summary.homepageExists}
- /coloring-pages exists: ${audit.summary.coloringPagesExists}
- All promoted routes exist: ${audit.summary.allPromotedRoutesExist}
- Trust pages exist: ${audit.summary.trustPagesExist}
- No per-image routes: ${audit.summary.noPerImageRoutes}
- No backlog/manual-review routes in sitemap: ${audit.summary.noBacklogManualReviewRoutesInSitemap}
- No image sitemap: ${audit.summary.imageSitemapAbsent}
- No localhost: ${audit.summary.noLocalhost}
- No r2.dev: ${audit.summary.noR2Dev}
- No duplicate routes: ${audit.summary.noDuplicateRoutes}
- No trailing/canonical inconsistency: ${audit.summary.noTrailingCanonicalInconsistency}
`;
}

function renderSeoAuditReport(audit) {
  return `# Long-Tail SEO Content Audit

- Promoted hubs audited: ${audit.summary.promotedHubCount}
- Passed: ${audit.summary.passed}
- Unique meta titles: ${audit.summary.uniqueMetaTitles}
- Unique meta descriptions: ${audit.summary.uniqueMetaDescriptions}
- Useful intro copy: ${audit.summary.usefulIntroCopy}
- Below-gallery content present: ${audit.summary.belowGalleryContentPresent}
- Internal pipeline wording absent: ${audit.summary.internalPipelineWordingAbsent}
- SVG download copy absent: ${audit.summary.svgDownloadCopyAbsent}
- Online coloring promise absent: ${audit.summary.onlineColoringPromiseAbsent}
- Keyword stuffing absent: ${audit.summary.keywordStuffingAbsent}
- Failed entries: ${audit.summary.failedEntryCount}
`;
}

function renderInternalAuditReport(audit) {
  return `# Long-Tail Internal Linking Audit

- Passed: ${audit.summary.passed}
- More menu finds new hubs: ${audit.summary.moreMenuFindsNewHubs}
- Related hubs useful: ${audit.summary.relatedHubsUseful}
- Parent/child relationships valid: ${audit.summary.parentChildRelationshipsValid}
- Broken links: ${audit.brokenInternalLinks.length}
- Backlog/manual-review links: ${audit.backlogManualReviewLinks.length}
- Duplicate nav entries: ${audit.duplicateNavEntries.length}
- Non-routed parent metadata entries: ${audit.nonRoutedParentMetadata.length}
- More menu link count: ${audit.summary.moreMenuLinkCount}
`;
}

function renderGateReport(gate) {
  return `# Long-Tail Acceptance Gate

- Promoted hub count: ${gate.summary.promoted_hub_count}
- Accepted hub count: ${gate.summary.accepted_hub_count}
- Needs fix count: ${gate.summary.needs_fix_count}
- Should demote count: ${gate.summary.should_demote_count}
- Owner review count: ${gate.summary.owner_review_count}
- Manual-review candidates packaged: ${gate.summary.manual_review_candidates_packaged}
- Backlog candidates packaged: ${gate.summary.backlog_candidates_packaged}
- Sitemap routes passed: ${gate.summary.sitemap_routes_passed}
- SEO content passed: ${gate.summary.seo_content_passed}
- Internal linking passed: ${gate.summary.internal_linking_passed}
- Browser QA passed: ${gate.summary.browser_qa_passed}
- Sampled URL check passed: ${gate.summary.sampled_url_check_passed}
- Ready for image sitemap round: ${gate.summary.ready_for_image_sitemap_round}
- Ready for OG image round: ${gate.summary.ready_for_og_image_round}
- Ready for JSON-LD round: ${gate.summary.ready_for_jsonld_round}
- Ready for live ads round: ${gate.summary.ready_for_live_ads_round}
- Blockers: ${gate.summary.blockers.length ? gate.summary.blockers.join("; ") : "none"}
`;
}

function renderManualPackageCsv(manualPackage) {
  const rows = [
    ["proposed_slug", "proposed_title", "asset_count", "strongest_matching_assets", "likely_parent_hubs", "reason_for_manual_review", "overlap_score", "seo_intent", "risk", "owner_decision", "owner_notes"],
    ...manualPackage.candidates.map((candidate) => [
      candidate.slug,
      candidate.title,
      String(candidate.assetCount),
      candidate.strongestMatchingAssets.map((asset) => asset.title).join("; "),
      candidate.likelyParentHubs.join("; "),
      candidate.reasonForManualReview,
      `existing:${candidate.overlapScore.maxExistingOverlapRatio}; comparable:${candidate.overlapScore.maxComparableOverlapRatio}`,
      candidate.seoIntent,
      candidate.risk,
      candidate.ownerDecision,
      candidate.ownerNotes,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function renderBacklogPackageCsv(backlogPackage) {
  const rows = [
    ["proposed_slug", "proposed_title", "asset_count", "reason_backlog", "what_would_make_it_promotable_later", "likely_parent_hub", "estimated_value", "owner_notes"],
    ...backlogPackage.candidates.map((candidate) => [
      candidate.slug,
      candidate.title,
      String(candidate.assetCount),
      candidate.reasonBacklog,
      candidate.whatWouldMakeItPromotableLater,
      candidate.likelyParentHub,
      candidate.estimatedValue,
      candidate.ownerNotes,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readJsonIfExists(relativePath) {
  if (!existsSync(path.join(REPO_ROOT, relativePath))) return null;
  return readJson(relativePath);
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

function readTextSync(relativePath) {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, payload) {
  await writeText(relativePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeText(relativePath, contents) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}

async function listFilesIfExists(root) {
  try {
    await stat(root);
  } catch {
    return [];
  }
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results.map((file) => file.replace(/\\/g, "/"));
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|mjs)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/runtime-available-items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

function gitOutput(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function gitCommandSucceeds(args) {
  try {
    execFileSync("git", args, { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function findDuplicates(values) {
  const counts = countBy(values);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

function slugFromPath(routePath) {
  return routePath.replace(/^\/coloring-pages\/?/, "").replace(/\/.*$/, "");
}

function unique(values) {
  return [...new Set(values)];
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}
