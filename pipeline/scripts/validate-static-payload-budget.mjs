#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;
const budgets = {
  homepageHtml: 220 * KB,
  homepageRsc: 150 * KB,
  galleryHtml: 300 * KB,
  galleryRsc: 180 * KB,
  largeHubHtml: 280 * KB,
  largeHubRsc: 170 * KB,
  paginatedHtml: 207762,
  paginatedRsc: 106716,
  printableHtml: 100 * KB,
  printableRsc: 70 * KB,
  total: 1.35 * GB,
  javascript: 717241 + 35 * KB,
};

if (!existsSync(OUT)) {
  console.error("Static payload validation not_run: out/ does not exist. Run a direct Next build first.");
  process.exit(2);
}

const files = listFiles(OUT);
const htmlFiles = files.filter((file) => file.relativePath.endsWith(".html")).sort(bySizeDescending);
const rscFiles = files.filter((file) => file.relativePath.endsWith(".txt")).sort(bySizeDescending);
const jsFiles = files.filter((file) => file.relativePath.endsWith(".js"));
const printableHtmlFiles = htmlFiles.filter((file) => /^printables\/.+\.html$/.test(file.relativePath));
const printableRscFiles = rscFiles.filter((file) => /^printables\/.+\.txt$/.test(file.relativePath));
const printablePrimaryRscFiles = printableHtmlFiles.map((file) => fileEntry(file.relativePath.replace(/\.html$/, ".txt"))).filter(Boolean).sort(bySizeDescending);
const representativePrintableHtml = printableHtmlFiles.find((file) => file.relativePath.includes("animals-alligator-4feec8505a")) || printableHtmlFiles[0];
const representativePrintableRsc = representativePrintableHtml ? fileEntry(representativePrintableHtml.relativePath.replace(/\.html$/, ".txt")) : null;
const homepageHtml = fileEntry("index.html");
const homepageRsc = fileEntry("index.txt");
const galleryHtml = fileEntry("coloring-pages.html");
const galleryRsc = fileEntry("coloring-pages.txt");
const largeHubHtml = fileEntry("coloring-pages/animals.html");
const largeHubRsc = fileEntry("coloring-pages/animals.txt");
const representativeHtml = fileEntry("coloring-pages/animals/page/2.html")
  || htmlFiles.find((file) => /^coloring-pages\/.+\/page\/\d+\.html$/.test(file.relativePath));
const representativeRsc = representativeHtml
  ? fileEntry(representativeHtml.relativePath.replace(/\.html$/, ".txt"))
  : rscFiles.find((file) => /^coloring-pages\/.+\/page\/\d+\.txt$/.test(file.relativePath));
const smallHubHtml = fileEntry("coloring-pages/forget-me-not.html");
const smallHubRsc = fileEntry("coloring-pages/forget-me-not.txt");
const totalBytes = files.reduce((total, file) => total + file.bytes, 0);
const htmlBytes = htmlFiles.reduce((total, file) => total + file.bytes, 0);
const rscBytes = rscFiles.reduce((total, file) => total + file.bytes, 0);
const javascriptBytes = jsFiles.reduce((total, file) => total + file.bytes, 0);
const javascriptBaselineBytes = 717241;
const javascriptChunks = jsFiles.map((file) => ({
  ...file,
  containsPrintOrDownloadLogic: /Printable PDF|iLoveColoringPage\.com|Preparing printable|Download WebP/.test(
    readFileSync(path.join(OUT, file.relativePath), "utf8"),
  ),
}));
const directoryDistribution = getDirectoryDistribution(OUT);

const available = JSON.parse(readFileSync(path.join(ROOT, "src/generated/coloring/runtime-available-items.json"), "utf8"));
const probeIds = available.items.slice(1000, 1010).map((item) => item.assetId);
const payloadProbeFiles = [
  homepageHtml,
  homepageRsc,
  galleryHtml,
  galleryRsc,
  largeHubHtml,
  largeHubRsc,
  representativeHtml,
  representativeRsc,
  smallHubHtml,
  smallHubRsc,
  representativePrintableHtml,
  representativePrintableRsc,
].filter(Boolean);
const embeddedFullDatasetProbeMatches = [];
for (const file of payloadProbeFiles) {
  const text = readFileSync(path.join(OUT, file.relativePath), "utf8");
  const matches = probeIds.filter((assetId) => text.includes(assetId));
  if (matches.length > 0) embeddedFullDatasetProbeMatches.push({ file: file.relativePath, matches });
}

