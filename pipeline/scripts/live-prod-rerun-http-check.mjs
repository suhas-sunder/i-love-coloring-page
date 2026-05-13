#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const EXPECTED_COMMIT = "08fd170";
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;

const URLS = [
  `${SITE_URL}/`,
  `${SITE_URL}/coloring-pages`,
  `${SITE_URL}/coloring-pages/`,
  `${SITE_URL}/coloring-pages/animals`,
  `${SITE_URL}/coloring-pages/animals/`,
  `${SITE_URL}/coloring-pages/geometric`,
  `${SITE_URL}/coloring-pages/christmas`,
  `${SITE_URL}/contact`,
  `${SITE_URL}/privacy`,
  `${SITE_URL}/sitemap.xml`,
  `${SITE_URL}/robots.txt`,
];

const outputFiles = {
  contextManifest: "pipeline/manifests/live-prod-rerun-context-check.json",
  contextReport: "pipeline/reports/live-prod-rerun-context-check.md",
  deployManifest: "pipeline/manifests/live-prod-deploy-commit-check.json",
  deployReport: "pipeline/reports/live-prod-deploy-commit-check.md",
  httpManifest: "pipeline/manifests/live-prod-rerun-http-results.json",
  httpReport: "pipeline/reports/live-prod-rerun-http-report.md",
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const generatedAt = new Date().toISOString();
  const context = await buildContext(generatedAt);
  await writeJson(outputFiles.contextManifest, context);
  await writeText(outputFiles.contextReport, renderContextReport(context));

  const checks = [];
  for (const url of URLS) {
    checks.push(await checkUrl(url));
  }

  const http = buildHttpPayload(generatedAt, checks);
  await writeJson(outputFiles.httpManifest, http);
  await writeText(outputFiles.httpReport, renderHttpReport(http));

  const deployment = buildDeploymentCheck(generatedAt, http);
  await writeJson(outputFiles.deployManifest, deployment);
  await writeText(outputFiles.deployReport, renderDeploymentReport(deployment));

  console.log(JSON.stringify({
    contextPassed: context.summary.correctProjectContext,
    liveRootReachable: http.summary.liveRootReachable,
    nonRootRoutesReachable: http.summary.nonRootRoutesReachable,
    selfRedirectDetected: http.summary.selfRedirectDetected,
    sitemapCurrent: http.summary.sitemapCurrent,
    productionDeployCurrent: deployment.summary.productionDeployCurrent,
    blockers: [...context.blockers, ...http.blockers, ...deployment.blockers],
  }, null, 2));
}

