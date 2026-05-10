import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ROUND4G_GENERATED_AT, ROUND4G_RUN_ID } from "./round-4g-build-r2-test-bundle.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");
const PLAN_PATH = "pipeline/manifests/round-4g-r2-test-url-verification-plan.json";
const RESULTS_PATH = "pipeline/manifests/round-4g-r2-test-url-verification-results.json";
const PRIVATE_ENDPOINT_PATTERNS = [/\.r2\.cloudflarestorage\.com/i, /amazonaws\.com/i, /X-Amz-/i, /Signature=/i];

export async function runRound4GR2UrlVerification(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const dryRun = options.live ? false : options.dryRun !== false;
  const plan = await readJson(path.join(repoRoot, PLAN_PATH));
  const urls = plan.allUrls || [];

  if (dryRun) {
    const results = {
      generatedAt: ROUND4G_GENERATED_AT,
      runId: ROUND4G_RUN_ID,
      status: "not_run",
      reason: "dry_run_no_public_upload_yet",
      planPath: PLAN_PATH,
      summary: {
        urlsPlanned: urls.length,
        urlsChecked: 0,
        passed: 0,
        failed: 0,
        skipped: urls.length,
      },
      entries: urls.map((entry) => ({
        url: entry.url,
        assetId: entry.assetId,
        mediaType: entry.mediaType,
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
  for (const entry of urls) {
    checked.push(await checkUrl(entry));
  }

  const failed = checked.filter((entry) => entry.status !== "passed");
  const results = {
    generatedAt: new Date().toISOString(),
    runId: ROUND4G_RUN_ID,
    status: failed.length ? "failed_expected_until_upload" : "passed",
    reason: failed.length ? "one_or_more_public_urls_failed_verification" : "all_public_urls_verified",
    planPath: PLAN_PATH,
    summary: {
      urlsPlanned: urls.length,
      urlsChecked: checked.length,
      passed: checked.length - failed.length,
      failed: failed.length,
      skipped: 0,
    },
    entries: checked,
  };

  await writeJson(path.join(repoRoot, RESULTS_PATH), results);
  return results;
}

async function checkUrl(entry) {
  const startedAt = Date.now();
  try {
    const response = await fetch(entry.url, { method: "GET", redirect: "manual" });
    const contentType = response.headers.get("content-type") || "";
    const cacheControl = response.headers.get("cache-control") || "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    const location = response.headers.get("location") || "";
    const body = response.ok ? await response.arrayBuffer() : null;
    const byteLength = body ? body.byteLength : contentLength;
    const redirectToPrivateEndpoint = response.status >= 300 && response.status < 400 && PRIVATE_ENDPOINT_PATTERNS.some((pattern) => pattern.test(location));
    const privateUrlLeak = PRIVATE_ENDPOINT_PATTERNS.some((pattern) => pattern.test(entry.url) || pattern.test(location));
    const contentTypeOk = contentType.toLowerCase().startsWith(entry.expectedContentType.toLowerCase());
    const statusOk = response.status === entry.expectedHttpStatus;
    const byteRange = entry.expectedByteSizeRange || { min: 1, max: Number.MAX_SAFE_INTEGER };
    const byteSizeOk = byteLength >= byteRange.min && byteLength <= byteRange.max;
    const cacheOk = !entry.expectedCacheControl || !cacheControl || cacheControl === entry.expectedCacheControl;
    const passed = statusOk && contentTypeOk && byteSizeOk && cacheOk && !redirectToPrivateEndpoint && !privateUrlLeak;

    return {
      url: entry.url,
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
      privateEndpointLeak: privateUrlLeak,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      url: entry.url,
      assetId: entry.assetId,
      mediaType: entry.mediaType,
      status: "failed",
      error: error.message,
      expectedHttpStatus: entry.expectedHttpStatus,
      expectedContentType: entry.expectedContentType,
      expectedCacheControl: entry.expectedCacheControl,
      elapsedMs: Date.now() - startedAt,
    };
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = await runRound4GR2UrlVerification(args);
  console.log(`Round 4G R2 URL verification status: ${results.status}`);
  console.log(`URLs planned: ${results.summary.urlsPlanned}`);
  console.log(`URLs checked: ${results.summary.urlsChecked}`);
  console.log(`Passed: ${results.summary.passed}`);
  console.log(`Failed: ${results.summary.failed}`);
}

function parseArgs(args) {
  const options = {};
  for (const arg of args) {
    if (arg === "--live") options.live = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown Round 4G verifier option: ${arg}`);
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
