#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const QUALITY_PATH = "src/generated/coloring/hub-content-quality.json";
const SEO_PATH = "src/generated/coloring/hub-seo-content.json";
const MANIFEST_PATH = "pipeline/manifests/content-quality-score-results.json";
const REPORT_PATH = "pipeline/reports/content-quality-score-report.md";

const FILLER_PHRASES = [
  "perfect for everyone",
  "fun for all ages",
  "endless fun",
  "best coloring pages",
  "amazing collection",
  "runtime examples",
  "actual runtime pages",
];
const UNSUPPORTED_CLAIMS = [
  /Download SVG|SVG download|download an SVG/i,
  /online coloring|color online/i,
  /commercial use|royalty-free|license included|use commercially/i,
  /guaranteed approval|AdSense approval guaranteed/i,
  /review rating|five-star|aggregate rating/i,
];
const STYLE_ISSUES = [
  /\btriceratop\b/i,
  /\btyrannosauru\b/i,
  /\bplushy\b/i,
  /\bchristma\b/i,
  /\bruntime\b/i,
  /\.(?:png|jpe?g|webp|svg)\b/i,
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const qualityData = await readJson(QUALITY_PATH);
  const hubSeoContent = await readJson(SEO_PATH);
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const hubPageContent = await readText("src/components/coloring/HubPageContent.tsx");
  const seoContentSection = await readText("src/components/coloring/SeoContentSection.tsx");

  const duplicateIntros = findDuplicateValues(qualityData.hubs.map((hub) => hub.content.shortIntro));
  const nearDuplicateFrames = findDuplicateValues(
    qualityData.hubs.map((hub) =>
      normalizeText(hub.content.shortIntro)
        .replace(/\d[\d,]*/g, "{count}")
        .replace(normalizeText(hub.title), "{hub}")
        .replace(/\bincluding [^.]+?\./g, "including {examples}."),
    ),
  ).filter((entry) => entry.count >= 8);

  const routeSet = new Set(runtimeHubs.hubs.map((hub) => hub.route));
  const scoredHubs = qualityData.hubs.map((hub) => scoreHub(hub, routeSet));
  const highRiskHubs = scoredHubs.filter((hub) => hub.blockers.length > 0);
  const warnings = scoredHubs.filter((hub) => hub.warnings.length > 0);
  const galleryFirstPlacement = sourceOrder(hubPageContent, "GallerySearch", "SeoContentSection");
  const seoContentRendersBelowGallery = /SeoContentSection/.test(hubPageContent) && /seo-content-section/.test(seoContentSection);
  const sourceText = await readProjectText(["app", "src/components", "src/lib", "src/generated/coloring"]);
  const appApiAbsent = !fs.existsSync(path.join(REPO_ROOT, "app", "api"));
  const staticExportConfigured = /output:\s*["']export["']/.test(await readText("next.config.mjs"));
  const liveAdsenseAbsent = !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client|data-ad-client/i.test(sourceText);
  const svgDownloadAbsent = !/Download SVG|downloadSvg\b|svgDownload/i.test(sourceText);

  const summary = {
    hubsChecked: qualityData.hubs.length,
    hubSeoRecords: hubSeoContent.hubs.length,
    allRuntimeHubsHaveContent: qualityData.hubs.length === runtimeHubs.hubs.length,
    duplicateIntroCount: duplicateIntros.length,
    nearDuplicateFrameCount: nearDuplicateFrames.length,
    highRiskHubCount: highRiskHubs.length,
    warningHubCount: warnings.length,
    unsupportedClaimCount: scoredHubs.reduce((sum, hub) => sum + hub.unsupportedClaims.length, 0),
    fillerPhraseCount: scoredHubs.reduce((sum, hub) => sum + hub.fillerPhrases.length, 0),
    styleIssueCount: scoredHubs.reduce((sum, hub) => sum + hub.styleIssues.length, 0),
    keywordStuffingRiskCount: scoredHubs.filter((hub) => hub.keywordStuffingRisk).length,
    galleryFirstPlacement,
    seoContentRendersBelowGallery,
    appApiAbsent,
    staticExportConfigured,
    liveAdsenseAbsent,
    svgDownloadAbsent,
  };
  summary.uniquenessPassed = summary.duplicateIntroCount === 0 && summary.nearDuplicateFrameCount === 0;
  summary.boilerplateRiskPassed = summary.fillerPhraseCount === 0 && summary.nearDuplicateFrameCount === 0;
  summary.helpfulnessPassed = highRiskHubs.length === 0 && scoredHubs.every((hub) => hub.score >= 80);
  summary.intentMatchPassed = scoredHubs.every((hub) => hub.intentMatch);
  summary.claimAccuracyPassed = summary.unsupportedClaimCount === 0 && summary.styleIssueCount === 0;
  summary.galleryFirstPassed = galleryFirstPlacement && seoContentRendersBelowGallery;
  summary.internalLinkQualityPassed = scoredHubs.every((hub) => hub.internalLinkQuality);
  summary.adsenseLowValueRiskPassed = summary.helpfulnessPassed && summary.boilerplateRiskPassed && summary.claimAccuracyPassed;
  summary.contentQualityPassed =
    summary.allRuntimeHubsHaveContent &&
    summary.uniquenessPassed &&
    summary.boilerplateRiskPassed &&
    summary.helpfulnessPassed &&
    summary.intentMatchPassed &&
    summary.claimAccuracyPassed &&
    summary.galleryFirstPassed &&
    summary.internalLinkQualityPassed &&
    summary.appApiAbsent &&
    summary.staticExportConfigured &&
    summary.liveAdsenseAbsent &&
    summary.svgDownloadAbsent;

  const payload = {
    generatedAt: new Date().toISOString(),
    runId: "content-quality-score",
    summary,
    duplicateIntros,
    nearDuplicateFrames,
    highRiskHubs,
    warnings: warnings.slice(0, 40),
    sampledScores: scoredHubs.slice(0, 20),
    blockers: buildBlockers(summary, highRiskHubs),
  };

  await writeJson(MANIFEST_PATH, payload);
  await writeText(REPORT_PATH, renderReport(payload));
  console.log(JSON.stringify(payload.summary, null, 2));
  if (!summary.contentQualityPassed) process.exitCode = 1;
}

function scoreHub(hub, routeSet) {
  const visible = visibleContent(hub);
  const words = visible.split(/\s+/).filter(Boolean);
  const unsupportedClaims = UNSUPPORTED_CLAIMS.filter((regex) => regex.test(visible)).map(String);
  const fillerPhrases = FILLER_PHRASES.filter((phrase) => visible.toLowerCase().includes(phrase));
  const styleIssues = STYLE_ISSUES.filter((regex) => regex.test(visible)).map(String);
  const sections = hub.content.belowGallerySections || [];
  const relatedLinks = hub.content.relatedHubLinks || [];
  const keywordStuffingRisk = hasKeywordStuffingRisk(visible, hub.title);
  const sectionBodiesUseful = sections.length >= 3 && sections.every((section) => wordCount(section.body) >= 18);
  const lengthInBounds = words.length >= 105 && words.length <= 360;
  const intentMatch = mentionsHubSubject(hub, visible);
  const internalLinkQuality =
    relatedLinks.length > 0 &&
    relatedLinks.every((link) => routeSet.has(link.href) && !/manual-review|backlog|rejected/.test(link.href));

  const blockers = [];
  if (unsupportedClaims.length) blockers.push("unsupported claim");
  if (fillerPhrases.length) blockers.push("generic filler phrase");
  if (styleIssues.length) blockers.push("style or internal wording issue");
  if (!sectionBodiesUseful) blockers.push("thin supporting sections");
  if (!lengthInBounds) blockers.push("content length out of bounds");
  if (keywordStuffingRisk) blockers.push("keyword stuffing risk");
  if (!intentMatch) blockers.push("weak intent match");
  if (!internalLinkQuality) blockers.push("internal link quality issue");

  const warnings = [];
  if (words.length < 130) warnings.push("short but still above minimum");
  if ((hub.representativeAssets || []).length < 4) warnings.push("few representative assets");

  let score = 100;
  score -= unsupportedClaims.length * 25;
  score -= fillerPhrases.length * 20;
  score -= styleIssues.length * 20;
  if (!sectionBodiesUseful) score -= 20;
  if (!lengthInBounds) score -= 15;
  if (keywordStuffingRisk) score -= 20;
  if (!intentMatch) score -= 15;
  if (!internalLinkQuality) score -= 10;

  return {
    slug: hub.slug,
    route: hub.route,
    type: hub.type,
    assetCount: hub.assetCount,
    wordCount: words.length,
    score,
    unsupportedClaims,
    fillerPhrases,
    styleIssues,
    keywordStuffingRisk,
    intentMatch,
    internalLinkQuality,
    blockers,
    warnings,
  };
}

function visibleContent(hub) {
  return [
    hub.content.guideTitle,
    hub.content.shortIntro,
    ...(hub.content.aboveGalleryValueBullets || []),
    ...(hub.content.belowGallerySections || []).flatMap((section) => [section.heading, section.body, ...(section.items || [])]),
    ...(hub.content.relatedHubLinks || []).map((link) => link.label),
  ].join(" ");
}

function mentionsHubSubject(hub, text) {
  if (hub.slug === "coloring-pages") return true;
  const visibleTokens = new Set(tokenize(text));
  const subjectTokens = tokenize(hub.slug).filter((token) => token.length >= 3);
  if (subjectTokens.length === 0) return true;
  return subjectTokens.some((token) => visibleTokens.has(token));
}

function hasKeywordStuffingRisk(text, title) {
  const normalized = normalizeText(text);
  const titleSubject = normalizeText(title.replace(/coloring pages$/i, ""));
  const titleCount = countOccurrences(normalized, titleSubject);
  const coloringPagesCount = countOccurrences(normalized, "coloring pages");
  return titleCount > 14 || coloringPagesCount > 24;
}

function wordCount(value) {
  return String(value).split(/\s+/).filter(Boolean).length;
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = text.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

function sourceOrder(text, firstNeedle, secondNeedle) {
  const first = text.indexOf(firstNeedle);
  const second = text.indexOf(secondNeedle);
  return first >= 0 && second >= 0 && first < second;
}

function buildBlockers(summary, highRiskHubs) {
  const blockers = [];
  if (!summary.allRuntimeHubsHaveContent) blockers.push("Not all runtime hubs have content records.");
  if (!summary.uniquenessPassed) blockers.push("Duplicate or near-duplicate hub intro content found.");
  if (!summary.boilerplateRiskPassed) blockers.push("Boilerplate or filler risk found.");
  if (!summary.claimAccuracyPassed) blockers.push("Unsupported claims or internal wording found.");
  if (!summary.galleryFirstPassed) blockers.push("Gallery-first source order failed.");
  if (!summary.internalLinkQualityPassed) blockers.push("Internal link quality failed.");
  if (!summary.appApiAbsent) blockers.push("app/api exists.");
  if (!summary.staticExportConfigured) blockers.push("Static export is not configured.");
  if (!summary.liveAdsenseAbsent) blockers.push("Live AdSense code found.");
  if (!summary.svgDownloadAbsent) blockers.push("Visible SVG download found.");
  for (const hub of highRiskHubs.slice(0, 10)) blockers.push(`${hub.slug}: ${hub.blockers.join(", ")}`);
  return blockers;
}

function renderReport(payload) {
  const rows = [
    ["Hubs checked", payload.summary.hubsChecked],
    ["All runtime hubs have content", payload.summary.allRuntimeHubsHaveContent],
    ["Duplicate intros", payload.summary.duplicateIntroCount],
    ["Near-duplicate intro frames", payload.summary.nearDuplicateFrameCount],
    ["Unsupported claims", payload.summary.unsupportedClaimCount],
    ["Filler phrases", payload.summary.fillerPhraseCount],
    ["Style/internal wording issues", payload.summary.styleIssueCount],
    ["Keyword stuffing risks", payload.summary.keywordStuffingRiskCount],
    ["Gallery-first placement", payload.summary.galleryFirstPassed],
    ["Content quality passed", payload.summary.contentQualityPassed],
  ];
  return `# Hub Content Quality Score

${renderTable(rows)}

## Blockers
${payload.blockers.length ? payload.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None."}

## Sample Scores
${payload.sampledScores.map((hub) => `- \`${hub.slug}\`: ${hub.score} (${hub.wordCount} words)`).join("\n")}
`;
}

function renderTable(rows) {
  return ["| Check | Result |", "| --- | --- |", ...rows.map(([key, value]) => `| ${key} | ${value} |`)].join("\n");
}

function normalizeText(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => singularize(token));
}

function singularize(token) {
  const irregular = { claus: "claus", christmas: "christmas", plushies: "plushie", roses: "rose", triceratops: "triceratops" };
  if (irregular[token]) return irregular[token];
  if (token.endsWith("saurus") || token.endsWith("docus") || token.endsWith("pus") || token.endsWith("ss")) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ses") && token.length > 4) return token.slice(0, -1);
  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function findDuplicateValues(values) {
  const map = new Map();
  for (const value of values) {
    const normalized = normalizeText(value);
    map.set(normalized, (map.get(normalized) || 0) + 1);
  }
  return [...map.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

async function readText(relativePath) {
  return fsp.readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const root of relativeRoots) {
    const absolute = path.join(REPO_ROOT, root);
    if (!fs.existsSync(absolute)) continue;
    const stat = await fsp.stat(absolute);
    if (stat.isFile()) {
      chunks.push(await readText(root));
      continue;
    }
    for (const file of await walkFiles(absolute)) {
      if (/\.(tsx?|jsx?|json|css|mjs|cjs|md|xml)$/.test(file)) chunks.push(await fsp.readFile(file, "utf8"));
    }
  }
  return chunks.join("\n");
}

async function walkFiles(root) {
  const results = [];
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "out"].includes(entry.name)) continue;
      results.push(...await walkFiles(absolute));
    } else {
      results.push(absolute);
    }
  }
  return results;
}

async function writeJson(relativePath, payload) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeText(relativePath, text) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, text.endsWith("\n") ? text : `${text}\n`);
}
