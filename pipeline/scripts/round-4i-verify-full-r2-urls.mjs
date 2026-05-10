import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ROUND4I_GENERATED_AT, ROUND4I_RUN_ID } from "./round-4i-build-full-r2-bundle.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");
const PLAN_PATH = "pipeline/manifests/round-4i-full-r2-url-verification-plan.json";
const RESULTS_PATH = "pipeline/manifests/round-4i-full-r2-url-verification-results.json";
const PRIVATE_ENDPOINT_PATTERNS = [/\.r2\.cloudflarestorage\.com/i, /amazonaws\.com/i, /X-Amz-/i, /Signature=/i];

export async function runRound4IFullR2UrlVerification(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const dryRun = options.live ? false : options.dryRun !== false;
  const plan = await readJson(path.join(repoRoot, PLAN_PATH));
  const urls = plan.urls || [];

  if (dryRun) {
    const results = {
      generatedAt: ROUND4I_GENERATED_AT,
      runId: ROUND4I_RUN_ID,
      status: "not_run",
      reason: "dry_run_full_upload_not_completed",
      planPath: PLAN_PATH,
      summary: {
        urlsPlanned: urls.length,
        urlsChecked: 0,
        passed: 0,
        failed: 0,
        skipped: urls.length,
        oldPrefixFailures: 0,
        doublePrefixFailures: 0,
        privateEndpointRedirects: 0,
      },
      entries: urls.map((entry) => ({
        assetId: entry.assetId,
        mediaType: entry.mediaType,
        urlPattern: entry.expectedPublicUrlPattern,
        status: "not_run",
        expectedHttpStatus: entry.expectedHttpStatus,
        expectedContentType: entry.expectedContentType,
        expectedCacheControl: entry.expectedCacheControl,
      })),
    };
    await writeJson(path.join(repoRoot, RESULTS_PATH), results);
    return results;
  }

  const checked = [];
  const publicBaseUrl = normalizePublicBaseUrl(options.publicBaseUrl || process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL);
  for (const entry of urls) {
    checked.push(await checkUrl(entry, publicBaseUrl));
  }

  const failed = checked.filter((entry) => entry.status !== "passed");
  const results = {
    generatedAt: new Date().toISOString(),
    runId: ROUND4I_RUN_ID,
    status: failed.length ? "failed_expected_until_upload" : "passed",
    reason: failed.length ? "one_or_more_public_urls_failed_verification" : "all_public_urls_verified",
    planPath: PLAN_PATH,
    publicBaseUrl,
    summary: {
      urlsPlanned: urls.length,
      urlsChecked: checked.length,
      passed: checked.length - failed.length,
      failed: failed.length,
      skipped: 0,
      oldPrefixFailures: checked.filter((entry) => entry.oldPrefixFound).length,
      doublePrefixFailures: checked.filter((entry) => entry.doublePrefixFound).length,
      privateEndpointRedirects: checked.filter((entry) => entry.redirectToPrivateEndpoint).length,
      cacheHeaderPresent: checked.filter((entry) => entry.cacheControl).length,
      cacheHeaderMissing: checked.filter((entry) => !entry.cacheControl).length,
    },
    entries: checked,
  };
  await writeJson(path.join(repoRoot, RESULTS_PATH), results);
  return results;
}

async function checkUrl(entry, publicBaseUrl) {
  const startedAt = Date.now();
  const url = `${publicBaseUrl}/${entry.relativeAssetPath}`;
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual" });
    const contentType = response.headers.get("content-type") || "";
    const cacheControl = response.headers.get("cache-control") || "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    const location = response.headers.get("location") || "";
    const body = response.ok ? await response.arrayBuffer() : null;
    const byteLength = body ? body.byteLength : contentLength;
    const redirectToPrivateEndpoint = response.status >= 300 && response.status < 400 && PRIVATE_ENDPOINT_PATTERNS.some((pattern) => pattern.test(location));
    const privateEndpointLeak = PRIVATE_ENDPOINT_PATTERNS.some((pattern) => pattern.test(url) || pattern.test(location));
    const oldPrefixFound = /coloring\/test-v1/i.test(url);
    const doublePrefixFound = /coloring-pages\/coloring-pages/i.test(url);
    const contentTypeOk = contentType.toLowerCase().startsWith(entry.expectedContentType.toLowerCase());
    const statusOk = response.status === entry.expectedHttpStatus;
    const byteRange = entry.expectedByteSizeRange || { min: 1, max: Number.MAX_SAFE_INTEGER };
    const byteSizeOk = byteLength >= byteRange.min && byteLength <= byteRange.max;
    const cacheOk = !entry.expectedCacheControl || cacheControl === entry.expectedCacheControl;
    const passed = statusOk && contentTypeOk && byteSizeOk && cacheOk && !redirectToPrivateEndpoint && !privateEndpointLeak && !oldPrefixFound && !doublePrefixFound;

    return {
      url,
      assetId: entry.assetId,
      mediaType: entry.mediaType,
      status: passed ? "passed" : "failed",
      httpStatus: response.status,
      contentType,
      cacheControl,
      byteLength,
      expectedHttpStatus: entry.expectedHttpStatus,
      expectedContentType: entry.expectedContentType,
      expectedCacheControl: entry.expectedCacheControl,
      expectedByteSizeRange: byteRange,
      redirectLocation: location || null,
      redirectToPrivateEndpoint,
      privateEndpointLeak,
      oldPrefixFound,
      doublePrefixFound,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      url,
      assetId: entry.assetId,
      mediaType: entry.mediaType,
      status: "failed",
      error: error.message,
      expectedHttpStatus: entry.expectedHttpStatus,
      expectedContentType: entry.expectedContentType,
      expectedCacheControl: entry.expectedCacheControl,
      oldPrefixFound: /coloring\/test-v1/i.test(url),
      doublePrefixFound: /coloring-pages\/coloring-pages/i.test(url),
      elapsedMs: Date.now() - startedAt,
    };
  }
}

function normalizePublicBaseUrl(value) {
  if (!value) throw new Error("Set NEXT_PUBLIC_COLORING_ASSET_BASE_URL or pass --public-base-url before running live verification.");
  const parsed = new URL(value);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Public base URL must use http or https.");
  const normalized = parsed.toString().replace(/\/+$/, "");
  if (!normalized.endsWith("/coloring-pages")) throw new Error("Round 4I live verification expects a public base URL ending in /coloring-pages.");
  if (/coloring-pages\/coloring-pages|coloring\/test-v1/i.test(normalized)) throw new Error("Round 4I live verification base URL has an invalid prefix.");
  if (PRIVATE_ENDPOINT_PATTERNS.some((pattern) => pattern.test(normalized))) throw new Error("Round 4I live verification must use a public asset URL, not a private endpoint.");
  return normalized;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--live") options.live = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--public-base-url") options.publicBaseUrl = args[++index];
    else throw new Error(`Unknown Round 4I verifier option: ${arg}`);
  }
  return options;
}

async function main() {
  const results = await runRound4IFullR2UrlVerification(parseArgs(process.argv.slice(2)));
  console.log(`Round 4I full R2 URL verification status: ${results.status}`);
  console.log(`URLs planned: ${results.summary.urlsPlanned}`);
  console.log(`URLs checked: ${results.summary.urlsChecked}`);
  console.log(`Passed: ${results.summary.passed}`);
  console.log(`Failed: ${results.summary.failed}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
