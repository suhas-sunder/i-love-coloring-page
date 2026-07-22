#!/usr/bin/env node

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EM_DASH = String.fromCodePoint(0x2014);
const MOJIBAKE_EM_DASH = String.fromCodePoint(0x00e2, 0x20ac, 0x201d);
const SOURCE_ROOTS = ["app", "src", "pipeline/lib", "pipeline/scripts", "pipeline/manifests", "public"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".html", ".xml", ".md", ".csv", ".css"]);
const OUTPUT_EXTENSIONS = new Set([".html", ".xml"]);
const EXCLUDED_DIRECTORY_NAMES = new Set(["node_modules", ".next", ".git", "review", "historical", "images", "ilovesvg"]);

const phase = readPhase(process.argv.slice(2));
const findings = [
  ...(await scanRoots(SOURCE_ROOTS, "first-party-source", SOURCE_EXTENSIONS)),
  ...(await scanRoots(["out"], "generated-public-output", OUTPUT_EXTENSIONS)),
];
await writeReports(phase, findings);
const summary = summarize(findings);
process.stdout.write(`${JSON.stringify(summary)}\n`);
if (phase === "after" && findings.length) process.exitCode = 1;

async function scanRoots(roots, scope, extensions) {
  const files = [];
  for (const root of roots) await collectFiles(path.join(ROOT, root), extensions, files);
  const findings = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    findings.push(...findPunctuation(raw, relative(file), scope));
    if (scope === "generated-public-output") {
      const decoded = decodeHtml(raw);
      if (decoded !== raw) findings.push(...findPunctuation(decoded, relative(file), scope, "decoded-html"));
    }
  }
  return deduplicate(findings);
}

async function collectFiles(directory, extensions, files) {
  if (!existsSync(directory)) return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORY_NAMES.has(entry.name)) await collectFiles(path.join(directory, entry.name), extensions, files);
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }
}

function findPunctuation(text, file, scope, representation = "raw") {
  const patterns = [
    ["unicode", EM_DASH],
    ["misencoded", MOJIBAKE_EM_DASH],
    ["html-entity", "&" + "mdash;"],
    ["html-entity", "&" + "#" + "8212;"],
    ["html-entity", "&" + "#" + "x" + "2014;"],
    ["javascript-escape", "\\" + "u" + "2014"],
    ["javascript-escape", "\\" + "u" + "{2014}"],
  ];
  const lower = text.toLowerCase();
  const findings = [];
  for (const [kind, needle] of patterns) {
    const haystack = kind === "html-entity" ? lower : text;
    const target = kind === "html-entity" ? needle.toLowerCase() : needle;
    let index = haystack.indexOf(target);
    while (index >= 0) {
      const { line, column } = lineAndColumn(text, index);
      findings.push({ scope, path: file, route: routeFor(file), field: fieldFor(text, index), representation, kind, line, column, nearbyText: compact(text.slice(Math.max(0, index - 60), index + target.length + 60)) });
      index = haystack.indexOf(target, index + target.length);
    }
  }
  return findings;
}

function decodeHtml(value) {
  return value
    .replace(new RegExp("&" + "mdash;", "gi"), EM_DASH)
    .replace(new RegExp("&" + "#" + "8212;", "gi"), EM_DASH)
    .replace(new RegExp("&" + "#" + "x" + "2014;", "gi"), EM_DASH);
}

function fieldFor(text, index) {
  const preceding = text.slice(0, index);
  const match = preceding.match(/"([^"\\]{1,80})"\s*:\s*[^\n]*$/);
  return match?.[1] || "text";
}

function routeFor(file) {
  if (file.startsWith("out/")) {
    const route = file.slice(3).replace(/\\/g, "/").replace(/(?:index)?\.html$/, "").replace(/\.xml$/, "");
    return route ? `/${route.replace(/\/$/, "")}` : "/";
  }
  return "";
}

function lineAndColumn(text, index) {
  const prefix = text.slice(0, index);
  return { line: prefix.split("\n").length, column: index - prefix.lastIndexOf("\n") };
}

function compact(value) { return value.replace(/\s+/g, " ").trim().slice(0, 180); }
function relative(file) { return path.relative(ROOT, file).replace(/\\/g, "/"); }
function csv(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function deduplicate(rows) { const seen = new Set(); return rows.filter((row) => { const key = `${row.scope}|${row.path}|${row.kind}|${row.line}|${row.column}|${row.representation}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function summarize(rows) { return { findingCount: rows.length, sourceFindingCount: rows.filter((row) => row.scope === "first-party-source").length, outputFindingCount: rows.filter((row) => row.scope === "generated-public-output").length, representations: Object.fromEntries(Object.entries(rows.reduce((map, row) => ({ ...map, [row.kind]: (map[row.kind] || 0) + 1 }), {})).sort()) }; }
function readPhase(args) { if (args.length === 2 && args[0] === "--phase" && ["before", "after"].includes(args[1])) return args[1]; throw new Error("Usage: node pipeline/scripts/audit-public-punctuation.mjs --phase before|after"); }

async function writeReports(currentPhase, rows) {
  const output = `reports/punctuation-occurrences-${currentPhase}.csv`;
  const header = ["scope", "path", "route", "field", "representation", "kind", "line", "column", "nearby_text"];
  await writeText(output, [header, ...rows.map((row) => [row.scope, row.path, row.route, row.field, row.representation, row.kind, row.line, row.column, row.nearbyText])].map((row) => row.map(csv).join(",")).join("\n") + "\n");
  if (currentPhase === "after") {
    const beforeRows = await readCsvCount("reports/punctuation-occurrences-before.csv");
    const summary = summarize(rows);
    await writeText("reports/punctuation-audit.md", `# Public punctuation audit\n\nThis safeguard scans first-party public-content sources and every textual exported public file. It detects the Unicode character, common misencoding, HTML entities before and after decoding, and serialized JavaScript escape forms. Third-party dependencies, build caches, binaries, and local review artifacts are excluded.\n\n| Phase | Source findings | Export findings | Total |\n| --- | ---: | ---: | ---: |\n| Before correction | ${beforeRows.source} | ${beforeRows.output} | ${beforeRows.total} |\n| After correction | ${summary.sourceFindingCount} | ${summary.outputFindingCount} | ${summary.findingCount} |\n\nThe after count must be zero. The command fails when it is not.\n\n- Regenerate source/output report: \`npm run audit:punctuation\`\n- Enforce after-build result: \`npm run validate:punctuation\`\n`);
  }
}

async function readCsvCount(file) {
  if (!existsSync(path.join(ROOT, file))) return { source: 0, output: 0, total: 0 };
  const rows = (await readFile(path.join(ROOT, file), "utf8")).trim().split("\n").slice(1);
  return { source: rows.filter((row) => row.startsWith("first-party-source,")).length, output: rows.filter((row) => row.startsWith("generated-public-output,")).length, total: rows.length };
}

async function writeText(relativePath, value) {
  const target = path.join(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const retryableCodes = new Set(["UNKNOWN", "EBUSY", "EPERM", "EACCES"]);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await writeFile(target, value, "utf8");
      return;
    } catch (error) {
      if (!retryableCodes.has(error?.code) || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
}
