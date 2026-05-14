import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);
export const REPO_ROOT = process.cwd();
export const SITE_URL = "https://www.ilovecoloringpage.com";
export const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
export const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
export const ORIGIN = SITE_URL;
export const MANIFEST_DIR = path.join(REPO_ROOT, "pipeline", "manifests");
export const REPORT_DIR = path.join(REPO_ROOT, "pipeline", "reports");
export const REVIEW_SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "live-seo-verification", "screenshots");
export const HTML_SAMPLE_PATHS = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/christmas",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
];
export const JSONLD_SAMPLE_PATHS = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/christmas",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/affiliate-disclosure",
  "/editorial-policy",
];
export const BROWSER_SAMPLE_PATHS = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/geometric",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
  "/contact",
  "/privacy",
];
export const HTTP_CHECK_URLS = [
  `${SITE_URL}/`,
  `${SITE_URL}/coloring-pages`,
  `${SITE_URL}/coloring-pages/animals`,
  `${SITE_URL}/coloring-pages/t-rex`,
  `${SITE_URL}/coloring-pages/dragons`,
  `${SITE_URL}/contact`,
  `${SITE_URL}/privacy`,
  `${SITE_URL}/sitemap.xml`,
  `${SITE_URL}/image-sitemap.xml`,
  `${SITE_URL}/robots.txt`,
];
export const ALLOWED_SCHEMA_TYPES = new Set([
  "WebSite",
  "Organization",
  "WebPage",
  "CollectionPage",
  "BreadcrumbList",
  "ItemList",
  "ListItem",
  "ImageObject",
  "AboutPage",
  "ContactPage",
  "PrivacyPolicy",
  "TermsOfService",
]);
export const FORBIDDEN_SCHEMA_TYPES = new Set(["Review", "AggregateRating", "Product", "Offer", "FAQPage", "Question", "Answer", "SearchAction"]);

export async function ensureOutputDirs() {
  await mkdir(MANIFEST_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });
}

export async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

export async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

export async function writeJson(relativePath, data) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${JSON.stringify(data, null, 2)}\n`);
}

export async function writeReport(relativePath, markdown) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${markdown.trim()}\n`);
}

export function absoluteSiteUrl(pagePath) {
  return pagePath === "/" ? `${SITE_URL}/` : `${SITE_URL}${pagePath}`;
}

export function canonicalSiteUrl(pagePath) {
  return pagePath === "/" ? SITE_URL : `${SITE_URL}${pagePath}`;
}

export async function fetchWithRedirects(url, options = {}) {
  const maxRedirects = options.maxRedirects ?? 5;
  const redirects = [];
  let currentUrl = url;

  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 25000);
    try {
      const response = await fetch(currentUrl, {
        method: options.method || "GET",
        headers: options.headers || {},
        redirect: "manual",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        const nextUrl = new URL(location, currentUrl).toString();
        redirects.push({ status: response.status, from: currentUrl, to: nextUrl });
        currentUrl = nextUrl;
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        ok: response.ok,
        status: response.status,
        initialUrl: url,
        finalUrl: currentUrl,
        redirected: redirects.length > 0,
        redirects,
        contentType: response.headers.get("content-type") || "",
        cacheControl: response.headers.get("cache-control") || "",
        accessControlAllowOrigin: response.headers.get("access-control-allow-origin") || "",
        bodySize: buffer.length,
        bodyText: textContentType(response.headers.get("content-type")) ? buffer.toString("utf8") : "",
      };
    } catch (error) {
      clearTimeout(timeout);
      return {
        ok: false,
        status: 0,
        initialUrl: url,
        finalUrl: currentUrl,
        redirected: redirects.length > 0,
        redirects,
        contentType: "",
        cacheControl: "",
        accessControlAllowOrigin: "",
        bodySize: 0,
        bodyText: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    ok: false,
    status: 0,
    initialUrl: url,
    finalUrl: currentUrl,
    redirected: redirects.length > 0,
    redirects,
    contentType: "",
    cacheControl: "",
    accessControlAllowOrigin: "",
    bodySize: 0,
    bodyText: "",
    error: `Exceeded ${maxRedirects} redirects`,
  };
}

export function textContentType(contentType = "") {
  return /text|xml|json|javascript|html/i.test(contentType);
}

export function isSelfRedirect(entry) {
  return entry.redirects.some((redirect) => normalizeComparableUrl(redirect.from) === normalizeComparableUrl(redirect.to));
}

export function normalizeComparableUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/+$/, "");
  }
}

