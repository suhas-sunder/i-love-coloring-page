#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RUN_ID = "round-5c-svg-webp-r2-public-url-verification";
const PLAN_PATH = "pipeline/manifests/round-5c-svg-webp-url-verification-plan.json";
const RESULT_PATH = "pipeline/manifests/round-5c-svg-webp-public-url-results.json";
const REPORT_PATH = "pipeline/reports/round-5c-svg-webp-public-url-results.md";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = await readJson(PLAN_PATH);
  const publicBaseUrl = normalizeBaseUrl(args.publicBaseUrl || process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || "");
  const validation = validatePublicBaseUrl(publicBaseUrl);

  let result;
  if (!validation.ready) {
    result = buildNotRunResult(plan, publicBaseUrl, validation);
  } else {
    result = await runUrlChecks(plan, publicBaseUrl, validation);
  }

  await writeJson(RESULT_PATH, result);
  await writeText(REPORT_PATH, renderReport(result));

  console.log(JSON.stringify({
    runId: RUN_ID,
    publicBaseUrl: result.summary.publicBaseUrlRedacted || "",
    status: result.summary.status,
    publicUrlVerificationPassed: result.summary.publicUrlVerificationPassed,
    checkedUrlCount: result.summary.checkedUrlCount,
    svgCorsPassCount: result.summary.svgCorsPassCount,
  }, null, 2));

  if (validation.ready && !result.summary.publicUrlVerificationPassed) {
    process.exitCode = 1;
  }
}

async function runUrlChecks(plan, publicBaseUrl, validation) {
  const origins = getOriginCandidates();
  const checks = [];
  for (const entry of plan.allUrls) {
    checks.push(await checkUrl(entry, publicBaseUrl, origins));
  }

  const svgChecks = checks.filter((check) => check.mediaType === "svg");
  const webpChecks = checks.filter((check) => check.mediaType === "webp");
  const publicUrlVerificationPassed =
    checks.length === plan.summary.plannedUrlCount &&
    checks.every((check) => check.statusOk && check.contentTypeOk && !check.privateEndpointRedirect && !check.accessDeniedXml && !check.cloudflareErrorHtml && !check.oldPrefix && !check.doubleColoringPagesPrefix) &&
    svgChecks.every((check) => check.corsOk);

  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    sourcePlan: PLAN_PATH,
    validation,
    summary: {
      status: "completed",
      publicBaseUrlConfigured: Boolean(publicBaseUrl),
      publicBaseUrlIsLocalhost: validation.isLocalhost,
      publicBaseUrlRedacted: redactUrl(publicBaseUrl),
      publicUrlVerificationPassed,
      plannedUrlCount: plan.summary.plannedUrlCount,
      checkedUrlCount: checks.length,
      status200Count: checks.filter((check) => check.statusOk).length,
      contentTypePassCount: checks.filter((check) => check.contentTypeOk).length,
      svgCorsPassCount: svgChecks.filter((check) => check.corsOk).length,
      webpCorsDocumentedCount: webpChecks.filter((check) => check.corsHeaderPresent).length,
      noPrivateEndpointRedirect: checks.every((check) => !check.privateEndpointRedirect),
      noAccessDeniedXml: checks.every((check) => !check.accessDeniedXml),
      noCloudflareErrorHtml: checks.every((check) => !check.cloudflareErrorHtml),
      noOldTestPrefix: checks.every((check) => !check.oldPrefix),
      noDoubleColoringPagesPrefix: checks.every((check) => !check.doubleColoringPagesPrefix),
      r2DevTemporaryOnly: validation.isR2Dev,
      customDomainPreferred: !validation.isR2Dev,
    },
    checks,
    blockers: publicUrlVerificationPassed ? [] : ["One or more SVG/WebP public URL checks failed. Fix content types, CORS, object prefix, or upload placement before using this public asset base."],
  };
}

