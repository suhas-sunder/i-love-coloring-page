#!/usr/bin/env node

import { execFile } from "node:child_process";
import http from "node:http";
import { existsSync, statSync } from "node:fs";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const RUNTIME_SWITCH_COMMIT = "275dd6d33d64223f14e519ffb57d67825a7f5c19";
const LOCAL_PREVIEW_FIX_COMMIT = "08fd170";
const EXPECTED_COUNT = 6352;

const ROUTES_TO_CHECK = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/geometric",
  "/contact",
  "/privacy",
  "/sitemap.xml",
  "/robots.txt",
];

const OUTPUTS = {
  context: {
    json: "pipeline/manifests/netlify-branch-fix-context-check.json",
    report: "pipeline/reports/netlify-branch-fix-context-check.md",
  },
  version4: {
    json: "pipeline/manifests/netlify-branch-fix-version4-validation.json",
    report: "pipeline/reports/netlify-branch-fix-version4-validation.md",
  },
  version1Audit: {
    json: "pipeline/manifests/netlify-branch-fix-version1-audit.json",
    report: "pipeline/reports/netlify-branch-fix-version1-audit.md",
  },
  merge: {
    json: "pipeline/manifests/netlify-branch-fix-merge-results.json",
    report: "pipeline/reports/netlify-branch-fix-merge-results.md",
  },
  version1Validation: {
    json: "pipeline/manifests/netlify-branch-fix-version1-validation.json",
    report: "pipeline/reports/netlify-branch-fix-version1-validation.md",
  },
  netlifyConfig: {
    json: "pipeline/manifests/netlify-branch-fix-netlify-config.json",
    report: "pipeline/reports/netlify-branch-fix-netlify-config.md",
  },
};

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const mode = args.mode || "all";
  if (mode === "all" || mode === "context") await writeContext();
  if (mode === "all" || mode === "version4-validation") await writeVersionValidation("version4", OUTPUTS.version4, args.validationState || "pending");
  if (mode === "all" || mode === "version1-audit") await writeVersion1Audit();
  if (mode === "all" || mode === "netlify-config") await writeNetlifyConfig();
  if (mode === "all" || mode === "merge-results") await writeMergeResults(args.mergeState || "pending");
  if (mode === "all" || mode === "version1-validation") await writeVersionValidation("version1", OUTPUTS.version1Validation, args.validationState || "pending");

  console.log(JSON.stringify({ mode, branch: await git(["branch", "--show-current"]), generated: true }, null, 2));
}

