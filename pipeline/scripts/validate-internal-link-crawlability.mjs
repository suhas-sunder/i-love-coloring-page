#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { analyzeInternalLinkGraph } from "../lib/internal-link-graph.mjs";

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const writeEvidence = args.has("--write-evidence");
const strict = args.has("--strict") || !args.has("--report-only");
const reviewDir = path.join(rootDir, "pipeline", "review", "internal-link-crawlability");

const result = analyzeInternalLinkGraph({ rootDir });

if (writeEvidence) {
  await mkdir(reviewDir, { recursive: true });
  await writeFile(path.join(reviewDir, "static-link-graph.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(path.join(reviewDir, "static-link-graph-summary.md"), renderMarkdown(result), "utf8");
}

console.log(JSON.stringify({
  policy: result.policy,
  evidenceWritten: writeEvidence,
  ...result.summary,
}, null, 2));

if (strict && !result.summary.passed) {
  console.error(`Internal-link crawlability validation failed with ${result.findings.length} retained finding(s).`);
  process.exitCode = 1;
}

function renderMarkdown(result) {
  const summary = result.summary;
  const rows = [
    ["Public HTML nodes", summary.publicHtmlNodeCount],
    ["Indexable nodes", summary.indexableNodeCount],
    ["Physical HTML files", summary.physicalHtmlFileCount],
    ["Static internal anchor edges", summary.staticInternalEdgeCount],
    ["Unique internal route edges", summary.uniqueInternalEdgeCount],
    ["Broken links", summary.brokenLinkCount],
    ["Orphaned indexable routes", summary.orphanIndexableCount],
    ["Routes linked only from HTML sitemap", summary.weakOnlyViaSitemapCount],
    ["Dead-end routes", summary.deadEndCount],
    ["Noncanonical edges", summary.noncanonicalEdgeCount],
    ["Printable records", summary.printableCount],
    ["Pagination routes", summary.paginationRouteCount],
    ["Maximum click depth", summary.clickDepth.maximum],
    ["Runtime (ms)", summary.runtimeMs],
    ["Approximate peak heap (bytes)", summary.approximatePeakHeapBytes],
    ["Passed", summary.passed],
  ];

  return `# Static internal-link graph summary\n\n` +
    `Policy: \`${result.policy}\`\n\n` +
    `| Metric | Result |\n| --- | ---: |\n${rows.map(([label, value]) => `| ${label} | ${value} |`).join("\n")}\n\n` +
    `## Route families\n\n${Object.entries(result.routeFamilies).map(([family, count]) => `- ${family}: ${count}`).join("\n")}\n\n` +
    `## Deepest routes\n\n${result.maximumDepthRoutes.map((route) => `- \`${route}\``).join("\n")}\n\n` +
    `## Findings\n\n${result.findings.length ? result.findings.map((entry) => `- \`${entry.type}\` on \`${entry.source}\``).join("\n") : "No graph defects found."}\n`;
}