export function extractMeta(html) {
  const result = { title: "", meta: [] };
  result.title = decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
  for (const match of html.matchAll(/<meta\s+([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1]);
    result.meta.push(attrs);
  }
  for (const match of html.matchAll(/<link\s+([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1]);
    if ((attrs.rel || "").toLowerCase() === "canonical") result.canonical = attrs.href || "";
  }
  return result;
}

export function getMetaContent(meta, selector) {
  const entry = meta.meta.find((attrs) => attrs.property === selector || attrs.name === selector);
  return entry?.content || "";
}

export function parseAttrs(raw) {
  const attrs = {};
  for (const match of raw.matchAll(/([a-zA-Z0-9:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1]] = decodeHtml(match[2] ?? match[3] ?? "");
  }
  return attrs;
}

export function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractJsonLd(html) {
  const scripts = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      scripts.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch (error) {
      scripts.push({ parseError: error instanceof Error ? error.message : String(error), raw });
    }
  }
  return scripts;
}

export function collectTypes(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectTypes);
  const type = value["@type"];
  const ownTypes = Array.isArray(type) ? type : type ? [type] : [];
  return [...ownTypes, ...Object.values(value).flatMap(collectTypes)];
}

export function collectUrlLikeValues(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectUrlLikeValues);
  const urls = [];
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && /^(?:@id|url|item|image|logo|contentUrl|thumbnailUrl|itemListOrder)$/.test(key)) {
      urls.push(entry);
    }
    urls.push(...collectUrlLikeValues(entry));
  }
  return urls;
}

export function extractXmlLocs(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1].trim()));
}

export function extractImageLocs(xml) {
  return [...xml.matchAll(/<image:loc>([\s\S]*?)<\/image:loc>/gi)].map((match) => decodeXml(match[1].trim()));
}

export function decodeXml(value) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function hasForbiddenPublicLeak(text) {
  return /localhost|127\.0\.0\.1|r2\.dev|cloudflarestorage\.com|amazonaws\.com/i.test(text);
}

export function hasSvgDownloadCopy(text) {
  return /Download SVG|downloadSvg|svgDownload/i.test(text);
}

export async function buildContextCheck() {
  const packageJson = await readJson("package.json");
  const nextConfig = await readText("next.config.mjs");
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const appSource = await readProjectText(["app", "src"], { excludeGenerated: true });
  const branch = (await execFileAsync("git", ["branch", "--show-current"], { cwd: REPO_ROOT })).stdout.trim();
  const commit0e18282Exists = await gitCommitExists("0e18282");

  return {
    generatedAt: new Date().toISOString(),
    phase: "live-seo-verification",
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      currentBranch: branch,
      commit0e18282Exists,
      staticExportConfigured: /output:\s*["']export["']/.test(nextConfig),
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      coloringPagesRoutePresent: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRoutePresent: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      runtimeGeneratedDataExists: existsSync(path.join(REPO_ROOT, "src", "generated", "coloring", "runtime-available-items.json")),
      runtimeAvailableRecords: (available.items || []).length,
      runtimeIndexableHubs: (hubs.hubs || []).filter((hub) => hub.indexable).length,
      regularSitemapExists: existsSync(path.join(REPO_ROOT, "app", "sitemap.ts")),
      imageSitemapExists: existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")),
      ogImagesExist: existsSync(path.join(REPO_ROOT, "public", "og", "home.jpg")),
      jsonLdImplemented: existsSync(path.join(REPO_ROOT, "src", "lib", "seo", "jsonLd.ts")) && existsSync(path.join(REPO_ROOT, "src", "components", "seo", "JsonLdScript.tsx")),
      siteUrl: SITE_URL,
      publicAssetBaseUrl: ASSET_BASE_URL,
      contactEmail: CONTACT_EMAIL,
      svgInternalOnly: !hasSvgDownloadCopy(appSource),
      publicDownloadFormats: ["PNG", "JPG", "WebP"],
      liveAdsenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(appSource),
      publicSafeDefaultsDoNotRequireNetlifyEnv: appSource.includes(SITE_URL) && appSource.includes(ASSET_BASE_URL) && appSource.includes(CONTACT_EMAIL),
    },
  };
}

