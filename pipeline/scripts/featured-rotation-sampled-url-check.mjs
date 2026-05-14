#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

const REPO_ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const LOCAL_ORIGIN = "http://localhost:3005";
const ROUTE_SLUGS = ["coloring-pages", "animals", "t-rex", "dragons", "geometric", "anime-girls", "christmas", "plushies"];
const MIN_EXPECTED_CHECKS = 70;

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const rotation = await importRotationUtility();
  const source = await readSourceData();
  const samples = buildSamples(source, rotation);
  const results = await checkEntries(samples);
  const failures = results.filter((entry) => !entry.passed);
  const summary = {
    sampledUrlCheckPassed: failures.length === 0 && results.length >= MIN_EXPECTED_CHECKS,
    recordsChecked: results.length,
    minimumExpectedChecks: MIN_EXPECTED_CHECKS,
    routesCovered: [...new Set(results.map((entry) => entry.routePath))].sort(),
    availableRecords: source.available.items.length,
    deferredRecords: source.deferred.records.length,
    deferredRecordsExcluded: results.every((entry) => !source.deferredIds.has(entry.assetId)),
    webpHttp200: results.every((entry) => entry.webp.httpStatus === 200 || entry.webp.httpStatus === 206),
    webpContentTypeImageWebp: results.every((entry) => /^image\/webp\b/i.test(entry.webp.contentType)),
    svgHttp200: results.every((entry) => entry.svg.httpStatus === 200 || entry.svg.httpStatus === 206),
    svgContentTypeImageSvg: results.every((entry) => /^image\/svg\+xml\b/i.test(entry.svg.contentType)),
    svgCorsPassesForLocalhost: results.every((entry) => entry.svg.corsPasses),
    noR2Dev: results.every((entry) => !/r2\.dev/i.test(`${entry.webp.url} ${entry.svg.url}`)),
    noLocalhostUrls: results.every((entry) => !/localhost|127\.0\.0\.1/i.test(`${entry.webp.url} ${entry.svg.url}`)),
    noPngSubstitute: results.every((entry) => !/\/png\//i.test(entry.webp.url)),
    noDuplicatePrefix: results.every((entry) => !/coloring-pages\/coloring-pages/i.test(`${entry.webp.url} ${entry.svg.url}`)),
    failures: failures.length,
  };
  const manifest = {
    generatedAt: new Date().toISOString(),
    runId: "featured-rotation-sampled-url-check",
    summary,
    results,
    failures,
  };

  await writeJson("pipeline/manifests/featured-rotation-sampled-url-check-results.json", manifest);
  await writeText("pipeline/reports/featured-rotation-sampled-url-check-report.md", buildReport(manifest));
  console.log(JSON.stringify({ runId: manifest.runId, sampledUrlCheckPassed: summary.sampledUrlCheckPassed, recordsChecked: results.length, failures: failures.length }, null, 2));

  if (!summary.sampledUrlCheckPassed) process.exitCode = 1;
}

async function readSourceData() {
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const featured = await readJson("src/generated/coloring/runtime-hub-featured-items.json");
  const itemById = new Map(available.items.map((item) => [item.assetId, item]));
  const hubBySlug = new Map(hubs.hubs.map((hub) => [hub.slug, hub]));
  const featuredByHubId = new Map(featured.hubs.map((entry) => [entry.hubId, entry.assetIds]));
  const deferredIds = new Set(deferred.records.map((item) => item.assetId));
  return { available, deferred, hubs, featured, itemById, hubBySlug, featuredByHubId, deferredIds };
}