async function buildContext(generatedAt) {
  const repoRoot = await git(["rev-parse", "--show-toplevel"]);
  const branch = await git(["branch", "--show-current"]);
  const commitExists = (await gitMaybe(["cat-file", "-t", EXPECTED_COMMIT])).trim() === "commit";
  const nextConfig = await readText("next.config.mjs");
  const packageJson = await readJson("package.json");
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const assetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const assets = await readText("src/lib/coloring/assets.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const appText = await readProjectText(["app", "src", "next.config.mjs", "netlify.toml"]);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const imagesStatus = await gitMaybe(["status", "--short", "--", "images"]);
  const ilovesvgStatus = await gitMaybe(["status", "--short", "--", "ilovesvg"]);
  const appApiAbsent = !existsSync(path.join(REPO_ROOT, "app", "api"));
  const wrongRepoSignals = /I Love SVG|image-to-favicon-generator|Vite-specific|routeManifestClientAssets/i.test(appText);

  const summary = {
    repoRoot,
    projectName: path.basename(repoRoot),
    correctProjectName: path.basename(repoRoot) === "i-love-coloring-page" && packageJson.name === "i-love-coloring-page",
    branch,
    expectedBranch: "version-4",
    onExpectedBranch: branch === "version-4",
    localPreviewFixCommitExists: commitExists,
    appApiAbsent,
    staticExportConfigured: /output:\s*"export"/.test(nextConfig),
    runtimeGeneratedDataExists: available.summary?.itemCount === EXPECTED_AVAILABLE_RECORDS && assetPaths.summary?.recordCount === EXPECTED_AVAILABLE_RECORDS,
    runtimeAvailableRecords: available.summary?.itemCount || 0,
    deferredRecordsHidden: available.summary?.deferredRecordsHidden || 0,
    publicSafeDefaultsExist:
      siteConfig.includes(SITE_URL) &&
      siteConfig.includes(ASSET_BASE_URL) &&
      siteConfig.includes(CONTACT_EMAIL) &&
      assets.includes(ASSET_BASE_URL),
    publicDefaultsDoNotRequireNetlifyEnv: !/throw new Error|process\.exit/.test(siteConfig),
    publicContainsGeneratedProductionMedia: publicFiles.some((file) => /(?:^|\/)(?:coloring-pages|svg|webp|png|thumbs)\//i.test(file)),
    imagesUntouched: imagesStatus.trim() === "",
    ilovesvgUntouched: ilovesvgStatus.trim() === "",
    svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(`${downloadMenu}\n${browserDownloads}`),
    publicDownloadsPngJpgWebp:
      /label:\s*"PNG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"png"/.test(`${downloadMenu}\n${browserDownloads}`) &&
      /label:\s*"JPG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"jpg"/.test(`${downloadMenu}\n${browserDownloads}`) &&
      /label:\s*"WebP"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"webp"/.test(`${downloadMenu}\n${browserDownloads}`),
    liveAdSenseCodeAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(appText),
    imageSitemapAbsent: !/image-sitemap|ImageSitemap|xmlns:image|image:image/i.test(appText),
    ogImageGenerationAbsent: !/opengraph-image|twitter-image|ImageResponse/i.test(appText),
    wrongRepoSignalsDetected: wrongRepoSignals,
  };

  summary.correctProjectContext = [
    summary.correctProjectName,
    summary.onExpectedBranch,
    summary.localPreviewFixCommitExists,
    summary.appApiAbsent,
    summary.staticExportConfigured,
    summary.runtimeGeneratedDataExists,
    summary.publicSafeDefaultsExist,
    summary.publicDefaultsDoNotRequireNetlifyEnv,
    !summary.publicContainsGeneratedProductionMedia,
    summary.imagesUntouched,
    summary.ilovesvgUntouched,
    summary.svgInternalOnly,
    summary.publicDownloadsPngJpgWebp,
    summary.liveAdSenseCodeAbsent,
    summary.imageSitemapAbsent,
    summary.ogImageGenerationAbsent,
    !summary.wrongRepoSignalsDetected,
  ].every(Boolean);

  const blockers = [];
  for (const [key, value] of Object.entries(summary)) {
    if (typeof value === "boolean" && key !== "correctProjectContext" && value !== true) {
      if (["publicContainsGeneratedProductionMedia", "wrongRepoSignalsDetected"].includes(key)) continue;
      blockers.push(key);
    }
  }
  if (summary.publicContainsGeneratedProductionMedia) blockers.push("publicContainsGeneratedProductionMedia");
  if (summary.wrongRepoSignalsDetected) blockers.push("wrongRepoSignalsDetected");

  return {
    generatedAt,
    runId: "live-prod-rerun-context-check",
    expectedCommit: EXPECTED_COMMIT,
    summary,
    blockers,
  };
}

async function checkUrl(url) {
  const startedAt = Date.now();
  const chain = [];
  let currentUrl = url;
  let current = await fetchManual(currentUrl);
  chain.push(toResponseRecord(currentUrl, current));
  let selfRedirectDetected = false;

  for (let hop = 0; hop < 8 && isRedirect(current.status) && current.location; hop += 1) {
    const nextUrl = new URL(current.location, currentUrl).toString();
    if (normalizeComparableUrl(nextUrl) === normalizeComparableUrl(currentUrl)) {
      selfRedirectDetected = true;
      break;
    }
    currentUrl = nextUrl;
    current = await fetchManual(currentUrl);
    chain.push(toResponseRecord(currentUrl, current));
  }

  let body = "";
  if (!isRedirect(current.status)) {
    try {
      body = await current.response.text();
    } catch {
      body = "";
    }
  }

  const pathname = new URL(url).pathname;
  const expected = expectedMarker(pathname);
  const sitemapLocs = pathname === "/sitemap.xml" ? [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]) : [];
  const routeMarkerOk = expected ? body.includes(expected) : true;
  const pageStale = pageLooksStale(pathname, body, sitemapLocs, current.status);

  return {
    url,
    status: chain[0].status,
    finalStatus: current.status,
    finalUrl: currentUrl,
    redirectCount: chain.length - 1,
    location: chain[0].location,
    contentType: current.contentType || chain[0].contentType,
    expectedRouteMarker: expected,
    bodyContainsExpectedRouteMarker: routeMarkerOk,
    bodyContainsRuntimeCount6352: body.includes("6,352") || body.includes("6352"),
    bodyContainsOldCount6557: body.includes("6,557") || body.includes("6557"),
    bodyContainsAssetBaseUrl: body.includes(ASSET_BASE_URL),
    bodyContainsAnimalsAlligatorWebp: body.includes(`${ASSET_BASE_URL}/webp/animals/animals-alligator-4feec8505a.webp`),
    bodyContainsPreviewUnavailable: /Preview unavailable/i.test(body),
    pageAppearsStale: pageStale,
    selfRedirectDetected,
    sitemapLocCount: sitemapLocs.length || null,
    sitemapLocs: pathname === "/sitemap.xml" ? sitemapLocs : undefined,
    elapsedMs: Date.now() - startedAt,
    chain,
    error: current.error,
  };
}

function buildHttpPayload(generatedAt, checks) {
  const byUrl = new Map(checks.map((check) => [check.url, check]));
  const root = byUrl.get(`${SITE_URL}/`);
  const nonRootUrls = [
    `${SITE_URL}/coloring-pages`,
    `${SITE_URL}/coloring-pages/animals`,
    `${SITE_URL}/coloring-pages/geometric`,
    `${SITE_URL}/coloring-pages/christmas`,
    `${SITE_URL}/contact`,
    `${SITE_URL}/privacy`,
  ];
  const nonRootChecks = nonRootUrls.map((url) => byUrl.get(url)).filter(Boolean);
  const sitemap = byUrl.get(`${SITE_URL}/sitemap.xml`);
  const robots = byUrl.get(`${SITE_URL}/robots.txt`);
  const selfRedirects = checks.filter((check) => check.selfRedirectDetected).map((check) => check.url);
  const stalePages = checks.filter((check) => check.pageAppearsStale).map((check) => check.url);
  const sitemapLocs = sitemap?.sitemapLocs || [];
  const trustRoutes = ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"];

  const sitemapCurrent = Boolean(
    sitemap &&
      sitemap.finalStatus === 200 &&
      sitemapLocs.length >= 72 &&
      sitemapLocs.includes(`${SITE_URL}/`) &&
      sitemapLocs.includes(`${SITE_URL}/coloring-pages`) &&
      sitemapLocs.includes(`${SITE_URL}/coloring-pages/animals`) &&
      trustRoutes.every((route) => sitemapLocs.includes(`${SITE_URL}${route}`)),
  );

  const summary = {
    checkedUrlCount: checks.length,
    liveRootReachable: root?.finalStatus === 200,
    nonRootRoutesReachable: nonRootChecks.every((check) => check.finalStatus === 200 && !check.selfRedirectDetected && !check.pageAppearsStale),
    nonRootRoutes200OrCanonicalRedirectTo200: nonRootChecks.every((check) => check.finalStatus === 200 && !check.selfRedirectDetected),
    selfRedirectDetected: selfRedirects.length > 0,
    selfRedirectUrls: selfRedirects,
    sitemapCurrent,
    robotsReachable: Boolean(robots && robots.finalStatus === 200 && robots.bodyContainsExpectedRouteMarker),
    runtimeSwitchActiveInLiveHtml:
      checks.some((check) => check.bodyContainsRuntimeCount6352 || check.bodyContainsAssetBaseUrl) &&
      !checks.some((check) => check.bodyContainsOldCount6557 && !check.bodyContainsRuntimeCount6352),
    animalsAlligatorWebpInLiveHtml: checks.some((check) => check.bodyContainsAnimalsAlligatorWebp),
    previewUnavailableInLiveHtml: checks.some((check) => check.bodyContainsPreviewUnavailable),
    stalePageUrls: stalePages,
    likelyStaleDeployment: Boolean(root?.finalStatus === 200 && (!sitemapCurrent || stalePages.length > 0)),
  };

  const blockers = [];
  if (!summary.liveRootReachable) blockers.push("Live root page is not reachable.");
  if (!summary.nonRootRoutesReachable) blockers.push("One or more non-root pages are stale, redirecting, or not serving clean 200 responses.");
  if (summary.selfRedirectDetected) blockers.push(`Self-referential redirects remain: ${selfRedirects.join(", ")}.`);
  if (!summary.sitemapCurrent) blockers.push("Live sitemap is stale or missing generated routes and trust pages.");
  if (!summary.robotsReachable) blockers.push("Live robots.txt is not reachable or does not reference the production sitemap.");
  if (!summary.runtimeSwitchActiveInLiveHtml) blockers.push("Live HTML does not show the 08fd170 runtime asset behavior.");

  return {
    generatedAt,
    runId: "live-prod-rerun-http-check",
    siteUrl: SITE_URL,
    checkedUrls: URLS,
    summary,
    checks,
    blockers,
  };
}

function buildDeploymentCheck(generatedAt, http) {
  const summary = {
    expectedCommit: EXPECTED_COMMIT,
    productionDeployCurrent:
      http.summary.nonRootRoutesReachable &&
      http.summary.sitemapCurrent &&
      http.summary.runtimeSwitchActiveInLiveHtml &&
      http.summary.animalsAlligatorWebpInLiveHtml,
    appearsToIncludeLocalPreviewFixBehavior:
      http.summary.runtimeSwitchActiveInLiveHtml &&
      http.summary.animalsAlligatorWebpInLiveHtml &&
      !http.summary.previewUnavailableInLiveHtml,
    homepageCount6352: http.checks.find((check) => check.url === `${SITE_URL}/`)?.bodyContainsRuntimeCount6352 || false,
    liveAssetBaseIsCustomDomain: http.checks.some((check) => check.bodyContainsAssetBaseUrl),
    localhostAbsent: http.checks.every((check) => !/localhost|127\.0\.0\.1/i.test(JSON.stringify(check))),
    r2DevAbsent: http.checks.every((check) => !/r2\.dev/i.test(JSON.stringify(check))),
    liveSitemapCurrent: http.summary.sitemapCurrent,
    nonRootPagesReachable: http.summary.nonRootRoutesReachable,
    netlifyDeploymentStale: http.summary.likelyStaleDeployment || !http.summary.runtimeSwitchActiveInLiveHtml,
  };

  const blockers = [];
  if (!summary.productionDeployCurrent) blockers.push("Live production does not appear to serve commit 08fd170 behavior.");
  if (summary.netlifyDeploymentStale) {
    blockers.push("Owner action required: verify Netlify production branch is version-4, publish directory is out, then trigger a fresh deploy from the latest version-4 commit.");
  }

  return {
    generatedAt,
    runId: "live-prod-deploy-commit-check",
    siteUrl: SITE_URL,
    summary,
    blockers,
  };
}

function expectedMarker(pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/") return "I Love Coloring Page";
  if (normalized === "/coloring-pages") return "Find a coloring page";
  if (normalized === "/coloring-pages/animals") return "Animals";
  if (normalized === "/coloring-pages/geometric") return "Geometric";
  if (normalized === "/coloring-pages/christmas") return "Christmas";
  if (normalized === "/contact") return "Contact";
  if (normalized === "/privacy") return "Privacy";
  if (normalized === "/sitemap.xml") return "<urlset";
  if (normalized === "/robots.txt") return `Sitemap: ${SITE_URL}/sitemap.xml`;
  return "";
}

function pageLooksStale(pathname, body, sitemapLocs, status) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (status !== 200) return true;
  if (!body) return true;
  if (/I Love SVG|image-to-favicon-generator|routeManifestClientAssets|Vite-specific/i.test(body)) return true;
  if (normalized === "/sitemap.xml") return sitemapLocs.length < 72 || !sitemapLocs.includes(`${SITE_URL}/coloring-pages/animals`);
  if (normalized === "/robots.txt") return !body.includes(`${SITE_URL}/sitemap.xml`);
  if (normalized === "/" || normalized.startsWith("/coloring-pages")) {
    return !body.includes("6,352") || !body.includes(ASSET_BASE_URL);
  }
  if (["/contact", "/privacy"].includes(normalized)) {
    return !body.includes("I Love Coloring Page") || !body.includes(CONTACT_EMAIL);
  }
  return false;
}

