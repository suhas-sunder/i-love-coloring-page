#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..", "..");
const OUTPUT_ROOT = "public/search-data";
const MANIFEST_PATH = "pipeline/manifests/static-search-data-manifest.json";
const REPORT_PATH = "pipeline/reports/static-search-data-report.md";

export const STATIC_SEARCH_INPUTS = Object.freeze({
  printables: "src/generated/coloring/runtime-printables.json",
  searchIndex: "src/generated/coloring/runtime-search-index.json",
  hubs: "src/generated/coloring/runtime-hubs.json",
  deferred: "src/generated/coloring/runtime-deferred-items.json",
});

export async function buildStaticSearchData({ repoRoot = DEFAULT_ROOT, write = true } = {}) {
  const input = await readInputs(repoRoot);
  const printableById = new Map(input.printables.records.map((record) => [record.assetId, record]));
  const deferredIds = new Set(input.deferred.records.map((record) => record.assetId));
  const hubById = new Map(input.hubs.hubs.map((hub) => [hub.hubId, hub]));
  const allItems = input.searchIndex.entries.map((entry) => toStaticItem(entry, printableById, hubById, deferredIds));
  const itemsById = new Map(allItems.map((item) => [item.id, item]));
  const rootHub = input.hubs.hubs.find((hub) => hub.route === "/coloring-pages");
  if (!rootHub) throw new Error("Missing root coloring-pages hub");

  const files = new Map();
  files.set("all.json", serializePayload({ scope: "all", count: allItems.length, items: allItems }));
  files.set("navigation.json", serializeNavigationPayload(input, printableById, hubById));

  for (const hub of input.hubs.hubs) {
    if (hub.hubId === rootHub.hubId) continue;
    const items = hub.assetIds.map((assetId) => itemsById.get(assetId)).filter(Boolean);
    if (items.length !== hub.assetIds.length) throw new Error(`Search item mismatch for hub ${hub.hubId}`);
    files.set(`hubs/${hub.slug}.json`, serializePayload({ scope: hub.slug, count: items.length, items }));
  }

  const sizes = [...files.entries()].map(([relativePath, content]) => ({ relativePath, bytes: Buffer.byteLength(content) }));
  const summary = {
      rootRecordCount: allItems.length,
      hubFileCount: input.hubs.hubs.length - 1,
      outputFileCount: files.size,
      rootBytes: sizes.find((entry) => entry.relativePath === "all.json").bytes,
      navigationBytes: sizes.find((entry) => entry.relativePath === "navigation.json").bytes,
      navigationPrintableCount: input.printables.records.length,
      navigationCollectionCount: input.hubs.hubs.filter(isApprovedRoutedHub).length,
      navigationSha256: sha256(files.get("navigation.json")),
      totalBytes: sizes.reduce((total, entry) => total + entry.bytes, 0),
      largestHubFile: sizes.filter((entry) => entry.relativePath.startsWith("hubs/")).sort((left, right) => right.bytes - left.bytes)[0],
      deferredRecordCount: input.deferred.records.length,
  };
  const manifest = {
    runId: "static-search-data-v1",
    sources: Object.values(STATIC_SEARCH_INPUTS),
    summary,
    files: sizes,
  };

  validateFiles(input, files, deferredIds);
  if (write) {
    await writeFiles(repoRoot, files);
    await writeText(repoRoot, MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    await writeText(repoRoot, REPORT_PATH, renderReport(summary));
  }

  return { files, summary, manifest };
}

function toStaticItem(entry, printableById, hubById, deferredIds) {
  const printable = printableById.get(entry.assetId);
  if (!printable) throw new Error(`Missing printable for search entry ${entry.assetId}`);
  if (deferredIds.has(entry.assetId)) throw new Error(`Deferred search record leaked: ${entry.assetId}`);
  return {
    id: printable.assetId,
    title: printable.publicTitle,
    alt: printable.altText,
    path: printable.canonicalPath,
    webp: printable.webpPath,
    svg: printable.svgPath,
    primary: cleanHubTitle(hubById.get(printable.primaryHubId)?.title || "Coloring Pages"),
    tags: [...entry.tags],
    text: buildApprovedSearchText(entry.tags),
  };
}

function serializePayload(payload) {
  return `${JSON.stringify({ version: 1, ...payload })}\n`;
}

function validateFiles(input, files, deferredIds) {
  const expectedPaths = new Set(["all.json", "navigation.json", ...input.hubs.hubs.filter((hub) => hub.route !== "/coloring-pages").map((hub) => `hubs/${hub.slug}.json`)]);
  if (files.size !== expectedPaths.size) throw new Error("Static search file count mismatch");
  for (const expectedPath of expectedPaths) if (!files.has(expectedPath)) throw new Error(`Missing static search file: ${expectedPath}`);

  for (const [relativePath, content] of files) {
    const payload = JSON.parse(content);
    if (relativePath === "navigation.json") {
      validateNavigationPayload(payload, input, deferredIds, relativePath, content);
      continue;
    }
    if (payload.count !== payload.items.length) throw new Error(`Count mismatch in ${relativePath}`);
    if (new Set(payload.items.map((item) => item.id)).size !== payload.items.length) throw new Error(`Duplicate item in ${relativePath}`);
    for (const item of payload.items) {
      if (deferredIds.has(item.id)) throw new Error(`Deferred item in ${relativePath}: ${item.id}`);
      if (!item.path.startsWith("/printables/")) throw new Error(`Missing canonical path in ${relativePath}: ${item.id}`);
      if (!/^webp\/.+\.webp$/.test(item.webp) || !/^svg\/.+\.svg$/.test(item.svg)) throw new Error(`Invalid active asset paths in ${relativePath}: ${item.id}`);
    }
    if (/localhost|127\.0\.0\.1|[A-Za-z]:\\|r2\.dev|r2\.cloudflarestorage\.com|amazonaws\.com|coloring-pages\/coloring-pages/i.test(content)) {
      throw new Error(`Unsafe path leakage in ${relativePath}`);
    }
    if (/sourceRelativePath|warningFlags|manualReview|pngPreview|thumbnail/i.test(content)) throw new Error(`Internal field leakage in ${relativePath}`);
  }
}

function serializeNavigationPayload(input, printableById, hubById) {
  const searchEntryById = new Map(input.searchIndex.entries.map((entry) => [entry.assetId, entry]));
  const printables = [...input.printables.records]
    .sort((left, right) => left.publicTitle.localeCompare(right.publicTitle) || left.stableId.localeCompare(right.stableId))
    .map((printable) => {
      const searchEntry = searchEntryById.get(printable.assetId);
      if (!searchEntry) throw new Error(`Missing navigation search entry ${printable.assetId}`);
      const primaryLabel = cleanHubTitle(hubById.get(printable.primaryHubId)?.title || "Coloring Pages");
      return [
        printable.stableId,
        printable.publicTitle,
        printable.canonicalPath,
        printable.webpPath,
        primaryLabel,
        buildApprovedSearchText(searchEntry.tags),
      ];
    });
  const collections = input.hubs.hubs
    .filter(isApprovedRoutedHub)
    .map((hub) => [hub.hubId, cleanHubTitle(hub.title), hub.route, hub.assetCount, normalizeSearchText(`${hub.title} ${hub.slug}`)])
    .sort((left, right) => left[1].localeCompare(right[1]) || left[0].localeCompare(right[0]));
  return `${JSON.stringify({ v: 2, p: printables, c: collections })}\n`;
}

function validateNavigationPayload(payload, input, deferredIds, relativePath, content) {
  const deferredStableIds = new Set([...deferredIds].map((assetId) => assetId.split("__").at(-1)));
  if (payload.v !== 2 || !Array.isArray(payload.p) || !Array.isArray(payload.c)) throw new Error("Invalid navigation search payload");
  if (payload.p.length !== input.printables.records.length) throw new Error("Navigation printable count mismatch");
  if (payload.c.length !== input.hubs.hubs.filter(isApprovedRoutedHub).length) throw new Error("Navigation collection count mismatch");
  if (Buffer.byteLength(content) > 3_000_000) throw new Error("Navigation search payload exceeds 3 MB");
  const printablePaths = payload.p.map((record) => record[2]);
  const collectionPaths = payload.c.map((record) => record[2]);
  if (new Set(printablePaths).size !== printablePaths.length || new Set(collectionPaths).size !== collectionPaths.length) {
    throw new Error("Duplicate navigation search path");
  }
  if (payload.p.some((record) => record.length !== 6 || !/^[0-9a-f]{10}$/.test(record[0]) || !record[2].startsWith("/printables/") || !/^webp\/.+\.webp$/.test(record[3]))) {
    throw new Error("Invalid navigation printable record");
  }
  if (payload.c.some((record) => record.length !== 5 || !/^\/coloring-pages(?:\/[^/?#]+)?$/.test(record[2]) || !Number.isInteger(record[3]))) {
    throw new Error("Invalid navigation collection record");
  }
  if (/\.svg\b|localhost|127\.0\.0\.1|[A-Za-z]:\\|r2\.dev|r2\.cloudflarestorage\.com|amazonaws\.com/i.test(content)) {
    throw new Error(`Unsafe navigation search data in ${relativePath}`);
  }
  if (payload.p.some((record) => deferredStableIds.has(record[0]))) throw new Error("Deferred navigation printable record");
}

function isApprovedRoutedHub(hub) {
  return Boolean(hub.route && hub.indexable === true && hub.sitemap === true);
}

function buildApprovedSearchText(tags) {
  return normalizeSearchText([...new Set(tags)].join(" "));
}

function normalizeSearchText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘`´']/g, "")
    .replace(/[‐‑‒–—−-]/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHubTitle(title) {
  return title.replace(/\s+Coloring Pages$/i, "");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeFiles(repoRoot, files) {
  const outputRoot = path.resolve(repoRoot, OUTPUT_ROOT);
  const expectedRoot = path.resolve(repoRoot, "public", "search-data");
  if (outputRoot !== expectedRoot || !outputRoot.startsWith(path.resolve(repoRoot, "public") + path.sep)) {
    throw new Error(`Refusing to replace unsafe search output path: ${outputRoot}`);
  }
  if (existsSync(outputRoot)) await rm(outputRoot, { recursive: true, force: true });
  for (const [relativePath, content] of files) {
    const target = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function writeText(repoRoot, relativePath, content) {
  const target = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

function renderReport(summary) {
  return `# Static Search Data Report

- Root available records: ${summary.rootRecordCount.toLocaleString("en-US")}
- Deferred records excluded: ${summary.deferredRecordCount.toLocaleString("en-US")}
- Generated files: ${summary.outputFileCount.toLocaleString("en-US")}
- Per-hub files: ${summary.hubFileCount.toLocaleString("en-US")}
- Root index bytes (uncompressed): ${summary.rootBytes.toLocaleString("en-US")}
- On-demand navigation bytes (uncompressed): ${summary.navigationBytes.toLocaleString("en-US")}
- Navigation printable records: ${summary.navigationPrintableCount.toLocaleString("en-US")}
- Navigation collection records: ${summary.navigationCollectionCount.toLocaleString("en-US")}
- Navigation SHA-256: ${summary.navigationSha256}
- Total search-data bytes (uncompressed): ${summary.totalBytes.toLocaleString("en-US")}
- Largest hub file: ${summary.largestHubFile.relativePath} (${summary.largestHubFile.bytes.toLocaleString("en-US")} bytes)

The files are static-export-compatible, fetched only after search or filter interaction, and contain no deferred records or private/local paths.
`;
}

async function readInputs(repoRoot) {
  return Object.fromEntries(await Promise.all(Object.entries(STATIC_SEARCH_INPUTS).map(async ([key, relativePath]) => [key, JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"))])));
}

if (path.resolve(process.argv[1] || "") === SCRIPT_PATH) {
  buildStaticSearchData()
    .then(({ summary }) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