async function checkUrl(entry, publicBaseUrl, origins) {
  const url = buildPublicUrl(publicBaseUrl, entry.r2ObjectKey);
  const origin = origins[0];
  const result = {
    assetId: entry.assetId,
    displayTitle: entry.displayTitle,
    mediaType: entry.mediaType,
    r2ObjectKey: entry.r2ObjectKey,
    url,
    expectedContentType: entry.expectedContentType,
    expectedCorsRequired: entry.expectedCorsRequired,
    status: 0,
    statusOk: false,
    contentType: "",
    contentTypeOk: false,
    cacheControl: "",
    accessControlAllowOrigin: "",
    corsHeaderPresent: false,
    corsOk: false,
    privateEndpointRedirect: false,
    accessDeniedXml: false,
    cloudflareErrorHtml: false,
    oldPrefix: url.includes("/coloring/test-v1"),
    doubleColoringPagesPrefix: url.includes("/coloring-pages/coloring-pages"),
    byteLength: 0,
    error: "",
  };

  try {
    const response = await fetch(url, { method: "GET", headers: { Origin: origin } });
    const contentType = response.headers.get("content-type") || "";
    const cacheControl = response.headers.get("cache-control") || "";
    const accessControlAllowOrigin = response.headers.get("access-control-allow-origin") || "";
    const body = await response.arrayBuffer();
    const textSample = Buffer.from(body).toString("utf8", 0, Math.min(1200, body.byteLength));

    result.status = response.status;
    result.statusOk = response.status === entry.expectedHttpStatus;
    result.contentType = contentType;
    result.contentTypeOk = contentType.toLowerCase().startsWith(entry.expectedContentType.toLowerCase());
    result.cacheControl = cacheControl;
    result.accessControlAllowOrigin = accessControlAllowOrigin;
    result.corsHeaderPresent = Boolean(accessControlAllowOrigin);
    result.corsOk = accessControlAllowOrigin === "*" || origins.includes(accessControlAllowOrigin);
    result.privateEndpointRedirect = /r2\.cloudflarestorage\.com|amazonaws\.com/i.test(response.url || url);
    result.accessDeniedXml = /<Error>|AccessDenied|Access Denied/i.test(textSample);
    result.cloudflareErrorHtml = contentType.includes("text/html") && /Cloudflare|R2|Error/i.test(textSample);
    result.byteLength = body.byteLength;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

function buildNotRunResult(plan, publicBaseUrl, validation) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    sourcePlan: PLAN_PATH,
    validation,
    summary: {
      status: "not_run",
      publicBaseUrlConfigured: Boolean(publicBaseUrl),
      publicBaseUrlIsLocalhost: validation.isLocalhost,
      publicBaseUrlRedacted: redactUrl(publicBaseUrl),
      publicUrlVerificationPassed: false,
      plannedUrlCount: plan.summary.plannedUrlCount,
      checkedUrlCount: 0,
      status200Count: 0,
      contentTypePassCount: 0,
      svgCorsPassCount: 0,
      webpCorsDocumentedCount: 0,
      noPrivateEndpointRedirect: true,
      noAccessDeniedXml: true,
      noCloudflareErrorHtml: true,
      noOldTestPrefix: !validation.hasOldTestPrefix,
      noDoubleColoringPagesPrefix: !validation.hasDuplicateColoringPagesPrefix,
      r2DevTemporaryOnly: validation.isR2Dev,
      customDomainPreferred: false,
    },
    checks: [],
    blockers: validation.blockers,
  };
}

