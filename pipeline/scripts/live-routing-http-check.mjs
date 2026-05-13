#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";

const LIVE_URLS = [
  `${SITE_URL}/`,
  `${SITE_URL}/coloring-pages`,
  `${SITE_URL}/coloring-pages/`,
  `${SITE_URL}/coloring-pages/animals`,
  `${SITE_URL}/coloring-pages/animals/`,
  `${SITE_URL}/coloring-pages/geometric`,
  `${SITE_URL}/coloring-pages/geometric/`,
  `${SITE_URL}/contact`,
  `${SITE_URL}/contact/`,
  `${SITE_URL}/sitemap.xml`,
  `${SITE_URL}/robots.txt`,
  "https://ilovecoloringpage.com/",
  "https://ilovecoloringpage.com/coloring-pages",
];

const OUTPUT_PATH = "pipeline/manifests/live-routing-http-results.json";
const REPORT_PATH = "pipeline/reports/live-routing-http-report.md";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const generatedAt = new Date().toISOString();
  const checks = [];

  for (const url of LIVE_URLS) {
    checks.push(await checkUrl(url));
  }

  const payload = buildPayload(generatedAt, checks);
  await writeJson(OUTPUT_PATH, payload);
  await writeText(REPORT_PATH, renderReport(payload));

  console.log(JSON.stringify({
    runId: payload.runId,
    checkedUrlCount: payload.summary.checkedUrlCount,
    liveRootReachable: payload.summary.liveRootReachable,
    liveNonRootRoutes200: payload.summary.liveNonRootRoutes200,
    liveSitemapCurrent: payload.summary.liveSitemapCurrent,
    selfRedirectDetected: payload.summary.selfRedirectDetected,
    likelyStaleDeployment: payload.summary.likelyStaleDeployment,
    blockers: payload.blockers,
  }, null, 2));
}

async function checkUrl(url) {
  const initial = await fetchManual(url);
  const chain = [toResponseRecord(url, initial)];
  let finalUrl = url;
  let final = initial;

  for (let hop = 0; hop < 8 && isRedirect(final.status) && final.location; hop += 1) {
    finalUrl = new URL(final.location, finalUrl).toString();
    final = await fetchManual(finalUrl);
    chain.push(toResponseRecord(finalUrl, final));
  }

  let body = "";
  if (!isRedirect(final.status)) {
    try {
      body = await final.response.text();
    } catch {
      body = "";
    }
  }

  const expected = expectedMarker(url);
  const initialLocation = initial.location || "";
  const initialLocationUrl = initialLocation ? new URL(initialLocation, url).toString() : "";
  const selfReferentialRedirect = isRedirect(initial.status) && Boolean(initialLocationUrl) && normalizeUrl(initialLocationUrl) === normalizeUrl(url);
  const sitemapLocs = url.endsWith("/sitemap.xml") ? [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]) : [];

  return {
    url,
    status: initial.status,
    finalUrl,
    finalStatus: final.status,
    redirectCount: chain.length - 1,
    location: initialLocation,
    contentType: initial.contentType || final.contentType || "",
    expectedPageMarker: expected,
    bodyContainsExpectedPageMarker: expected ? body.includes(expected) : true,
    bodyContainsRuntimeCount6352: body.includes("6,352") || body.includes("6352"),
    bodyContainsOldCount6557: body.includes("6,557") || body.includes("6557"),
    bodyContainsAssetBaseUrl: body.includes("https://assets.ilovecoloringpage.com/coloring-pages"),
    pageLooksStale: pageLooksStale(url, body, sitemapLocs),
    selfReferentialRedirect,
    slashVariant: slashVariantKind(url),
    sitemapLocCount: sitemapLocs.length || null,
    sitemapIncludesColoringPages: sitemapLocs.includes(`${SITE_URL}/coloring-pages`),
    sitemapIncludesAnimals: sitemapLocs.includes(`${SITE_URL}/coloring-pages/animals`),
    sitemapIncludesTrustPages: ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"].every((route) =>
      sitemapLocs.includes(`${SITE_URL}${route}`),
    ),
    chain,
  };
}