export async function writeContextArtifacts(context) {
  await writeJson("pipeline/manifests/live-seo-verification-context-check.json", context);
  await writeReport("pipeline/reports/live-seo-verification-context-check.md", `# Live SEO Verification Context Check

- Repository: ${context.summary.correctRepository ? "pass" : "fail"}
- Branch: ${context.summary.currentBranch}
- Commit 0e18282 exists: ${context.summary.commit0e18282Exists}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api present: ${context.summary.appApiRoutePresent}
- Runtime available records: ${context.summary.runtimeAvailableRecords}
- Runtime indexable hubs: ${context.summary.runtimeIndexableHubs}
- Regular sitemap exists: ${context.summary.regularSitemapExists}
- Image sitemap exists: ${context.summary.imageSitemapExists}
- OG images exist: ${context.summary.ogImagesExist}
- JSON-LD implemented: ${context.summary.jsonLdImplemented}
- SVG internal-only: ${context.summary.svgInternalOnly}
- Public download formats: ${context.summary.publicDownloadFormats.join(", ")}
- Live AdSense code present: ${context.summary.liveAdsenseCodePresent}
`);
}

export async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const root of relativeRoots) {
    for (const file of await listFiles(path.join(REPO_ROOT, root))) {
      if (!/\.(?:ts|tsx|css|json|mjs|cjs)$/.test(file)) continue;
      const normalized = file.replace(/\\/g, "/");
      if (options.excludeGenerated && normalized.startsWith("src/generated/")) continue;
      chunks.push(await readText(normalized));
    }
  }
  return chunks.join("\n");
}

export async function listFiles(root) {
  if (!existsSync(root)) return [];
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root).replace(/\\/g, "/")];
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

export async function gitCommitExists(sha) {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

export async function readManifestIfExists(relativePath) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  return JSON.parse(await readFile(fullPath, "utf8"));
}

export function summarizeBooleans(values) {
  return values.every(Boolean);
}