const checks = {
  homepageHtml: Boolean(homepageHtml && homepageHtml.bytes <= budgets.homepageHtml),
  homepageRsc: Boolean(homepageRsc && homepageRsc.bytes <= budgets.homepageRsc),
  galleryHtml: Boolean(galleryHtml && galleryHtml.bytes <= budgets.galleryHtml),
  galleryRsc: Boolean(galleryRsc && galleryRsc.bytes <= budgets.galleryRsc),
  largeHubHtml: Boolean(largeHubHtml && largeHubHtml.bytes <= budgets.largeHubHtml),
  largeHubRsc: Boolean(largeHubRsc && largeHubRsc.bytes <= budgets.largeHubRsc),
  paginatedHtml: Boolean(representativeHtml && representativeHtml.bytes <= budgets.paginatedHtml),
  paginatedRsc: Boolean(representativeRsc && representativeRsc.bytes <= budgets.paginatedRsc),
  printableHtml: Boolean(representativePrintableHtml && representativePrintableHtml.bytes <= budgets.printableHtml),
  printableRsc: Boolean(representativePrintableRsc && representativePrintableRsc.bytes <= budgets.printableRsc),
  printableCount: printableHtmlFiles.length === available.items.length,
  total: totalBytes <= budgets.total,
  javascript: javascriptBytes <= budgets.javascript,
  noFullDatasetProbe: embeddedFullDatasetProbeMatches.length === 0,
};

const result = {
  passed: Object.values(checks).every(Boolean),
  checks,
  budgets,
  measurements: {
    totalBytes,
    fileCount: files.length,
    htmlBytes,
    htmlCount: htmlFiles.length,
    rscBytes,
    rscCount: rscFiles.length,
    javascriptBytes,
    javascriptBaselineBytes,
    javascriptIncreaseBytes: javascriptBytes - javascriptBaselineBytes,
    javascriptFileCount: jsFiles.length,
    javascriptChunks,
    printDownloadChunks: javascriptChunks.filter((file) => file.containsPrintOrDownloadLogic),
    largestImmediateOutputDirectories: directoryDistribution.slice(0, 10),
    homepageHtml,
    homepageRsc,
    galleryHtml,
    galleryRsc,
    largeHubHtml,
    largeHubRsc,
    representativePaginatedHtml: representativeHtml || null,
    representativePaginatedRsc: representativeRsc || null,
    smallHubHtml,
    smallHubRsc,
    printableHtmlCount: printableHtmlFiles.length,
    printableRscFileCount: printableRscFiles.length,
    printablePrimaryRscCount: printablePrimaryRscFiles.length,
    representativePrintableHtml: representativePrintableHtml || null,
    representativePrintableRsc,
    largestPrintableHtml: printableHtmlFiles[0] || null,
    largestPrintableRsc: printableRscFiles[0] || null,
    largestPrintablePrimaryRsc: printablePrimaryRscFiles[0] || null,
    sampledPrintableHtmlMedian: sampledMedian(printableHtmlFiles),
    sampledPrintableRscMedian: sampledMedian(printablePrimaryRscFiles),
    largestHtml: htmlFiles.slice(0, 10),
    largestRsc: rscFiles.slice(0, 10),
    embeddedFullDatasetProbeMatches,
  },
};

console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;

function listFiles(root) {
  const results = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolutePath);
      else results.push({ relativePath: path.relative(root, absolutePath).replaceAll("\\", "/"), bytes: statSync(absolutePath).size });
    }
  }
  walk(root);
  return results;
}

function fileEntry(relativePath) {
  const absolutePath = path.join(OUT, relativePath);
  return existsSync(absolutePath) ? { relativePath, bytes: statSync(absolutePath).size } : null;
}

function bySizeDescending(left, right) {
  return right.bytes - left.bytes;
}

function sampledMedian(entries, sampleSize = 101) {
  if (entries.length === 0) return null;
  const sortedByPath = [...entries].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const sample = Array.from({ length: Math.min(sampleSize, sortedByPath.length) }, (_, index) => {
    const sourceIndex = Math.round(index * (sortedByPath.length - 1) / Math.max(1, Math.min(sampleSize, sortedByPath.length) - 1));
    return sortedByPath[sourceIndex];
  }).sort((left, right) => left.bytes - right.bytes);
  return { sampleCount: sample.length, ...sample[Math.floor(sample.length / 2)] };
}

function getDirectoryDistribution(root) {
  const directories = [];
  function walk(directory) {
    const entries = readdirSync(directory, { withFileTypes: true });
    directories.push({
      relativePath: path.relative(root, directory).replaceAll("\\", "/") || ".",
      immediateFileCount: entries.filter((entry) => entry.isFile()).length,
      immediateDirectoryCount: entries.filter((entry) => entry.isDirectory()).length,
      immediateEntryCount: entries.length,
    });
    for (const entry of entries) if (entry.isDirectory()) walk(path.join(directory, entry.name));
  }
  walk(root);
  return directories.sort((left, right) => right.immediateEntryCount - left.immediateEntryCount || left.relativePath.localeCompare(right.relativePath));
}
