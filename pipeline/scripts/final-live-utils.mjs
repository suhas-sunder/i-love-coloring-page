import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);
export const REPO_ROOT = process.cwd();
export const SITE_URL = "https://www.ilovecoloringpage.com";
export const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
export const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
export const EXPECTED_PREDEPLOY_COMMIT = "74fea5ec0e451c22bb970c9665ee8bdb9c9b141d";
export const EXPECTED_PREDEPLOY_SHORT_COMMIT = "74fea5e";
export const EXPECTED_RUNTIME_RECORDS = 6352;
export const EXPECTED_INDEXABLE_HUBS = 131;
export const FINAL_SCREENSHOT_DIR = "pipeline/review/final-live/screenshot";

export const HTTP_ROUTES = [
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
  "/sitemap.xml",
  "/image-sitemap.xml",
  "/robots.txt",
];

export const METADATA_ROUTES = [
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

export const BROWSER_ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
];

export const TRUST_ROUTES = [
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/affiliate-disclosure",
  "/editorial-policy",
];

export const SAMPLE_HUB_ROUTES = [
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/christmas",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/plushies",
];

export const VIEWPORTS = [
  { label: "mobile-390", width: 390, height: 900 },
  { label: "tablet-768", width: 768, height: 1000 },
  { label: "desktop-1440", width: 1440, height: 1100 },
  { label: "wide-1920", width: 1920, height: 1100 },
];

export const FORBIDDEN_SCHEMA_TYPES = new Set(["Review", "AggregateRating", "Product", "Offer", "FAQPage"]);

export async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

export async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

