import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();
const EXPECTED_ASSET_BASE = "https://assets.ilovecoloringpage.com/coloring-pages";
const LOCAL_ORIGIN = "http://localhost:3005";
const SAMPLE_SIZE = 100;
const REQUIRED_ASSET_ID = "animals__animals-alligator__4feec8505a";

async function main() {
  const generatedAt = new Date().toISOString();
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const sample = selectSample(available.items, SAMPLE_SIZE, REQUIRED_ASSET_ID);
  const checks = [];

  for (const item of sample) {
    const webpUrl = buildUrl(item.assetSubpaths.webpPreview);
    const svgUrl = buildUrl(item.assetSubpaths.svg);
    const webp = await checkUrl(webpUrl);
    const svg = await checkUrl(svgUrl);
    const svgCors = await checkUrl(svgUrl, { Origin: LOCAL_ORIGIN });
    checks.push({
      assetId: item.assetId,
      title: item.title,
      webpUrl,
      svgUrl,
      webp,
      svg,
      svgCors,
      noDuplicatePrefix: !/coloring-pages\/coloring-pages/i.test(`${webpUrl}\n${svgUrl}`),
      noLocalUrl: !/localhost|127\.0\.0\.1|::1/i.test(`${webpUrl}\n${svgUrl}`),
      noR2Dev: !/\.r2\.dev/i.test(`${webpUrl}\n${svgUrl}`),
      noPngGallerySubstitute: !/\/png\//i.test(webpUrl),
    });
  }

  const payload = {
    generatedAt,
    runId: "local-preview-sampled-url-check",
    sampleSize: sample.length,
    expectedAssetBase: EXPECTED_ASSET_BASE,
    origin: LOCAL_ORIGIN,
    checks,
    summary: {
      sampledRecords: sample.length,
      animalsAlligatorIncluded: sample.some((item) => item.assetId === REQUIRED_ASSET_ID),
      webpHttp200: checks.filter((check) => check.webp.status === 200).length,
      webpImageWebp: checks.filter((check) => /^image\/webp\b/i.test(check.webp.contentType)).length,
      svgHttp200: checks.filter((check) => check.svg.status === 200).length,
      svgImageSvg: checks.filter((check) => /^image\/svg\+xml\b/i.test(check.svg.contentType)).length,
      svgCorsWithLocalOrigin: checks.filter((check) => Boolean(check.svgCors.accessControlAllowOrigin)).length,
      duplicatePrefixCount: checks.filter((check) => !check.noDuplicatePrefix).length,
      localUrlCount: checks.filter((check) => !check.noLocalUrl).length,
      r2DevCount: checks.filter((check) => !check.noR2Dev).length,
      pngSubstituteCount: checks.filter((check) => !check.noPngGallerySubstitute).length,
      allPassed: checks.every(
        (check) =>
          check.webp.status === 200 &&
          /^image\/webp\b/i.test(check.webp.contentType) &&
          check.svg.status === 200 &&
          /^image\/svg\+xml\b/i.test(check.svg.contentType) &&
          Boolean(check.svgCors.accessControlAllowOrigin) &&
          check.noDuplicatePrefix &&
          check.noLocalUrl &&
          check.noR2Dev &&
          check.noPngGallerySubstitute,
      ),
    },
  };

  await writeJson("pipeline/manifests/local-preview-sampled-url-check-results.json", payload);
  await writeText("pipeline/reports/local-preview-sampled-url-check-report.md", renderReport(payload));
  console.log(JSON.stringify(payload.summary, null, 2));
}

function selectSample(items, sampleSize, requiredAssetId) {
  const selected = items.slice(0, sampleSize);
  if (!selected.some((item) => item.assetId === requiredAssetId)) {
    const required = items.find((item) => item.assetId === requiredAssetId);
    if (required) selected[selected.length - 1] = required;
  }
  return selected;
}

function buildUrl(subpath) {
  if (!subpath) return "";
  return `${EXPECTED_ASSET_BASE}/${subpath.split("/").map(encodeURIComponent).join("/")}`;
}

async function checkUrl(url, headers = {}) {
  if (!url) return { url, ok: false, status: 0, contentType: "", accessControlAllowOrigin: "", error: "missing_url" };
  try {
    const response = await fetch(url, { headers, redirect: "manual" });
    await response.arrayBuffer();
    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      accessControlAllowOrigin: response.headers.get("access-control-allow-origin") || "",
      cacheControl: response.headers.get("cache-control") || "",
      location: response.headers.get("location") || "",
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      contentType: "",
      accessControlAllowOrigin: "",
      cacheControl: "",
      location: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function renderReport(payload) {
  return [
    "# Local Preview Sampled URL Check",
    "",
    `- Sampled records: ${payload.summary.sampledRecords}`,
    `- Animals Alligator included: ${payload.summary.animalsAlligatorIncluded}`,
    `- WebP HTTP 200: ${payload.summary.webpHttp200}`,
    `- WebP image/webp: ${payload.summary.webpImageWebp}`,
    `- SVG HTTP 200: ${payload.summary.svgHttp200}`,
    `- SVG image/svg+xml: ${payload.summary.svgImageSvg}`,
    `- SVG CORS with ${LOCAL_ORIGIN}: ${payload.summary.svgCorsWithLocalOrigin}`,
    `- Duplicate prefix count: ${payload.summary.duplicatePrefixCount}`,
    `- Local URL count: ${payload.summary.localUrlCount}`,
    `- r2.dev count: ${payload.summary.r2DevCount}`,
    `- PNG substitute count: ${payload.summary.pngSubstituteCount}`,
    `- All passed: ${payload.summary.allPassed}`,
  ].join("\n");
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