function buildPayload(generatedAt, checks) {
  const byUrl = new Map(checks.map((check) => [check.url, check]));
  const root = byUrl.get(`${SITE_URL}/`);
  const nonRootPrimaryUrls = [
    `${SITE_URL}/coloring-pages`,
    `${SITE_URL}/coloring-pages/animals`,
    `${SITE_URL}/coloring-pages/geometric`,
    `${SITE_URL}/contact`,
  ];
  const primaryNonRootChecks = nonRootPrimaryUrls.map((url) => byUrl.get(url)).filter(Boolean);
  const sitemap = byUrl.get(`${SITE_URL}/sitemap.xml`);
  const robots = byUrl.get(`${SITE_URL}/robots.txt`);
  const selfRedirects = checks.filter((check) => check.selfReferentialRedirect).map((check) => check.url);
  const stalePages = checks.filter((check) => check.pageLooksStale).map((check) => check.url);
  const liveNonRootRoutes200 = primaryNonRootChecks.every((check) => check.finalStatus === 200 && !check.selfReferentialRedirect && !check.pageLooksStale);
  const liveSitemapCurrent = Boolean(
    sitemap &&
      sitemap.finalStatus === 200 &&
      sitemap.sitemapLocCount >= 70 &&
      sitemap.sitemapIncludesColoringPages &&
      sitemap.sitemapIncludesAnimals &&
      sitemap.sitemapIncludesTrustPages,
  );
  const liveRuntimeSwitchActive = checks.some((check) => check.bodyContainsRuntimeCount6352 || check.bodyContainsAssetBaseUrl) &&
    !checks.some((check) => check.bodyContainsOldCount6557 && !check.bodyContainsRuntimeCount6352);
  const apexRedirectsToWww = byUrl.get("https://ilovecoloringpage.com/")?.finalUrl.startsWith(SITE_URL) || false;
  const likelyStaleDeployment = Boolean(root?.finalStatus === 200 && (!liveSitemapCurrent || stalePages.includes(`${SITE_URL}/sitemap.xml`)));
  const blockers = [];

  if (!root || root.finalStatus !== 200) blockers.push("Live root page is not reachable with HTTP 200.");
  if (!liveNonRootRoutes200) blockers.push("One or more live non-root production routes do not serve a clean HTTP 200.");
  if (!liveSitemapCurrent) blockers.push("Live sitemap is stale or missing expected generated routes and trust pages.");
  if (selfRedirects.length) blockers.push(`Self-referential redirects detected: ${selfRedirects.join(", ")}.`);
  if (!robots || robots.finalStatus !== 200 || !robots.bodyContainsExpectedPageMarker) blockers.push("Live robots.txt is missing or does not contain the expected sitemap marker.");

  return {
    generatedAt,
    runId: "live-routing-http-check",
    checkedUrls: LIVE_URLS,
    summary: {
      checkedUrlCount: checks.length,
      liveRootReachable: root?.finalStatus === 200,
      liveNonRootRoutes200,
      liveSitemapCurrent,
      liveRobotsCurrent: Boolean(robots && robots.finalStatus === 200 && robots.bodyContainsExpectedPageMarker),
      liveRuntimeSwitchActive,
      selfRedirectDetected: selfRedirects.length > 0,
      selfRedirectUrls: selfRedirects,
      stalePageUrls: stalePages,
      likelyStaleDeployment,
      apexRedirectsToWww,
      wwwPrimaryHostChecked: true,
    },
    checks,
    blockers,
  };
}

async function fetchManual(url) {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "user-agent": "codex-live-routing-check/1.0",
        accept: "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });
    return {
      response,
      status: response.status,
      location: response.headers.get("location") || "",
      contentType: response.headers.get("content-type") || "",
      headers: Object.fromEntries(response.headers.entries()),
      error: "",
    };
  } catch (error) {
    return {
      response: new Response(""),
      status: 0,
      location: "",
      contentType: "",
      headers: {},
      error: error?.message || String(error),
    };
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

function expectedMarker(url) {
  const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/") return "I Love Coloring Page";
  if (pathname === "/coloring-pages") return "Find a coloring page";
  if (pathname === "/coloring-pages/animals") return "Animals";
  if (pathname === "/coloring-pages/geometric") return "Geometric";
  if (pathname === "/contact") return "Contact";
  if (pathname === "/sitemap.xml") return "<urlset";
  if (pathname === "/robots.txt") return "Sitemap: https://www.ilovecoloringpage.com/sitemap.xml";
  return "";
}

function pageLooksStale(url, body, sitemapLocs) {
  const pathname = new URL(url).pathname;
  if (!body) return true;
  if (/I Love SVG|image-to-favicon-generator|routeManifestClientAssets|Vite-specific/i.test(body)) return true;
  if (pathname === "/sitemap.xml") return sitemapLocs.length < 70 || !sitemapLocs.includes(`${SITE_URL}/coloring-pages/animals`);
  if (pathname === "/robots.txt") return !body.includes(`${SITE_URL}/sitemap.xml`);
  if (pathname === "/" || pathname.startsWith("/coloring-pages") || pathname === "/contact" || pathname === "/contact/") {
    return !body.includes("I Love Coloring Page");
  }
  return false;
}

function slashVariantKind(url) {
  const pathname = new URL(url).pathname;
  if (pathname === "/") return "root";
  return pathname.endsWith("/") ? "slash" : "no-slash";
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function renderReport(payload) {
  return `# Live Routing HTTP Report

- Generated: ${payload.generatedAt}
- Checked URLs: ${payload.summary.checkedUrlCount}
- Live root reachable: ${payload.summary.liveRootReachable}
- Live non-root routes 200: ${payload.summary.liveNonRootRoutes200}
- Live sitemap current: ${payload.summary.liveSitemapCurrent}
- Live robots current: ${payload.summary.liveRobotsCurrent}
- Runtime switch active on live HTML: ${payload.summary.liveRuntimeSwitchActive}
- Self-redirect detected: ${payload.summary.selfRedirectDetected}
- Likely stale deployment: ${payload.summary.likelyStaleDeployment}
- Apex redirects to www: ${payload.summary.apexRedirectsToWww}

## URL Results

${payload.checks.map((check) => `- ${check.url}: ${check.status} -> ${check.finalStatus} (${check.finalUrl})${check.location ? `, Location: ${check.location}` : ""}, marker: ${check.bodyContainsExpectedPageMarker}, stale: ${check.pageLooksStale}, self-redirect: ${check.selfReferentialRedirect}`).join("\n")}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : "No live HTTP blockers found.\n"}
`;
}

async function writeJson(relativePath, payload) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${text.replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`, "utf8");
}
