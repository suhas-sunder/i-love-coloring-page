import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const OUTPUTS = {
  manifests: path.join(REPO_ROOT, "pipeline", "manifests"),
  reports: path.join(REPO_ROOT, "pipeline", "reports"),
};
const SAMPLE_PAGES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/christmas",
  "/coloring-pages/geometric",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/affiliate-disclosure",
  "/editorial-policy",
];
const ALLOWED_TYPES = new Set([
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
const FORBIDDEN_TYPES = new Set(["Review", "AggregateRating", "Product", "Offer", "FAQPage", "Question", "Answer"]);

async function main() {
  await mkdir(OUTPUTS.manifests, { recursive: true });
  await mkdir(OUTPUTS.reports, { recursive: true });
  await runBuild();

  const routeData = await readJson("pipeline/manifests/jsonld-route-data.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const deferredIds = new Set((deferred.items || deferred.records || []).map((entry) => entry.assetId).filter(Boolean));
  const sampledPages = [];

  for (const pagePath of SAMPLE_PAGES) {
    const html = await readStaticHtml(pagePath);
    const jsonLd = extractJsonLd(html);
    sampledPages.push(validatePage(pagePath, html, jsonLd, deferredIds));
  }

  const allJsonText = JSON.stringify(sampledPages.map((page) => page.jsonLd));
  const summary = {
    validationPassed: sampledPages.every((page) => page.passed),
    sampledPageCount: sampledPages.length,
    allJsonParses: sampledPages.every((page) => page.allJsonParses),
    allContextsValid: sampledPages.every((page) => page.contextsValid),
    allTypesAllowed: sampledPages.every((page) => page.typesAllowed),
    allUrlsAbsolute: sampledPages.every((page) => page.urlsAbsolute),
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(allJsonText),
    noR2Dev: !/r2\.dev/i.test(allJsonText),
    noPrivateR2Endpoint: !/cloudflarestorage\.com|amazonaws\.com/i.test(allJsonText),
    noSvgUrls: !/\.svg(?:["?#/]|$)|\/svg\//i.test(allJsonText),
    noPngThumbUrls: !/\/(?:png|thumbs?)\/|(?:\.png|thumbnail)/i.test(allJsonText),
    noDeferredRecords: !sampledPages.some((page) => page.deferredRecordReferenced),
    noForbiddenSchemaTypes: sampledPages.every((page) => page.noForbiddenSchemaTypes),
    noFaqSchema: !/"FAQPage"|"Question"|"Answer"/.test(allJsonText),
    noDuplicateCanonicalMismatch: sampledPages.every((page) => page.canonicalMatchesRoute),
    breadcrumbsCorrect: sampledPages.every((page) => page.breadcrumbsCorrect),
    routeDataRouteCount: routeData.summary.routeCount,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    phase: "jsonld",
    summary,
    sampledPages: sampledPages.map(({ html, jsonLd, ...page }) => page),
  };

  await writeJson("jsonld-validation-results.json", result);
  await writeReport("jsonld-validation-report.md", report(result));
  console.log(`JSON-LD validation ${summary.validationPassed ? "passed" : "failed"} for ${sampledPages.length} pages.`);
}

async function runBuild() {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run build"] : ["run", "build"];
  await execFileAsync(command, args, {
    cwd: REPO_ROOT,
    maxBuffer: 1024 * 1024 * 20,
  });
}

function validatePage(pagePath, html, jsonLd, deferredIds) {
  const schemaTypes = [...new Set(jsonLd.flatMap((node) => collectTypes(node)))];
  const jsonText = JSON.stringify(jsonLd);
  const pageUrl = pagePath === "/" ? SITE_URL : `${SITE_URL}${pagePath}`;
  const topLevelPages = jsonLd.filter((node) =>
    ["WebPage", "CollectionPage", "AboutPage", "ContactPage", "PrivacyPolicy", "TermsOfService"].includes(node?.["@type"]),
  );
  const breadcrumbs = jsonLd.filter((node) => node?.["@type"] === "BreadcrumbList");
  const allJsonParses = jsonLd.length > 0;
  const contextsValid = jsonLd.every((node) => node?.["@context"] === "https://schema.org");
  const typesAllowed = schemaTypes.every((type) => ALLOWED_TYPES.has(type));
  const urlsAbsolute = collectUrlLikeValues(jsonLd).every((value) => isAllowedUrl(value));
  const deferredRecordReferenced = [...deferredIds].some((id) => id && jsonText.includes(id));
  const noForbiddenSchemaTypes = !schemaTypes.some((type) => FORBIDDEN_TYPES.has(type));
  const canonicalMatchesRoute = topLevelPages.length === 0 || topLevelPages.every((node) => node.url === pageUrl);
  const breadcrumbsCorrect =
    breadcrumbs.length === 0 ||
    breadcrumbs.every((breadcrumb) => {
      const items = breadcrumb.itemListElement || [];
      const last = items[items.length - 1];
      return last?.item === pageUrl && items.every((item, index) => item.position === index + 1);
    });

  return {
    path: pagePath,
    scriptCount: jsonLd.length > 0 ? 1 : 0,
    schemaTypes,
    allJsonParses,
    contextsValid,
    typesAllowed,
    urlsAbsolute,
    deferredRecordReferenced,
    noForbiddenSchemaTypes,
    canonicalMatchesRoute,
    breadcrumbsCorrect,
    passed:
      allJsonParses &&
      contextsValid &&
      typesAllowed &&
      urlsAbsolute &&
      !deferredRecordReferenced &&
      noForbiddenSchemaTypes &&
      canonicalMatchesRoute &&
      breadcrumbsCorrect,
    html,
    jsonLd,
  };
}

function extractJsonLd(html) {
  const matches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return matches.flatMap((match) => {
    const raw = match[1].trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  });
}

function collectTypes(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectTypes);
  const ownTypes = Array.isArray(value["@type"]) ? value["@type"] : value["@type"] ? [value["@type"]] : [];
  return [...ownTypes, ...Object.values(value).flatMap(collectTypes)];
}

function collectUrlLikeValues(value, keyName = "") {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((entry) => collectUrlLikeValues(entry, keyName));
  const values = [];
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && /^(?:@id|url|item|image|logo|contentUrl|thumbnailUrl|itemListOrder)$/.test(key)) {
      values.push(entry);
    }
    values.push(...collectUrlLikeValues(entry, key));
  }
  return values;
}

function isAllowedUrl(value) {
  if (value.startsWith("https://schema.org/")) return true;
  if (value.startsWith(`${SITE_URL}`)) return true;
  return false;
}

async function readStaticHtml(pagePath) {
  const cleanPath = pagePath.replace(/^\/+/, "");
  const candidates =
    pagePath === "/"
      ? [path.join(REPO_ROOT, "out", "index.html")]
      : [
          path.join(REPO_ROOT, "out", cleanPath, "index.html"),
          path.join(REPO_ROOT, "out", `${cleanPath}.html`),
        ];
  const htmlPath = candidates.find((candidate) => existsSync(candidate));
  if (!htmlPath) throw new Error(`Missing static HTML for ${pagePath}: ${candidates.join(", ")}`);
  return readFile(htmlPath, "utf8");
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

function report(result) {
  const s = result.summary;
  return `# JSON-LD Validation Report

- Validation passed: ${s.validationPassed}
- Sampled pages: ${s.sampledPageCount}
- JSON parses: ${s.allJsonParses}
- Contexts valid: ${s.allContextsValid}
- Types allowed: ${s.allTypesAllowed}
- URLs absolute and canonical: ${s.allUrlsAbsolute}
- No localhost/r2.dev/private endpoint: ${s.noLocalhost && s.noR2Dev && s.noPrivateR2Endpoint}
- No SVG URLs: ${s.noSvgUrls}
- No PNG/thumb URLs: ${s.noPngThumbUrls}
- No deferred records: ${s.noDeferredRecords}
- No forbidden schema types: ${s.noForbiddenSchemaTypes}
- Breadcrumbs correct: ${s.breadcrumbsCorrect}

## Sampled Pages

${result.sampledPages.map((page) => `- ${page.path}: ${page.schemaTypes.join(", ")}`).join("\n")}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