function validatePublicBaseUrl(value) {
  const result = {
    configured: Boolean(value),
    ready: false,
    isHttpUrl: false,
    isLocalhost: false,
    isR2Dev: false,
    isPrivateR2Endpoint: false,
    hasColoringPagesPrefix: false,
    hasOldTestPrefix: false,
    hasDuplicateColoringPagesPrefix: false,
    blockers: [],
  };
  if (!value) {
    result.blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL or --public-base-url is not configured.");
    return result;
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    result.isHttpUrl = url.protocol === "http:" || url.protocol === "https:";
    result.isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
    result.isR2Dev = host.endsWith(".r2.dev");
    result.isPrivateR2Endpoint = host.includes("r2.cloudflarestorage.com") || host.includes("amazonaws.com");
    result.hasColoringPagesPrefix = url.pathname === "/coloring-pages" || url.pathname.endsWith("/coloring-pages");
    result.hasOldTestPrefix = url.pathname.includes("/coloring/test-v1");
    result.hasDuplicateColoringPagesPrefix = url.pathname.includes("/coloring-pages/coloring-pages");
  } catch {
    result.blockers.push("Public asset base URL is not a valid URL.");
    return result;
  }

  if (!result.isHttpUrl) result.blockers.push("Public asset base URL must be HTTP or HTTPS.");
  if (result.isLocalhost) result.blockers.push("Localhost asset base is not public CORS validation.");
  if (!result.hasColoringPagesPrefix) result.blockers.push("Public asset base URL must end with /coloring-pages.");
  if (result.hasOldTestPrefix) result.blockers.push("Public asset base URL uses the stale /coloring/test-v1 prefix.");
  if (result.hasDuplicateColoringPagesPrefix) result.blockers.push("Public asset base URL has a duplicate /coloring-pages/coloring-pages prefix.");
  if (result.isPrivateR2Endpoint) result.blockers.push("Public asset base URL points to a private R2/S3 endpoint.");
  result.ready = result.blockers.length === 0;
  return result;
}

function buildPublicUrl(publicBaseUrl, r2ObjectKey) {
  const keyWithoutPrefix = r2ObjectKey.replace(/^coloring-pages\//, "");
  return `${publicBaseUrl.replace(/\/+$/, "")}/${keyWithoutPrefix.split("/").map(encodeURIComponent).join("/")}`;
}

function getOriginCandidates() {
  const origins = ["http://localhost:3005", "http://127.0.0.1:3005"];
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
      if (!origins.includes(origin)) origins.push(origin);
    } catch {
      // Ignore invalid production origin in this verifier.
    }
  }
  return origins;
}

function renderReport(result) {
  const lines = [
    "# Round 5C SVG + WebP Public URL Results",
    "",
    `- Status: ${result.summary.status}`,
    `- Public base URL configured: ${result.summary.publicBaseUrlConfigured}`,
    `- Public base URL: ${result.summary.publicBaseUrlRedacted || "(missing)"}`,
    `- Public URL verification passed: ${result.summary.publicUrlVerificationPassed}`,
    `- Planned URLs: ${result.summary.plannedUrlCount}`,
    `- Checked URLs: ${result.summary.checkedUrlCount}`,
    `- HTTP 200 count: ${result.summary.status200Count}`,
    `- Content-Type pass count: ${result.summary.contentTypePassCount}`,
    `- SVG CORS pass count: ${result.summary.svgCorsPassCount}`,
    `- No private endpoint redirect: ${result.summary.noPrivateEndpointRedirect}`,
    `- No XML access denied: ${result.summary.noAccessDeniedXml}`,
    `- No Cloudflare/R2 error HTML: ${result.summary.noCloudflareErrorHtml}`,
    `- r2.dev temporary only: ${result.summary.r2DevTemporaryOnly}`,
    "",
  ];
  if (result.blockers.length) {
    lines.push("## Blockers", "", ...result.blockers.map((item) => `- ${item}`), "");
  }
  if (result.checks.length) {
    lines.push("## Checks", "");
    for (const check of result.checks.slice(0, 30)) {
      lines.push(`- ${check.mediaType}: ${check.status} ${check.contentType || "(missing type)"} CORS ${check.accessControlAllowOrigin || "(missing)"} ${check.r2ObjectKey}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, payload) {
  const target = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const target = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text, "utf8");
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function redactUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return value;
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--public-base-url") parsed.publicBaseUrl = args[++index];
    else if (arg.startsWith("--public-base-url=")) parsed.publicBaseUrl = arg.split("=")[1];
    else throw new Error(`Unknown Round 5C verifier option: ${arg}`);
  }
  return parsed;
}

if (!existsSync(path.join(REPO_ROOT, PLAN_PATH))) {
  console.error(`Missing ${PLAN_PATH}. Run round-5c-build-svg-webp-test-bundle.mjs first.`);
  process.exitCode = 1;
} else if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