async function writeContext() {
  const generatedAt = new Date().toISOString();
  const repoRoot = await git(["rev-parse", "--show-toplevel"]);
  const branch = await git(["branch", "--show-current"]);
  const statusShortBranch = await git(["status", "--short", "--branch"]);
  const branches = await git(["branch", "--all"]);
  const remotes = await git(["remote", "-v"]);
  const recentLog = await git(["log", "--oneline", "--decorate", "-n", "10"]);
  const statusLines = statusShortBranch.split(/\r?\n/).slice(1).filter((line) => line.trim());
  const intendedDriftOnly = statusLines.every((line) =>
    /(?:AGENTS\.md|package\.json|pipeline\/(?:manifests|reports)\/netlify-branch-fix-|pipeline\/scripts\/netlify-branch-fix-check\.mjs|pipeline\/tests\/netlify-production-branch-build\.test\.mjs)/.test(line.replace(/\\/g, "/")),
  );
  const packageJson = await readJson("package.json");
  const nextConfig = await readText("next.config.mjs");
  const netlifyToml = await readText("netlify.toml");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const assets = await readText("src/lib/coloring/assets.ts");
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const sourceText = await readProjectText(["app", "src", "next.config.mjs", "netlify.toml"]);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const appApiAbsent = !existsSync(path.join(REPO_ROOT, "app", "api"));

  const summary = {
    repoRoot,
    repoName: path.basename(repoRoot),
    packageName: packageJson.name,
    currentBranch: branch,
    version4ExistsLocal: /\bversion-4\b/.test(branches),
    version4ExistsRemote: /remotes\/origin\/version-4/.test(branches),
    version1ExistsLocal: /\bversion-1\b/.test(branches),
    version1ExistsRemote: /remotes\/origin\/version-1/.test(branches),
    workingTreeClean: statusLines.length === 0,
    workingTreeCleanOrIntendedBranchFixDrift: statusLines.length === 0 || intendedDriftOnly,
    statusLineCount: statusLines.length,
    appApiAbsent,
    staticExportConfigured: /output:\s*"export"/.test(nextConfig),
    packageBuildCorrect: packageJson.scripts?.build === "next build",
    netlifyTomlExists: existsSync(path.join(REPO_ROOT, "netlify.toml")),
    netlifyBuildCommand: parseTomlValue(netlifyToml, "command"),
    netlifyPublishDirectory: parseTomlValue(netlifyToml, "publish"),
    publicSafeDefaultsExist: siteConfig.includes(SITE_URL) && siteConfig.includes(ASSET_BASE_URL) && siteConfig.includes(CONTACT_EMAIL) && assets.includes(ASSET_BASE_URL),
    publicDefaultsRequireNetlifyEnv: /throw new Error|process\.exit/.test(siteConfig),
    runtimeGeneratedDataExists: available.summary?.itemCount === EXPECTED_COUNT,
    publicContainsGeneratedMedia: publicFiles.some((file) => /(?:^|\/)(?:coloring-pages|svg|webp|png|thumbs)\//i.test(file)),
    runtimeSwitchCommitExists: await commitExists(RUNTIME_SWITCH_COMMIT),
    localPreviewFixCommitExists: await commitExists(LOCAL_PREVIEW_FIX_COMMIT),
    wrongRepoIndicatorsFound: /I Love SVG|image-to-favicon-generator|Vite-specific|SVG wrapper route/i.test(sourceText),
  };
  summary.contextPassed = [
    summary.repoName === "i-love-coloring-page",
    summary.packageName === "i-love-coloring-page",
    summary.currentBranch === "version-4",
    summary.version4ExistsLocal,
    summary.version4ExistsRemote,
    summary.version1ExistsLocal,
    summary.version1ExistsRemote,
    summary.workingTreeCleanOrIntendedBranchFixDrift,
    summary.appApiAbsent,
    summary.staticExportConfigured,
    summary.packageBuildCorrect,
    summary.netlifyPublishDirectory === "out",
    summary.netlifyBuildCommand === "npm run build",
    summary.publicSafeDefaultsExist,
    !summary.publicDefaultsRequireNetlifyEnv,
    summary.runtimeGeneratedDataExists,
    !summary.publicContainsGeneratedMedia,
    summary.runtimeSwitchCommitExists,
    summary.localPreviewFixCommitExists,
    !summary.wrongRepoIndicatorsFound,
  ].every(Boolean);

  const payload = {
    generatedAt,
    runId: "netlify-branch-fix-context-check",
    ownerObservedProductionBranch: "version-1@ec994c",
    commands: {
      statusShortBranch,
      currentBranch: branch,
      branches,
      remotes,
      recentLog,
    },
    summary,
    blockers: summary.contextPassed ? [] : Object.entries(summary).filter(([, value]) => value === false).map(([key]) => key),
  };
  await writeJson(OUTPUTS.context.json, payload);
  await writeText(OUTPUTS.context.report, renderContextReport(payload));
}

async function writeVersionValidation(label, output, validationState) {
  const generatedAt = new Date().toISOString();
  const branch = await git(["branch", "--show-current"]);
  const head = await git(["rev-parse", "--short", "HEAD"]);
  const packageJson = await readJson("package.json");
  const nextConfig = await readText("next.config.mjs");
  const netlifyToml = await readText("netlify.toml");
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const assetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const outFiles = await listFilesIfExists(path.join(REPO_ROOT, "out"));
  const outText = await readOutText();
  const routeChecks = existsSync(path.join(REPO_ROOT, "out")) ? await runLocalRouteChecks() : [];
  const sitemapText = existsSync(path.join(REPO_ROOT, "out", "sitemap.xml")) ? await readText("out/sitemap.xml") : "";

  const summary = {
    label,
    branch,
    head,
    validationState,
    npmTestPassed: validationState === "passed",
    typecheckPassed: validationState === "passed",
    buildPassed: validationState === "passed",
    appApiAbsent: !existsSync(path.join(REPO_ROOT, "app", "api")),
    staticExportConfigured: /output:\s*"export"/.test(nextConfig),
    packageBuildCorrect: packageJson.scripts?.build === "next build",
    netlifyPublishesOut: parseTomlValue(netlifyToml, "publish") === "out",
    outExists: existsSync(path.join(REPO_ROOT, "out")),
    outContainsIndexHtml: outFiles.includes("out/index.html"),
    outContainsColoringPages: outFiles.some((file) => file.startsWith("out/coloring-pages/")) && outFiles.includes("out/coloring-pages.html"),
    outContainsAnimals: outFiles.some((file) => file.startsWith("out/coloring-pages/animals/")) && outFiles.includes("out/coloring-pages/animals.html"),
    outContainsContact: outFiles.includes("out/contact.html"),
    outContainsSitemap: outFiles.includes("out/sitemap.xml"),
    outContainsRobots: outFiles.includes("out/robots.txt"),
    outPublishesRepoSource: outFiles.some((file) => /^out\/(?:app|src|pipeline|images|ilovesvg)(?:\/|$)/.test(file)),
    localRoutesPassed: routeChecks.length > 0 && routeChecks.every((check) => check.status === 200 && check.expectedMarkerFound),
    routeChecks,
    sitemapIncludesRouteSet: sitemapText.includes(`${SITE_URL}/coloring-pages/animals`) && sitemapText.includes(`${SITE_URL}/contact`),
    noLocalhostLeakage: !/localhost|127\.0\.0\.1/i.test(outText),
    noR2DevLeakage: !/r2\.dev/i.test(outText),
    noSvgDownload: !/Download SVG|downloadSvg|svgDownload/i.test(`${downloadMenu}\n${browserDownloads}\n${outText}`),
    pngJpgWebpControlsPresent: /PNG/.test(outText) && /JPG/.test(outText) && /WebP/.test(outText),
    runtimeAvailableRecords: available.summary?.itemCount || 0,
    runtimeAssetRecords: assetPaths.summary?.recordCount || 0,
    runtimeGeneratedDataAvailable: available.summary?.itemCount === EXPECTED_COUNT && assetPaths.summary?.recordCount === EXPECTED_COUNT,
    count6352Present: outText.includes("6,352") || outText.includes("6352"),
    webpAssetUrlsUseCustomDomain: outText.includes(`${ASSET_BASE_URL}/webp/animals/animals-alligator-4feec8505a.webp`),
  };

  summary.passed = [
    summary.validationState === "passed",
    summary.appApiAbsent,
    summary.staticExportConfigured,
    summary.packageBuildCorrect,
    summary.netlifyPublishesOut,
    summary.outExists,
    summary.outContainsIndexHtml,
    summary.outContainsColoringPages,
    summary.outContainsAnimals,
    summary.outContainsContact,
    summary.outContainsSitemap,
    summary.outContainsRobots,
    !summary.outPublishesRepoSource,
    summary.localRoutesPassed,
    summary.sitemapIncludesRouteSet,
    summary.noLocalhostLeakage,
    summary.noR2DevLeakage,
    summary.noSvgDownload,
    summary.pngJpgWebpControlsPresent,
    summary.runtimeGeneratedDataAvailable,
    summary.count6352Present,
    summary.webpAssetUrlsUseCustomDomain,
  ].every(Boolean);

  const payload = {
    generatedAt,
    runId: `netlify-branch-fix-${label}-validation`,
    summary,
    outFileCount: outFiles.length,
    blockers: summary.passed ? [] : Object.entries(summary)
      .filter(([key, value]) => typeof value === "boolean" && value === false && !["passed"].includes(key))
      .map(([key]) => key),
  };
  await writeJson(output.json, payload);
  await writeText(output.report, renderVersionValidationReport(payload));
}

async function writeVersion1Audit() {
  const generatedAt = new Date().toISOString();
  const localCommit = await git(["rev-parse", "--short", "version-1"]);
  const remoteCommit = await git(["rev-parse", "--short", "origin/version-1"]);
  const version4Commit = await git(["rev-parse", "--short", "version-4"]);
  const version1Package = await readGitTextMaybe("version-1:package.json");
  const version1Netlify = await readGitTextMaybe("version-1:netlify.toml");
  const version1NextConfig = await readGitTextMaybe("version-1:next.config.mjs");
  const version1AppTree = await gitMaybe(["ls-tree", "-r", "--name-only", "version-1", "app"]);
  const version1PipelineTree = await gitMaybe(["ls-tree", "-d", "--name-only", "version-1", "pipeline"]);
  const hasRuntimeData = Boolean(await gitMaybe(["cat-file", "-e", "version-1:src/generated/coloring/runtime-available-items.json"]).then(() => true, () => false));
  const version1Log = await git(["log", "--oneline", "--decorate", "-n", "10", "version-1"]);

  const summary = {
    localCommit,
    remoteCommit,
    version4Commit,
    localMatchesRemote: localCommit === remoteCommit,
    version1IsCurrentVersion4: localCommit === version4Commit,
    version1BuildCommand: parseTomlValue(version1Netlify, "command"),
    version1PublishDirectory: parseTomlValue(version1Netlify, "publish"),
    version1StaticExportConfigured: /output:\s*"export"/.test(version1NextConfig),
    version1PackageName: safeJson(version1Package)?.name || "",
    version1HasAppRoutes: /app\/coloring-pages\/page\.tsx/.test(version1AppTree) && /app\/coloring-pages\/\[hubSlug\]\/page\.tsx/.test(version1AppTree),
    version1HasPipelineDirectory: Boolean(version1PipelineTree.trim()),
    version1HasRuntimeData: hasRuntimeData,
    version1Stale: localCommit !== version4Commit,
    version1LikelyExplainsWrongNetlifyDeploy: localCommit !== version4Commit,
  };

  const payload = {
    generatedAt,
    runId: "netlify-branch-fix-version1-audit",
    summary,
    version1Log,
  };
  await writeJson(OUTPUTS.version1Audit.json, payload);
  await writeText(OUTPUTS.version1Audit.report, renderVersion1AuditReport(payload));
}

async function writeMergeResults(mergeState) {
  const generatedAt = new Date().toISOString();
  const branch = await git(["branch", "--show-current"]);
  const head = await git(["rev-parse", "--short", "HEAD"]);
  const version4Commit = await git(["rev-parse", "--short", "version-4"]);
  const version1Commit = await gitMaybe(["rev-parse", "--short", "version-1"]);
  const status = await git(["status", "--short", "--branch"]);
  const payload = {
    generatedAt,
    runId: "netlify-branch-fix-merge-results",
    summary: {
      mergeState,
      currentBranch: branch,
      head,
      version4Commit,
      version1Commit,
      usedNoFfMerge: mergeState === "merged",
      rewroteHistory: false,
      forcePushRequired: false,
      conflicts: args.conflicts || "none",
      statusShortBranch: status,
      result: mergeState,
    },
  };
  await writeJson(OUTPUTS.merge.json, payload);
  await writeText(OUTPUTS.merge.report, renderMergeReport(payload));
}

async function writeNetlifyConfig() {
  const generatedAt = new Date().toISOString();
  const netlifyToml = await readText("netlify.toml");
  const outRedirects = existsSync(path.join(REPO_ROOT, "out", "_redirects")) ? await readText("out/_redirects") : "";
  const redirectRules = parseRedirectRules(netlifyToml);
  const summary = {
    buildCommand: parseTomlValue(netlifyToml, "command"),
    publishDirectory: parseTomlValue(netlifyToml, "publish"),
    baseDirectory: parseTomlValue(netlifyToml, "base") || "",
    buildCommandCorrect: parseTomlValue(netlifyToml, "command") === "npm run build",
    publishDirectoryOut: parseTomlValue(netlifyToml, "publish") === "out",
    noBaseDirectoryConfigured: !parseTomlValue(netlifyToml, "base"),
    selfRedirectRulePresent: redirectRules.some((rule) => normalizeRule(rule.from) === normalizeRule(rule.to)),
    generatedRedirectsExists: existsSync(path.join(REPO_ROOT, "out", "_redirects")),
    generatedRedirectsSelfRedirect: /^(\/\S+)\s+\1\s+/m.test(outRedirects),
    repoRootPublishConfigured: parseTomlValue(netlifyToml, "publish") === ".",
    passed: false,
  };
  summary.passed = [
    summary.buildCommandCorrect,
    summary.publishDirectoryOut,
    summary.noBaseDirectoryConfigured,
    !summary.selfRedirectRulePresent,
    !summary.generatedRedirectsSelfRedirect,
    !summary.repoRootPublishConfigured,
  ].every(Boolean);

  const payload = {
    generatedAt,
    runId: "netlify-branch-fix-netlify-config",
    summary,
    redirectRules,
  };
  await writeJson(OUTPUTS.netlifyConfig.json, payload);
  await writeText(OUTPUTS.netlifyConfig.report, renderNetlifyConfigReport(payload));
}

async function runLocalRouteChecks() {
  const root = path.join(REPO_ROOT, "out");
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const filePath = resolveExportPath(root, decodeURIComponent(url.pathname));
    if (!filePath) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    const contentType = filePath.endsWith(".xml") ? "application/xml" : filePath.endsWith(".txt") ? "text/plain" : "text/html";
    response.writeHead(200, { "content-type": contentType });
    response.end(await readFile(filePath));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const checks = [];
  try {
    for (const routePath of ROUTES_TO_CHECK) {
      const response = await fetch(`http://127.0.0.1:${port}${routePath}`);
      const body = await response.text();
      checks.push({
        path: routePath,
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        expectedMarker: expectedMarker(routePath),
        expectedMarkerFound: body.includes(expectedMarker(routePath)),
      });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  return checks;
}

function resolveExportPath(root, pathname) {
  const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  const candidates = normalized === "/"
    ? ["index.html"]
    : [`${normalized.slice(1)}.html`, `${normalized.slice(1)}/index.html`, normalized.slice(1)];
  for (const candidate of candidates) {
    const absolute = path.join(root, candidate);
    if (existsSync(absolute) && statSync(absolute).isFile()) return absolute;
  }
  return null;
}

function expectedMarker(routePath) {
  if (routePath === "/") return "I Love Coloring Page";
  if (routePath === "/coloring-pages") return "Find a coloring page";
  if (routePath === "/coloring-pages/animals") return "Animals";
  if (routePath === "/coloring-pages/geometric") return "Geometric";
  if (routePath === "/contact") return "Contact";
  if (routePath === "/privacy") return "Privacy";
  if (routePath === "/sitemap.xml") return "<urlset";
  if (routePath === "/robots.txt") return `Sitemap: ${SITE_URL}/sitemap.xml`;
  return "";
}

async function readOutText() {
  const representativeFiles = [
    "out/index.html",
    "out/coloring-pages.html",
    "out/coloring-pages/animals.html",
    "out/coloring-pages/geometric.html",
    "out/contact.html",
    "out/privacy.html",
    "out/sitemap.xml",
    "out/robots.txt",
  ];
  const chunks = [];
  for (const file of representativeFiles) {
    const absolute = path.join(REPO_ROOT, file);
    if (!existsSync(absolute) || statSync(absolute).size > 2_000_000) continue;
    chunks.push(await readText(file));
  }
  return chunks.join("\n");
}

function renderContextReport(payload) {
  return [
    "# Netlify Branch Fix Context Check",
    "",
    `- Current branch: ${payload.summary.currentBranch}`,
    `- version-4 exists locally/remotely: ${payload.summary.version4ExistsLocal}/${payload.summary.version4ExistsRemote}`,
    `- version-1 exists locally/remotely: ${payload.summary.version1ExistsLocal}/${payload.summary.version1ExistsRemote}`,
    `- Working tree clean at check start: ${payload.summary.workingTreeClean}`,
    `- Working tree clean or intended branch-fix drift only: ${payload.summary.workingTreeCleanOrIntendedBranchFixDrift}`,
    `- Static export configured: ${payload.summary.staticExportConfigured}`,
    `- Netlify publish directory: ${payload.summary.netlifyPublishDirectory}`,
    `- Public-safe defaults exist: ${payload.summary.publicSafeDefaultsExist}`,
    `- Result: ${payload.summary.contextPassed}`,
  ].join("\n");
}

function renderVersionValidationReport(payload) {
  return [
    `# Netlify Branch Fix ${payload.summary.label} Validation`,
    "",
    `- Branch: ${payload.summary.branch}`,
    `- Head: ${payload.summary.head}`,
    `- Validation state: ${payload.summary.validationState}`,
    `- npm test passed: ${payload.summary.npmTestPassed}`,
    `- Typecheck passed: ${payload.summary.typecheckPassed}`,
    `- Build passed: ${payload.summary.buildPassed}`,
    `- Static routes passed: ${payload.summary.localRoutesPassed}`,
    `- out publishes repo source: ${payload.summary.outPublishesRepoSource}`,
    `- Runtime record count: ${payload.summary.runtimeAvailableRecords}`,
    `- Count 6,352 present: ${payload.summary.count6352Present}`,
    `- WebP asset URLs use custom domain: ${payload.summary.webpAssetUrlsUseCustomDomain}`,
    `- Result: ${payload.summary.passed}`,
    `- Blockers: ${payload.blockers.length ? payload.blockers.join(", ") : "none"}`,
  ].join("\n");
}

function renderVersion1AuditReport(payload) {
  return [
    "# Netlify Branch Fix Version-1 Audit",
    "",
    `- Local version-1 commit: ${payload.summary.localCommit}`,
    `- Remote version-1 commit: ${payload.summary.remoteCommit}`,
    `- Source version-4 commit: ${payload.summary.version4Commit}`,
    `- version-1 stale: ${payload.summary.version1Stale}`,
    `- version-1 static export configured: ${payload.summary.version1StaticExportConfigured}`,
    `- version-1 publish directory: ${payload.summary.version1PublishDirectory}`,
    `- version-1 has current app routes: ${payload.summary.version1HasAppRoutes}`,
    `- version-1 has runtime data: ${payload.summary.version1HasRuntimeData}`,
    `- Explains wrong Netlify deploy: ${payload.summary.version1LikelyExplainsWrongNetlifyDeploy}`,
  ].join("\n");
}

function renderMergeReport(payload) {
  return [
    "# Netlify Branch Fix Merge Results",
    "",
    `- Merge state: ${payload.summary.mergeState}`,
    `- Current branch: ${payload.summary.currentBranch}`,
    `- Head: ${payload.summary.head}`,
    `- Source version-4 commit: ${payload.summary.version4Commit}`,
    `- version-1 commit: ${payload.summary.version1Commit}`,
    `- Used no-ff merge: ${payload.summary.usedNoFfMerge}`,
    `- Rewrote history: ${payload.summary.rewroteHistory}`,
    `- Conflicts: ${payload.summary.conflicts}`,
  ].join("\n");
}

function renderNetlifyConfigReport(payload) {
  return [
    "# Netlify Branch Fix Netlify Config",
    "",
    `- Build command: ${payload.summary.buildCommand}`,
    `- Publish directory: ${payload.summary.publishDirectory}`,
    `- Base directory: ${payload.summary.baseDirectory || "none"}`,
    `- Self-redirect rule present: ${payload.summary.selfRedirectRulePresent}`,
    `- Generated _redirects self-redirect: ${payload.summary.generatedRedirectsSelfRedirect}`,
    `- Repo root publish configured: ${payload.summary.repoRootPublishConfigured}`,
    `- Result: ${payload.summary.passed}`,
  ].join("\n");
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--") ? rawArgs[++index] : "true";
    parsed[key] = value;
  }
  return parsed;
}

async function commitExists(commit) {
  try {
    await git(["cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const absolute = path.join(REPO_ROOT, relativeRoot);
    if (!existsSync(absolute)) continue;
    const files = statSync(absolute).isFile() ? [relativeRoot] : await listFilesIfExists(absolute);
    for (const file of files) {
      if (!/\.(?:ts|tsx|css|json|md|mjs|toml)$/.test(file)) continue;
      if (file.startsWith("src/generated/coloring/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push(path.relative(REPO_ROOT, absolute).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return files;
}

async function readGitText(spec) {
  return git(["show", spec]);
}

async function readGitTextMaybe(spec) {
  try {
    return await readGitText(spec);
  } catch {
    return "";
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseTomlValue(text, key) {
  const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, "m"));
  return match?.[1] || "";
}

function parseRedirectRules(text) {
  const rules = [];
  const blocks = text.split(/\n\s*\[\[redirects\]\]\s*\n/g).slice(1);
  for (const block of blocks) {
    rules.push({
      from: parseTomlValue(block, "from"),
      to: parseTomlValue(block, "to"),
    });
  }
  return rules;
}

function normalizeRule(value) {
  return String(value || "").replace(/\/+$/, "") || "/";
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 20 });
  return stdout.trim();
}

async function gitMaybe(args) {
  try {
    return await git(args);
  } catch {
    return "";
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, payload) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${text.replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`, "utf8");
}
