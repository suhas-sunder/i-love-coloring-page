#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GENERATED_AT = new Date().toISOString();
const DEFAULT_PUBLIC_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const OBJECT_KEY_MAP = "pipeline/manifests/round-5n-clean-upload-object-key-map.json";
const OUTPUT_JSON = "pipeline/manifests/round-5o-post-upload-verifier-results.json";
const OUTPUT_REPORT = "pipeline/reports/round-5o-post-upload-verifier-results.md";
const CATEGORY_EXAMPLE = "st-patricks-day";
const SVG_CORS_ORIGINS = [
  "https://www.ilovecoloringpage.com",
  "http://localhost:3005",
  "http://127.0.0.1:3005",
];
const CORS_HEADER_NAME = "Access-Control-Allow-Origin";

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const objectMap = await readJson(OBJECT_KEY_MAP);
  const records = args.category ? objectMap.records.filter((record) => record.category === args.category) : objectMap.records;
  if (args.category && records.length === 0) throw new Error(`No records found for --category ${args.category}. Example: ${CATEGORY_EXAMPLE}`);
  const allChecks = buildChecks(records, args.publicBaseUrl);
  const checks = selectChecks(allChecks, args);
  if (!checks.length) throw new Error("No objects selected for verification.");

  const results = [];
  for (const check of checks) {
    results.push(await verifyUrl(check));
    if (check.kind === "svg") {
      for (const origin of SVG_CORS_ORIGINS) {
        results.push(await verifySvgCors(check, origin));
      }
    }
  }

  const summary = summarizeResults(results, checks);
  const payload = {
    generatedAt: GENERATED_AT,
    runId: "round-5o-post-upload-verifier-results",
    publicBaseUrl: args.publicBaseUrl,
    category: args.category || null,
    mode: args.full ? "full" : "sample",
    selectedObjectCount: checks.length,
    summary,
    results,
  };
  await writeJson(OUTPUT_JSON, payload);
  await writeText(OUTPUT_REPORT, renderReport(payload));
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exitCode = 1;
}

function buildChecks(records, publicBaseUrl) {
  const normalizedBase = publicBaseUrl.replace(/\/+$/, "");
  const checks = [];
  for (const record of records) {
    for (const item of [
      { kind: "svg", objectKey: record.cleanSvgObjectKey, contentType: "image/svg+xml" },
      { kind: "webp", objectKey: record.cleanWebpObjectKey, contentType: "image/webp" },
    ]) {
      assertSafeKey(item.objectKey);
      checks.push({
        assetId: record.assetId,
        category: record.category,
        kind: item.kind,
        objectKey: item.objectKey,
        url: `${normalizedBase}/${item.objectKey.replace(/^coloring-pages\//, "")}`,
        expectedContentType: item.contentType,
      });
    }
  }
  return checks;
}

function selectChecks(allChecks, parsedArgs) {
  let selected = allChecks;
  if (parsedArgs.category) {
    selected = allChecks;
  } else if (!parsedArgs.full) {
    const byCategory = new Map();
    for (const check of allChecks) {
      const key = `${check.category}:${check.kind}`;
      if (!byCategory.has(key)) byCategory.set(key, check);
    }
    selected = [...byCategory.values()].sort((left, right) => left.objectKey.localeCompare(right.objectKey));
  }
  if (parsedArgs.sample) selected = selected.slice(0, Math.min(parsedArgs.sampleSize || 300, selected.length));
  if (parsedArgs.limit > 0) selected = selected.slice(0, parsedArgs.limit);
  return selected;
}

async function verifyUrl(check) {
  const response = await fetch(check.url, { method: "GET", cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";
  const cacheControl = response.headers.get("cache-control") || "";
  const bytes = Number(response.headers.get("content-length") || 0);
  return {
    type: "url",
    assetId: check.assetId,
    kind: check.kind,
    objectKey: check.objectKey,
    url: check.url,
    status: response.status,
    ok: response.status === 200 && contentType.toLowerCase().includes(check.expectedContentType),
    contentType,
    expectedContentType: check.expectedContentType,
    cacheControl,
    bytes,
  };
}

async function verifySvgCors(check, origin) {
  const response = await fetch(check.url, {
    method: "GET",
    headers: { Origin: origin },
    cache: "no-store",
  });
  const allowOrigin = response.headers.get("access-control-allow-origin") || "";
  return {
    type: "svg-cors",
    assetId: check.assetId,
    kind: check.kind,
    objectKey: check.objectKey,
    url: check.url,
    origin,
    status: response.status,
    expectedCorsHeader: CORS_HEADER_NAME,
    accessControlAllowOrigin: allowOrigin,
    ok: response.status === 200 && (allowOrigin === "*" || allowOrigin === origin),
  };
}

function summarizeResults(results, checks) {
  const failed = results.filter((result) => !result.ok);
  return {
    checkedObjects: checks.length,
    urlChecks: results.filter((result) => result.type === "url").length,
    corsChecks: results.filter((result) => result.type === "svg-cors").length,
    failedChecks: failed.length,
    passed: failed.length === 0,
  };
}

function assertSafeKey(objectKey) {
  if (!/^coloring-pages\/(?:svg|webp)\//.test(objectKey)) throw new Error(`Invalid object key: ${objectKey}`);
  if (objectKey.includes("coloring-pages/coloring-pages")) throw new Error(`Duplicate prefix: ${objectKey}`);
  if (objectKey.includes("coloring/test-v1")) throw new Error(`Old test prefix: ${objectKey}`);
  if (/\/(?:png|thumbs)\//i.test(objectKey)) throw new Error(`PNG or thumbs key is not allowed: ${objectKey}`);
}

function renderReport(payload) {
  return `# Round 5O Post-Upload Verifier Results

- Public base URL: ${payload.publicBaseUrl}
- Category: ${payload.category || "all"}
- Mode: ${payload.mode}
- Selected object count: ${payload.selectedObjectCount}
- URL checks: ${payload.summary.urlChecks}
- CORS checks: ${payload.summary.corsChecks}
- Failed checks: ${payload.summary.failedChecks}
- Passed: ${payload.summary.passed}
`;
}

function parseArgs(rawArgs) {
  const parsed = {
    full: false,
    sample: false,
    sampleSize: 300,
    limit: 0,
    category: "",
    publicBaseUrl: DEFAULT_PUBLIC_BASE_URL,
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--full") parsed.full = true;
    else if (arg === "--sample") parsed.sample = true;
    else if (arg === "--sample-size") parsed.sampleSize = Number(rawArgs[++index] || 300);
    else if (arg === "--limit") parsed.limit = Number(rawArgs[++index] || 0);
    else if (arg === "--category") parsed.category = normalizeCategory(rawArgs[++index] || "");
    else if (arg === "--public-base-url") parsed.publicBaseUrl = rawArgs[++index] || DEFAULT_PUBLIC_BASE_URL;
  }
  parsed.sampleSize = Number.isFinite(parsed.sampleSize) && parsed.sampleSize > 0 ? Math.floor(parsed.sampleSize) : 300;
  parsed.limit = Number.isFinite(parsed.limit) && parsed.limit > 0 ? Math.floor(parsed.limit) : 0;
  return parsed;
}

function normalizeCategory(value) {
  const category = String(value || "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!category) return "";
  if (!/^[a-z0-9-]+$/.test(category)) throw new Error(`Invalid --category value: ${category}`);
  return category;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, String(value), "utf8");
}