export async function writeJson(relativePath, value) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeReport(relativePath, markdown) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${markdown.trim()}\n`, "utf8");
}

export async function listFilesIfExists(root) {
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
      else results.push(normalizePath(path.relative(REPO_ROOT, absolute)));
    }
  }
  await walk(root);
  return results;
}

export async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
    if (!existsSync(absoluteRoot)) continue;
    const rootStat = await stat(absoluteRoot);
    const files = rootStat.isFile() ? [relativeRoot] : await listFilesIfExists(absoluteRoot);
    for (const file of files) {
      const normalized = normalizePath(file);
      if (!/\.(?:ts|tsx|css|json|md|mjs|cjs|xml|toml)$/.test(normalized)) continue;
      if (options.skipGenerated && normalized.startsWith("src/generated/")) continue;
      if (options.skipReview && normalized.startsWith("pipeline/review/")) continue;
      chunks.push(await readText(normalized));
    }
  }
  return chunks.join("\n");
}

export async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 16 });
  return stdout.trim();
}

export async function gitMaybe(args) {
  try {
    return await git(args);
  } catch {
    return "";
  }
}

export async function gitStatusFor(relativePath) {
  return gitMaybe(["status", "--short", "--", relativePath]);
}

export async function gitCommitExists(commit) {
  return (await gitMaybe(["cat-file", "-t", commit])).trim() === "commit";
}

export async function gitCommitIsAncestor(commit) {
  try {
    await execFileAsync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

export async function fetchWithRedirects(url, options = {}) {
  const maxRedirects = options.maxRedirects ?? 6;
  const redirects = [];
  let currentUrl = url;

  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
    try {
      const response = await fetch(currentUrl, {
        method: options.method || "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "codex-final-live-gsc-readiness/1.0",
          accept: options.accept || "text/html,application/xhtml+xml,application/xml,text/plain,image/*,*/*;q=0.8",
          ...(options.headers || {}),
        },
      });
      clearTimeout(timeout);
      const location = response.headers.get("location") || "";
      if (response.status >= 300 && response.status < 400 && location) {
        const nextUrl = new URL(location, currentUrl).toString();
        redirects.push({ status: response.status, from: currentUrl, to: nextUrl });
        if (normalizeComparableUrl(nextUrl) === normalizeComparableUrl(currentUrl)) break;
        currentUrl = nextUrl;
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "";
      return {
        ok: response.ok,
        status: response.status,
        initialUrl: url,
        finalUrl: currentUrl,
        redirected: redirects.length > 0,
        redirects,
        contentType,
        cacheControl: response.headers.get("cache-control") || "",
        accessControlAllowOrigin: response.headers.get("access-control-allow-origin") || "",
        bodySize: buffer.length,
        bodyText: isTextContentType(contentType) ? buffer.toString("utf8") : "",
        bodyBuffer: buffer,
        error: "",
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
        bodyBuffer: Buffer.alloc(0),
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
    bodyBuffer: Buffer.alloc(0),
    error: "Exceeded redirects or detected self-redirect",
  };
}

export function isTextContentType(contentType = "") {
  return /text|html|xml|json|javascript/i.test(contentType);
}

export function normalizeComparableUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value).replace(/\/+$/, "");
  }
}

export function absoluteSiteUrl(route) {
  return route === "/" ? `${SITE_URL}/` : `${SITE_URL}${route}`;
}

export function canonicalSiteUrl(route) {
  return route === "/" ? SITE_URL : `${SITE_URL}${route}`;
}

export function isSelfRedirect(result) {
  return result.redirects.some((redirect) => normalizeComparableUrl(redirect.from) === normalizeComparableUrl(redirect.to));
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

export function extractMeta(html) {
  const title = decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
  const meta = [];
  const links = [];
  for (const match of html.matchAll(/<meta\s+([^>]+)>/gi)) meta.push(parseAttrs(match[1]));
  for (const match of html.matchAll(/<link\s+([^>]+)>/gi)) links.push(parseAttrs(match[1]));
  const canonical = links.find((attrs) => (attrs.rel || "").toLowerCase() === "canonical")?.href || "";
  return { title, meta, links, canonical };
}

export function getMetaContent(meta, key) {
  return meta.meta.find((attrs) => attrs.property === key || attrs.name === key)?.content || "";
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
      const parsed = JSON.parse(decodeHtml(raw));
      scripts.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch (error) {
      scripts.push({ parseError: error instanceof Error ? error.message : String(error), raw: raw.slice(0, 400) });
    }
  }
  return scripts;
}

export function collectTypes(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectTypes);
  const type = value["@type"];
  const own = Array.isArray(type) ? type : type ? [type] : [];
  return [...own, ...Object.values(value).flatMap(collectTypes)];
}

export function collectUrlLikeValues(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectUrlLikeValues);
  const urls = [];
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && /^(?:@id|url|item|image|logo|contentUrl|thumbnailUrl)$/i.test(key)) {
      urls.push(entry);
    }
    urls.push(...collectUrlLikeValues(entry));
  }
  return urls;
}

export function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

export function hasForbiddenPublicLeak(text) {
  return /localhost|127\.0\.0\.1|r2\.dev|cloudflarestorage\.com|amazonaws\.com/i.test(text);
}

export function hasSvgDownloadCopy(text) {
  return /Download SVG|downloadSvg\b|svgDownload/i.test(text);
}

export function bool(value) {
  return value ? "pass" : "fail";
}

export function renderTable(rows) {
  return [
    "| Check | Result |",
    "| --- | --- |",
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
  ].join("\n");
}

export function isApprovedPublicFile(filePath) {
  const normalized = normalizePath(filePath);
  return normalized === "public/image-sitemap.xml" || /^public\/og\/.+\.jpg$/i.test(normalized);
}

export function routeSlug(route) {
  if (route === "/") return "home";
  return route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

export async function buildFinalContextCheck() {
  const packageJson = await readJson("package.json");
  const nextConfig = await readText("next.config.mjs");
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const assetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const predeployGate = await readJson("pipeline/manifests/predeploy-local-acceptance-gate.json");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const assets = await readText("src/lib/coloring/assets.ts");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const appSource = await readProjectText(["app", "src", "next.config.mjs", "netlify.toml"], { skipGenerated: true, skipReview: true });
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const branch = await git(["branch", "--show-current"]);
  const head = await git(["rev-parse", "HEAD"]);
  const expectedCommitExists = await gitCommitExists(EXPECTED_PREDEPLOY_COMMIT);
  const expectedCommitAncestorOfHead = await gitCommitIsAncestor(EXPECTED_PREDEPLOY_COMMIT);
  const imagesStatus = await gitStatusFor("images");
  const ilovesvgStatus = await gitStatusFor("ilovesvg");
  const ogFiles = publicFiles.filter((file) => /^public\/og\/.+\.jpg$/i.test(file));

  const summary = {
    correctRepository: packageJson.name === "i-love-coloring-page" && path.basename(await git(["rev-parse", "--show-toplevel"])) === "i-love-coloring-page",
    branch,
    expectedBranch: "ver-5-deployed-may-13-2026",
    branchMatchesExpected: branch === "ver-5-deployed-may-13-2026",
    head,
    expectedPredeployCommit: EXPECTED_PREDEPLOY_COMMIT,
    expectedPredeployCommitExists: expectedCommitExists,
    expectedPredeployCommitAncestorOfHead: expectedCommitAncestorOfHead,
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")) || existsSync(path.join(REPO_ROOT, "src", "app", "api")),
    staticExportConfigured: /output:\s*"export"/.test(nextConfig),
    runtimeGeneratedDataExists: available.items?.length === EXPECTED_RUNTIME_RECORDS && assetPaths.records?.length === EXPECTED_RUNTIME_RECORDS,
    runtimeAvailableRecords: available.items?.length || 0,
    runtimeIndexableHubs: (hubs.hubs || []).filter((hub) => hub.indexable).length,
    imageSitemapExists: existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")),
    ogImagesExist: ogFiles.length > 0,
    ogImageCount: ogFiles.length,
    jsonLdExists: existsSync(path.join(REPO_ROOT, "src", "lib", "seo", "jsonLd.ts")) && existsSync(path.join(REPO_ROOT, "src", "components", "seo", "JsonLdScript.tsx")),
    predeployReportsExist: existsSync(path.join(REPO_ROOT, "pipeline", "manifests", "predeploy-local-acceptance-gate.json")) && existsSync(path.join(REPO_ROOT, "pipeline", "reports", "predeploy-local-acceptance-gate.md")),
    predeployAcceptanceReadyForDeploy: predeployGate.ready_for_netlify_deploy === true,
    siteUrlDefaultExists: siteConfig.includes(SITE_URL),
    assetBaseDefaultExists: siteConfig.includes(ASSET_BASE_URL) && assets.includes(ASSET_BASE_URL),
    contactEmailDefaultExists: siteConfig.includes(CONTACT_EMAIL),
    publicSafeDefaultsDoNotRequireNetlifyEnv: siteConfig.includes(SITE_URL) && siteConfig.includes(ASSET_BASE_URL) && siteConfig.includes(CONTACT_EMAIL),
    svgInternalOnly: !hasSvgDownloadCopy(`${browserDownloads}\n${downloadMenu}`),
    publicDownloadsArePngJpgWebp: /Download PNG/.test(downloadMenu) && /Download JPG/.test(downloadMenu) && /Download WebP/.test(downloadMenu),
    liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(appSource),
    imagesUntouched: imagesStatus.trim() === "",
    ilovesvgUntouched: ilovesvgStatus.trim() === "",
    publicMediaLimitedToApprovedXmlAndOg: publicFiles.every(isApprovedPublicFile),
  };

  const passed = [
    summary.correctRepository,
    summary.branchMatchesExpected,
    summary.expectedPredeployCommitExists,
    summary.expectedPredeployCommitAncestorOfHead,
    !summary.appApiRoutePresent,
    summary.staticExportConfigured,
    summary.runtimeGeneratedDataExists,
    summary.runtimeAvailableRecords === EXPECTED_RUNTIME_RECORDS,
    summary.runtimeIndexableHubs === EXPECTED_INDEXABLE_HUBS,
    summary.imageSitemapExists,
    summary.ogImagesExist,
    summary.jsonLdExists,
    summary.predeployReportsExist,
    summary.predeployAcceptanceReadyForDeploy,
    summary.publicSafeDefaultsDoNotRequireNetlifyEnv,
    summary.svgInternalOnly,
    summary.publicDownloadsArePngJpgWebp,
    !summary.liveAdSenseCodePresent,
    summary.imagesUntouched,
    summary.ilovesvgUntouched,
    summary.publicMediaLimitedToApprovedXmlAndOg,
  ].every(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-live-context-check",
    summary,
    passed,
    blockers: passed ? [] : Object.entries(summary).filter(([, value]) => value === false).map(([key]) => key),
  };
}

export async function loadRuntimeAssetRecords() {
  const [paths, available] = await Promise.all([
    readJson("src/generated/coloring/runtime-asset-paths.json"),
    readJson("src/generated/coloring/runtime-available-items.json"),
  ]);
  const itemMap = new Map((available.items || []).map((item) => [item.assetId, item]));
  return (paths.records || []).map((record) => ({
    ...record,
    item: itemMap.get(record.assetId) || null,
  }));
}

export async function selectSampleAssetRecords(minimum = 250) {
  const records = await loadRuntimeAssetRecords();
  const selected = new Map();
  const requirements = [
    { id: "animals-alligator", test: (record) => record.assetId === "animals__animals-alligator__4feec8505a" },
    { id: "animals", test: (record) => record.category === "animals" },
    { id: "anime-girls", test: (record) => record.category === "anime-girls" },
    { id: "geometric-mandala", test: (record) => /mandala|geometric/i.test(`${record.assetId} ${record.item?.title || ""}`) },
    { id: "christmas", test: (record) => record.category === "christmas" || /christmas/i.test(record.assetId) },
    { id: "plushies", test: (record) => /plush/i.test(`${record.category} ${record.assetId} ${record.item?.title || ""}`) },
    { id: "t-rex", test: (record) => /t[- ]?rex|tyrannosaurus/i.test(`${record.assetId} ${record.item?.title || ""}`) },
    { id: "dragons", test: (record) => /dragon/i.test(`${record.category} ${record.assetId} ${record.item?.title || ""}`) },
    { id: "mushrooms", test: (record) => /mushroom/i.test(`${record.category} ${record.assetId} ${record.item?.title || ""}`) },
    { id: "sushi", test: (record) => /sushi/i.test(`${record.category} ${record.assetId} ${record.item?.title || ""}`) },
    { id: "bakery", test: (record) => /bakery|cake/i.test(`${record.category} ${record.assetId} ${record.item?.title || ""}`) },
    { id: "wolves", test: (record) => /wolf|wolves/i.test(`${record.category} ${record.assetId} ${record.item?.title || ""}`) },
    { id: "pumpkins", test: (record) => /pumpkin/i.test(`${record.category} ${record.assetId} ${record.item?.title || ""}`) },
    { id: "st-patricks-day", test: (record) => /st-patricks-day/i.test(`${record.category} ${record.assetId}`) },
  ];

  const coverage = {};
  for (const requirement of requirements) {
    const match = records.find(requirement.test);
    coverage[requirement.id] = Boolean(match);
    if (match) selected.set(match.assetId, { ...match, sampleReason: requirement.id });
  }

  const stride = Math.max(1, Math.floor(records.length / minimum));
  for (let index = 0; selected.size < minimum && index < records.length; index += stride) {
    const record = records[index];
    selected.set(record.assetId, { ...record, sampleReason: selected.has(record.assetId) ? selected.get(record.assetId).sampleReason : "deterministic-stride" });
  }

  for (const record of records) {
    if (selected.size >= minimum) break;
    selected.set(record.assetId, { ...record, sampleReason: "deterministic-fill" });
  }

  return { records: [...selected.values()].slice(0, Math.max(minimum, selected.size)), coverage };
}

export function countMatches(value, regex) {
  return [...String(value).matchAll(regex)].length;
}