export async function writeAcceptanceGate() {
  const freshness = await readManifestIfExists("pipeline/manifests/live-seo-deploy-freshness-check.json");
  const http = await readManifestIfExists("pipeline/manifests/live-seo-http-results.json");
  const sitemap = await readManifestIfExists("pipeline/manifests/live-seo-sitemap-results.json");
  const og = await readManifestIfExists("pipeline/manifests/live-seo-og-metadata-results.json");
  const jsonld = await readManifestIfExists("pipeline/manifests/live-seo-jsonld-results.json");
  const browser = await readManifestIfExists("pipeline/manifests/live-seo-browser-qa-results.json");
  const assets = await readManifestIfExists("pipeline/manifests/live-seo-sampled-asset-check-results.json");
  const context = await readManifestIfExists("pipeline/manifests/live-seo-verification-context-check.json");

  const blockers = [];
  if (!freshness?.summary?.productionSiteReachable) blockers.push("production site is not reachable");
  if (!freshness?.summary?.productionDeployCurrent) blockers.push("production deployment appears stale or missing current JSON-LD/OG/image sitemap behavior");
  if (!http?.summary?.routeCheckPassed) blockers.push("live HTTP route check did not pass");
  if (!sitemap?.summary?.regularSitemapPassed) blockers.push("regular sitemap check did not pass");
  if (!sitemap?.summary?.imageSitemapPassed) blockers.push("image sitemap check did not pass");
  if (!sitemap?.summary?.robotsPassed) blockers.push("robots.txt check did not pass");
  if (!og?.summary?.ogMetadataPassed) blockers.push("OG metadata check did not pass");
  if (!jsonld?.summary?.jsonLdPassed) blockers.push("JSON-LD check did not pass");
  if (!browser?.summary?.browserQaPassed) blockers.push("browser QA did not pass");
  if (!assets?.summary?.sampledAssetCheckPassed) blockers.push("sampled asset check did not pass");
  if (context?.summary?.appApiRoutePresent) blockers.push("app/api route exists");

  const summary = {
    production_site_reachable: Boolean(freshness?.summary?.productionSiteReachable),
    production_deploy_current: Boolean(freshness?.summary?.productionDeployCurrent),
    route_check_passed: Boolean(http?.summary?.routeCheckPassed),
    regular_sitemap_passed: Boolean(sitemap?.summary?.regularSitemapPassed),
    image_sitemap_passed: Boolean(sitemap?.summary?.imageSitemapPassed),
    robots_passed: Boolean(sitemap?.summary?.robotsPassed),
    og_metadata_passed: Boolean(og?.summary?.ogMetadataPassed),
    jsonld_passed: Boolean(jsonld?.summary?.jsonLdPassed),
    browser_qa_passed: Boolean(browser?.summary?.browserQaPassed),
    sampled_asset_check_passed: Boolean(assets?.summary?.sampledAssetCheckPassed),
    no_svg_download: Boolean(freshness?.summary?.noSvgDownloadLabelsOrLinks && browser?.summary?.svgDownloadAbsent),
    no_app_api: !context?.summary?.appApiRoutePresent,
    no_horizontal_overflow: Boolean(browser?.summary?.noHorizontalOverflow),
    ready_for_gsc_submission: Boolean(sitemap?.summary?.regularSitemapPassed && sitemap?.summary?.imageSitemapPassed && sitemap?.summary?.robotsPassed),
    ready_for_manual_social_validation: Boolean(og?.summary?.ogMetadataPassed),
    ready_for_live_ads_round: false,
    blockers,
  };
  const gate = {
    generatedAt: new Date().toISOString(),
    phase: "live-seo-verification",
    summary,
  };
  await writeJson("pipeline/manifests/live-seo-acceptance-gate.json", gate);
  await writeReport("pipeline/reports/live-seo-acceptance-gate.md", `# Live SEO Acceptance Gate

- Production site reachable: ${summary.production_site_reachable}
- Production deploy current: ${summary.production_deploy_current}
- Route check passed: ${summary.route_check_passed}
- Regular sitemap passed: ${summary.regular_sitemap_passed}
- Image sitemap passed: ${summary.image_sitemap_passed}
- Robots passed: ${summary.robots_passed}
- OG metadata passed: ${summary.og_metadata_passed}
- JSON-LD passed: ${summary.jsonld_passed}
- Browser QA passed: ${summary.browser_qa_passed}
- Sampled asset check passed: ${summary.sampled_asset_check_passed}
- SVG download absent: ${summary.no_svg_download}
- app/api absent: ${summary.no_app_api}
- Horizontal overflow absent: ${summary.no_horizontal_overflow}
- Ready for GSC submission: ${summary.ready_for_gsc_submission}
- Ready for manual social validation: ${summary.ready_for_manual_social_validation}
- Ready for live ads round: ${summary.ready_for_live_ads_round}
- Blockers: ${summary.blockers.length ? summary.blockers.join("; ") : "none"}
`);
  return gate;
}