async function fetchManual(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "user-agent": "codex-live-prod-rerun/1.0",
        accept: "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });
    return {
      response,
      status: response.status,
      location: response.headers.get("location") || "",
      contentType: response.headers.get("content-type") || "",
      error: "",
    };
  } catch (error) {
    return {
      response: new Response(""),
      status: 0,
      location: "",
      contentType: "",
      error: error?.message || String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toResponseRecord(url, result) {
  return {
    url,
    status: result.status,
    location: result.location,
    contentType: result.contentType,
    error: result.error,
  };
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function normalizeComparableUrl(value) {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
    if (!existsSync(absoluteRoot)) continue;
    const files = statSync(absoluteRoot).isFile()
      ? [relativeRoot]
      : await listFilesIfExists(absoluteRoot);
    for (const file of files) {
      if (!/\.(?:ts|tsx|css|json|md|mjs|toml)$/.test(file)) continue;
      if (file.startsWith("src/generated/coloring/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }

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

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 5 });
  return stdout.trim();
}

async function gitMaybe(args) {
  try {
    return await git(args);
  } catch {
    return "";
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, data) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${text.replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`, "utf8");
}

function pass(value) {
  return value ? "pass" : "fail";
}

function renderContextReport(payload) {
  return [
    "# Live Production Rerun Context Check",
    "",
    `- Project: ${payload.summary.projectName}`,
    `- Branch: ${payload.summary.branch}`,
    `- Commit ${EXPECTED_COMMIT} exists: ${pass(payload.summary.localPreviewFixCommitExists)}`,
    `- Static export configured: ${pass(payload.summary.staticExportConfigured)}`,
    `- app/api absent: ${pass(payload.summary.appApiAbsent)}`,
    `- Runtime records: ${payload.summary.runtimeAvailableRecords}`,
    `- Deferred records hidden: ${payload.summary.deferredRecordsHidden}`,
    `- Public-safe defaults exist: ${pass(payload.summary.publicSafeDefaultsExist)}`,
    `- images/ untouched: ${pass(payload.summary.imagesUntouched)}`,
    `- ilovesvg/ untouched: ${pass(payload.summary.ilovesvgUntouched)}`,
    `- SVG internal only: ${pass(payload.summary.svgInternalOnly)}`,
    `- Live AdSense absent: ${pass(payload.summary.liveAdSenseCodeAbsent)}`,
    `- Image sitemap absent: ${pass(payload.summary.imageSitemapAbsent)}`,
    `- OG image generation absent: ${pass(payload.summary.ogImageGenerationAbsent)}`,
    `- Result: ${pass(payload.summary.correctProjectContext)}`,
    `- Blockers: ${payload.blockers.length ? payload.blockers.join(", ") : "none"}`,
  ].join("\n");
}

function renderHttpReport(payload) {
  return [
    "# Live Production Rerun HTTP Report",
    "",
    `- Site: ${payload.siteUrl}`,
    `- Checked URLs: ${payload.summary.checkedUrlCount}`,
    `- Live root reachable: ${pass(payload.summary.liveRootReachable)}`,
    `- Non-root routes reachable: ${pass(payload.summary.nonRootRoutesReachable)}`,
    `- Non-root routes 200 or canonical redirect to 200: ${pass(payload.summary.nonRootRoutes200OrCanonicalRedirectTo200)}`,
    `- Self-redirect detected: ${pass(payload.summary.selfRedirectDetected)}`,
    `- Sitemap current: ${pass(payload.summary.sitemapCurrent)}`,
    `- Robots reachable: ${pass(payload.summary.robotsReachable)}`,
    `- Runtime switch active in live HTML: ${pass(payload.summary.runtimeSwitchActiveInLiveHtml)}`,
    `- Animals Alligator WebP in live HTML: ${pass(payload.summary.animalsAlligatorWebpInLiveHtml)}`,
    `- Preview unavailable in live HTML: ${pass(payload.summary.previewUnavailableInLiveHtml)}`,
    `- Likely stale deployment: ${pass(payload.summary.likelyStaleDeployment)}`,
    `- Blockers: ${payload.blockers.length ? payload.blockers.join(" ") : "none"}`,
    "",
    "## Route Results",
    "",
    ...payload.checks.map((check) =>
      `- ${check.url}: status ${check.status}, final ${check.finalStatus}, final URL ${check.finalUrl}, self redirect ${check.selfRedirectDetected}, stale ${check.pageAppearsStale}`,
    ),
  ].join("\n");
}

function renderDeploymentReport(payload) {
  return [
    "# Live Production Deploy Commit Check",
    "",
    `- Expected commit behavior: ${payload.summary.expectedCommit}`,
    `- Production deploy current: ${pass(payload.summary.productionDeployCurrent)}`,
    `- Includes local preview fix behavior: ${pass(payload.summary.appearsToIncludeLocalPreviewFixBehavior)}`,
    `- Homepage count is 6,352: ${pass(payload.summary.homepageCount6352)}`,
    `- Custom asset base present: ${pass(payload.summary.liveAssetBaseIsCustomDomain)}`,
    `- localhost absent: ${pass(payload.summary.localhostAbsent)}`,
    `- r2.dev absent: ${pass(payload.summary.r2DevAbsent)}`,
    `- Live sitemap current: ${pass(payload.summary.liveSitemapCurrent)}`,
    `- Non-root pages reachable: ${pass(payload.summary.nonRootPagesReachable)}`,
    `- Netlify deployment stale: ${pass(payload.summary.netlifyDeploymentStale)}`,
    `- Blockers: ${payload.blockers.length ? payload.blockers.join(" ") : "none"}`,
  ].join("\n");
}