function buildSamples(source, rotation) {
  const samples = [];
  const seen = new Set();
  const rootHub = getRootHub(source);
  if (!rootHub) throw new Error("Missing coloring-pages root hub");

  addRouteSamples({
    source,
    rotation,
    samples,
    seen,
    routePath: "/",
    hub: rootHub,
    mode: "homepage-random",
    seed: rotation.getHomepageReloadSeed("sampled-url-check"),
    limit: 192,
    count: 8,
  });

  for (const slug of ROUTE_SLUGS) {
    const hub = slug === "coloring-pages" ? rootHub : source.hubBySlug.get(slug);
    if (!hub) throw new Error(`Missing hub ${slug}`);
    addRouteSamples({
      source,
      rotation,
      samples,
      seen,
      routePath: hub.route,
      hub,
      mode: "hub-three-day",
      seed: rotation.getHubRotationSeed(hub.slug, new Date("2026-05-13T12:00:00Z")),
      limit: slug === "coloring-pages" ? 192 : 96,
      count: 12,
    });
  }

  return samples;
}

function getRootHub(source) {
  return source.hubs.hubs.find((hub) => hub.route === "/coloring-pages");
}

function addRouteSamples({ source, rotation, samples, seen, routePath, hub, mode, seed, limit, count }) {
  const fallback = getFeaturedItems(source, hub, count);
  const candidates = getRotationCandidateItems(source, hub, limit);
  const selected = rotation.getRotatingFeaturedItems({
    candidates,
    fallbackItems: fallback,
    count: fallback.length,
    seed,
    keyFn: (item) => item.assetId,
  });

  for (const item of selected) {
    const key = `${routePath}:${item.assetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push({
      mode,
      routePath,
      pageUrl: `${SITE_URL}${routePath === "/" ? "" : routePath}`,
      hubSlug: hub.slug || "coloring-pages",
      hubTitle: hub.title,
      assetId: item.assetId,
      title: item.title,
      webpUrl: buildAssetUrl(item.assetSubpaths.webpPreview),
      svgUrl: buildAssetUrl(item.assetSubpaths.svg),
      sourceWebpPath: item.assetSubpaths.webpPreview,
      sourceSvgPath: item.assetSubpaths.svg,
    });
  }
}

function getFeaturedItems(source, hub, count) {
  const ids = source.featuredByHubId.get(hub.hubId) || hub.featuredAssetIds || [];
  return ids
    .slice(0, count)
    .map((assetId) => source.itemById.get(assetId))
    .filter(Boolean);
}

function getRotationCandidateItems(source, hub, limit) {
  const featuredIds = source.featuredByHubId.get(hub.hubId) || [];
  return getDiverseAssetIds([...featuredIds, ...(hub.previewAssetIds || []), ...hub.assetIds], source.itemById, limit)
    .map((assetId) => source.itemById.get(assetId))
    .filter(Boolean);
}

function getDiverseAssetIds(assetIds, itemById, limit) {
  const seenIds = new Set();
  const buckets = new Map();

  for (const assetId of assetIds) {
    if (seenIds.has(assetId) || !itemById.has(assetId)) continue;
    seenIds.add(assetId);
    const bucketKey = assetId.split("__")[0] || "misc";
    const bucket = buckets.get(bucketKey) || [];
    bucket.push(assetId);
    buckets.set(bucketKey, bucket);
  }

  const selected = [];
  const bucketKeys = [...buckets.keys()];
  let cursor = 0;
  while (selected.length < limit && bucketKeys.length > 0) {
    const bucketKey = bucketKeys[cursor % bucketKeys.length];
    const bucket = buckets.get(bucketKey) || [];
    const nextId = bucket.shift();
    if (nextId) selected.push(nextId);
    if (bucket.length === 0) {
      buckets.delete(bucketKey);
      bucketKeys.splice(cursor % bucketKeys.length, 1);
      if (bucketKeys.length === 0) break;
      cursor %= bucketKeys.length;
    } else {
      cursor = (cursor + 1) % bucketKeys.length;
    }
  }
  return selected;
}

async function checkEntries(entries) {
  const results = [];
  const queue = [...entries];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length > 0) {
      const entry = queue.shift();
      results.push(await checkEntry(entry));
    }
  });
  await Promise.all(workers);
  return results.sort((a, b) => `${a.routePath}:${a.assetId}`.localeCompare(`${b.routePath}:${b.assetId}`));
}

async function checkEntry(entry) {
  const webp = await fetchAsset(entry.webpUrl, {});
  const svg = await fetchAsset(entry.svgUrl, { Origin: LOCAL_ORIGIN });
  const checks = {
    pageRouteKnown: entry.routePath === "/" || entry.routePath.startsWith("/coloring-pages"),
    webpUrlPresent: Boolean(entry.webpUrl),
    svgUrlPresent: Boolean(entry.svgUrl),
    webpHttpOk: webp.httpStatus === 200 || webp.httpStatus === 206,
    webpContentTypeOk: /^image\/webp\b/i.test(webp.contentType),
    svgHttpOk: svg.httpStatus === 200 || svg.httpStatus === 206,
    svgContentTypeOk: /^image\/svg\+xml\b/i.test(svg.contentType),
    svgCorsPasses: svg.corsPasses,
    noR2Dev: !/r2\.dev/i.test(`${entry.webpUrl} ${entry.svgUrl}`),
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(`${entry.webpUrl} ${entry.svgUrl}`),
    noPngSubstitute: !/\/png\//i.test(entry.webpUrl),
    noDuplicatePrefix: !/coloring-pages\/coloring-pages/i.test(`${entry.webpUrl} ${entry.svgUrl}`),
  };

  return {
    ...entry,
    webp: { url: entry.webpUrl, ...webp },
    svg: { url: entry.svgUrl, ...svg },
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

async function fetchAsset(url, headers) {
  if (!url) return { httpStatus: 0, contentType: "", corsAllowOrigin: "", corsPasses: false, error: "missing-url" };
  try {
    let response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "i-love-coloring-page-featured-rotation-check/1.0", ...headers },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok || !response.headers.get("content-type")) {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "i-love-coloring-page-featured-rotation-check/1.0",
          Range: "bytes=0-0",
          ...headers,
        },
        signal: AbortSignal.timeout(15_000),
      });
    }
    const corsAllowOrigin = response.headers.get("access-control-allow-origin") || "";
    return {
      httpStatus: response.status,
      contentType: response.headers.get("content-type") || "",
      corsAllowOrigin,
      corsPasses: !headers.Origin || corsAllowOrigin === "*" || corsAllowOrigin.includes(headers.Origin),
      error: "",
    };
  } catch (error) {
    return {
      httpStatus: 0,
      contentType: "",
      corsAllowOrigin: "",
      corsPasses: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildAssetUrl(subpath) {
  if (!subpath) return "";
  return `${ASSET_BASE_URL}/${subpath.split("/").map(encodeURIComponent).join("/")}`;
}

async function importRotationUtility() {
  const source = await fs.readFile(path.join(REPO_ROOT, "src", "lib", "coloring", "featuredRotation.ts"), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  });
  const encoded = Buffer.from(transpiled.outputText).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function buildReport(manifest) {
  const rows = Object.entries(manifest.summary).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? (value ? "pass" : "fail") : String(value),
  ]);
  const failureRows = manifest.failures.slice(0, 20).map((entry) => [
    entry.routePath,
    entry.assetId,
    entry.webp.httpStatus,
    entry.webp.contentType,
    entry.svg.httpStatus,
    entry.svg.contentType,
    entry.svg.corsAllowOrigin || "(none)",
  ]);

  return `# Featured Rotation Sampled URL Check

${markdownTable(["Check", "Result"], rows)}

${manifest.failures.length ? `## Failures\n\n${markdownTable(["Route", "Asset", "WebP HTTP", "WebP type", "SVG HTTP", "SVG type", "SVG CORS"], failureRows)}\n` : "All sampled rotated featured WebP and internal SVG URL checks passed.\n"}
`;
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\|/g, "\\|")).join(" | ")} |`),
  ].join("\n");
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, data) {
  const target = path.join(REPO_ROOT, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeText(relativePath, data) {
  const target = path.join(REPO_ROOT, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
}
