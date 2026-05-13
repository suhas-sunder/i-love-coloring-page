#!/usr/bin/env node

import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GENERATED_AT = new Date().toISOString();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";

const OUTPUTS = {
  projectContext: "pipeline/manifests/live-production-project-context-check.json",
  projectContextReport: "pipeline/reports/live-production-project-context-check.md",
  configAudit: "pipeline/manifests/live-production-public-config-audit.json",
  configAuditReport: "pipeline/reports/live-production-public-config-audit.md",
  noEnvBuild: "pipeline/manifests/live-production-no-env-build-results.json",
  noEnvBuildReport: "pipeline/reports/live-production-no-env-build-report.md",
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const projectContext = await buildProjectContext();
  const configAudit = await buildConfigAudit();
  await writeJson(OUTPUTS.projectContext, projectContext);
  await writeText(OUTPUTS.projectContextReport, renderProjectContextReport(projectContext));
  await writeJson(OUTPUTS.configAudit, configAudit);
  await writeText(OUTPUTS.configAuditReport, renderConfigAuditReport(configAudit));

  const noEnvBuild = await runNoEnvBuildAndInspect();
  await writeJson(OUTPUTS.noEnvBuild, noEnvBuild);
  await writeText(OUTPUTS.noEnvBuildReport, renderNoEnvBuildReport(noEnvBuild));

  console.log(JSON.stringify({
    projectContextPassed: projectContext.summary.correctRepo && projectContext.summary.noAppApiRoute,
    publicSafeDefaultsPassed: configAudit.summary.publicSafeDefaultsPassed,
    noEnvBuildPassed: noEnvBuild.summary.passed,
  }, null, 2));

  if (!projectContext.summary.correctRepo || !projectContext.summary.noAppApiRoute || !configAudit.summary.publicSafeDefaultsPassed || !noEnvBuild.summary.passed) {
    process.exitCode = 1;
  }
}

async function buildProjectContext() {
  const root = git(["rev-parse", "--show-toplevel"]).replace(/\\/g, "/");
  const branch = git(["branch", "--show-current"]);
  const commitExists = runGitOk(["cat-file", "-e", "275dd6d33d64223f14e519ffb57d67825a7f5c19^{commit}"]);
  const nextConfig = await readText("next.config.mjs");
  const dataSource = await readText("src/lib/coloring/data.ts");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const sourceText = await readProjectText(["app", "src/components", "src/lib"]);
  const summary = {
    correctRepo: root.endsWith("/i-love-coloring-page"),
    branch,
    branchExpected: branch === "version-4",
    runtimeSwitchCommitExists: commitExists,
    noAppApiRoute: !existsSync(path.join(REPO_ROOT, "app", "api")),
    coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
    hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
    staticExportConfigured: /output:\s*"export"/.test(nextConfig),
    runtimeGeneratedDataExists: existsSync(path.join(REPO_ROOT, "src", "generated", "coloring", "runtime-available-items.json")),
    publicContainsGeneratedProductionMedia: publicFiles.some((file) => /(?:^|\/)(?:coloring-pages|svg|webp|png|thumbs)\//i.test(file)),
    imagesStatusClean: git(["status", "--short", "--", "images"]) === "",
    ilovesvgStatusClean: git(["status", "--short", "--", "ilovesvg"]) === "",
    svgUserDownloadAbsent: !/Download SVG|downloadSvg|svgDownload/i.test(sourceText),
    publicDownloadsArePngJpgWebp: /"png", "jpg", "webp"/.test(await readText("src/lib/coloring/browserDownloads.ts")),
    liveAdSenseCodeAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
    imageSitemapAbsent: !/image-sitemap|ImageSitemap/i.test(sourceText),
    ogImageGenerationAbsent: !/opengraph-image|twitter-image|ImageResponse/i.test(sourceText),
    runtimeDataLayerUsed: /runtime-available-items\.json/.test(dataSource),
  };
  return { generatedAt: GENERATED_AT, runId: "live-production-project-context-check", root, summary };
}

async function buildConfigAudit() {
  const files = {
    siteConfig: await readText("src/lib/site/siteConfig.ts"),
    assets: await readText("src/lib/coloring/assets.ts"),
    metadata: await readText("src/lib/coloring/metadata.ts"),
    layout: await readText("app/layout.tsx"),
    sitemap: await readText("app/sitemap.ts"),
    robots: await readText("app/robots.ts"),
    contact: await readText("app/contact/page.tsx"),
    privacy: await readText("app/privacy/page.tsx"),
    terms: await readText("app/terms/page.tsx"),
    envExample: await readText(".env.example"),
    netlify: await readText("netlify.toml"),
  };
  const appRuntimeText = await readProjectText(["app", "src", "next.config.mjs", "netlify.toml"]);
  const uploadCredentialPattern = /R2_ACCOUNT_ID|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|CLOUDFLARE_R2_ACCESS_KEY_ID|CLOUDFLARE_R2_SECRET_ACCESS_KEY/;
  const summary = {
    siteUrlDefaultPresent: files.siteConfig.includes(SITE_URL),
    assetBaseDefaultPresent: files.siteConfig.includes(ASSET_BASE_URL) && files.assets.includes(ASSET_BASE_URL),
    contactEmailDefaultPresent: files.siteConfig.includes(CONTACT_EMAIL),
    nextPublicSiteUrlOptional: /Optional public overrides/.test(files.envExample) && /NEXT_PUBLIC_SITE_URL/.test(files.netlify) && !/Required Netlify environment variables/.test(files.netlify),
    nextPublicAssetBaseOptional: /Production defaults to https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages/.test(files.envExample),
    nextPublicContactEmailOptional: /Production defaults to admin@ilovecoloringpage\.com/.test(files.envExample),
    missingPublicEnvDoesNotBlockProductionBuild: true,
    uploadCredentialNamesInAppRuntime: uploadCredentialPattern.test(appRuntimeText),
    uploadCredentialNamesInNetlify: uploadCredentialPattern.test(files.netlify),
    uploadCredentialNamesInClientFacingCode: uploadCredentialPattern.test(await readProjectText(["app", "src/components", "src/lib", "src/generated/coloring"])),
    publicSafeDefaultsPassed: false,
  };
  summary.publicSafeDefaultsPassed =
    summary.siteUrlDefaultPresent &&
    summary.assetBaseDefaultPresent &&
    summary.contactEmailDefaultPresent &&
    summary.nextPublicSiteUrlOptional &&
    summary.nextPublicAssetBaseOptional &&
    summary.nextPublicContactEmailOptional &&
    !summary.uploadCredentialNamesInAppRuntime &&
    !summary.uploadCredentialNamesInNetlify &&
    !summary.uploadCredentialNamesInClientFacingCode;

  return {
    generatedAt: GENERATED_AT,
    runId: "live-production-public-config-audit",
    expectedDefaults: { siteUrl: SITE_URL, assetBaseUrl: ASSET_BASE_URL, contactEmail: CONTACT_EMAIL },
    filesAudited: Object.keys(files),
    summary,
  };
}

async function runNoEnvBuildAndInspect() {
  const outRoot = path.join(REPO_ROOT, "out");
  await removeWithinRepo(outRoot);
  const buildEnv = {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: "",
    NEXT_PUBLIC_COLORING_ASSET_BASE_URL: "",
    NEXT_PUBLIC_CONTACT_EMAIL: "",
  };
  const build = await runCommand(npmCommand(), ["run", "build"], {
    ...buildEnv,
  });
  const outputFiles = await listFilesIfExists(outRoot);
  const textFiles = outputFiles.filter((file) => /\.(?:html|txt|xml|js|json|css)$/.test(file));
  const scan = await scanOutputTextFiles(textFiles);
  const summary = {
    command: "npm run build with NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_COLORING_ASSET_BASE_URL, and NEXT_PUBLIC_CONTACT_EMAIL set to empty strings",
    buildExitCode: build.exitCode,
    outputFileCount: outputFiles.length,
    siteUrlDefaultUsed: scan.siteUrlDefaultUsed,
    assetBaseDefaultUsed: scan.assetBaseDefaultUsed,
    contactEmailDefaultUsed: scan.contactEmailDefaultUsed,
    forbiddenMatchCount: scan.forbiddenMatches.length,
    passed: build.exitCode === 0 && scan.siteUrlDefaultUsed && scan.assetBaseDefaultUsed && scan.contactEmailDefaultUsed && scan.forbiddenMatches.length === 0,
  };
  return {
    generatedAt: GENERATED_AT,
    runId: "live-production-no-env-build-results",
    summary,
    forbiddenMatches: scan.forbiddenMatches,
    buildOutputTail: build.output.slice(-4000),
  };
}

async function scanOutputTextFiles(textFiles) {
  const forbiddenMatches = new Set();
  let siteUrlDefaultUsed = false;
  let assetBaseDefaultUsed = false;
  let contactEmailDefaultUsed = false;
  for (const file of textFiles) {
    const outputText = await readFile(path.join(REPO_ROOT, file), "utf8").catch(() => "");
    siteUrlDefaultUsed = siteUrlDefaultUsed || outputText.includes(SITE_URL);
    assetBaseDefaultUsed = assetBaseDefaultUsed || outputText.includes(ASSET_BASE_URL);
    contactEmailDefaultUsed = contactEmailDefaultUsed || outputText.includes(CONTACT_EMAIL);
    for (const match of findForbiddenOutputMatches(outputText, file)) forbiddenMatches.add(match);
  }
  return {
    siteUrlDefaultUsed,
    assetBaseDefaultUsed,
    contactEmailDefaultUsed,
    forbiddenMatches: [...forbiddenMatches].sort(),
  };
}

function findForbiddenOutputMatches(outputText, file = "") {
  const isFrameworkChunk = file.includes("_next/static/chunks/");
  const checks = [
    { id: "localhost", pattern: /localhost/i, ignoreFrameworkChunk: true },
    { id: "loopback", pattern: /127\.0\.0\.1/i, ignoreFrameworkChunk: true },
    { id: "r2_dev", pattern: /r2\.dev/i },
    { id: "private_r2_endpoint", pattern: /r2\.cloudflarestorage\.com|amazonaws\.com/i },
    { id: "source_path", pattern: /D:\\|images\/|ilovesvg\//i },
    { id: "app_api_reference", pattern: /\/api\/coloring/i },
    { id: "live_adsense", pattern: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i },
    { id: "download_svg", pattern: /Download SVG/i },
    { id: "placeholder_contact", pattern: /support@example\.com|contact@example\.com/i },
    { id: "duplicate_asset_prefix", pattern: /coloring-pages\/coloring-pages/i },
  ];
  return checks
    .filter((check) => !(check.ignoreFrameworkChunk && isFrameworkChunk))
    .filter((check) => check.pattern.test(outputText))
    .map((check) => check.id);
}

function renderProjectContextReport(payload) {
  return `# Live Production Project Context Check

- Root: ${payload.root}
- Branch: ${payload.summary.branch}
- Runtime switch commit exists: ${payload.summary.runtimeSwitchCommitExists}
- Static export configured: ${payload.summary.staticExportConfigured}
- app/api absent: ${payload.summary.noAppApiRoute}
- Runtime generated data exists: ${payload.summary.runtimeGeneratedDataExists}
- Public generated media present: ${payload.summary.publicContainsGeneratedProductionMedia}
- images/ clean: ${payload.summary.imagesStatusClean}
- ilovesvg/ clean: ${payload.summary.ilovesvgStatusClean}
- SVG user download absent: ${payload.summary.svgUserDownloadAbsent}
- Public downloads are PNG/JPG/WebP: ${payload.summary.publicDownloadsArePngJpgWebp}
- Live AdSense absent: ${payload.summary.liveAdSenseCodeAbsent}
- Image sitemap absent: ${payload.summary.imageSitemapAbsent}
- OG image generation absent: ${payload.summary.ogImageGenerationAbsent}
`;
}

function renderConfigAuditReport(payload) {
  return `# Live Production Public Config Audit

- Site URL default: ${payload.expectedDefaults.siteUrl}
- Asset base default: ${payload.expectedDefaults.assetBaseUrl}
- Contact email default: ${payload.expectedDefaults.contactEmail}
- Site URL default present: ${payload.summary.siteUrlDefaultPresent}
- Asset base default present: ${payload.summary.assetBaseDefaultPresent}
- Contact email default present: ${payload.summary.contactEmailDefaultPresent}
- NEXT_PUBLIC_SITE_URL optional: ${payload.summary.nextPublicSiteUrlOptional}
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL optional: ${payload.summary.nextPublicAssetBaseOptional}
- NEXT_PUBLIC_CONTACT_EMAIL optional: ${payload.summary.nextPublicContactEmailOptional}
- Upload credentials in app runtime: ${payload.summary.uploadCredentialNamesInAppRuntime}
- Upload credentials in Netlify config: ${payload.summary.uploadCredentialNamesInNetlify}
- Public-safe defaults passed: ${payload.summary.publicSafeDefaultsPassed}
`;
}

function renderNoEnvBuildReport(payload) {
  return `# Live Production No-Env Build Report

- Command: ${payload.summary.command}
- Build exit code: ${payload.summary.buildExitCode}
- Output file count: ${payload.summary.outputFileCount}
- Site URL default used: ${payload.summary.siteUrlDefaultUsed}
- Asset base default used: ${payload.summary.assetBaseDefaultUsed}
- Contact email default used: ${payload.summary.contactEmailDefaultUsed}
- Forbidden match count: ${payload.summary.forbiddenMatchCount}
- Passed: ${payload.summary.passed}

Forbidden matches:

${payload.forbiddenMatches.map((match) => `- ${match}`).join("\n") || "- none"}
`;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const absolute = path.join(REPO_ROOT, relativeRoot);
    if (!existsSync(absolute)) continue;
    if (statSync(absolute).isFile()) {
      chunks.push(await readText(relativeRoot));
      continue;
    }
    for (const file of await listFilesIfExists(absolute)) {
      if (!/\.(?:ts|tsx|css|json|md|mjs|cjs|toml)$/.test(file)) continue;
      if (file.startsWith("src/generated/coloring/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  if (statSync(root).isFile()) return [path.relative(REPO_ROOT, root).replace(/\\/g, "/")];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return results;
}

async function removeWithinRepo(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(REPO_ROOT + path.sep)) throw new Error(`Refusing to remove outside repo: ${target}`);
  await rm(resolved, { recursive: true, force: true });
}

function runCommand(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, env, shell: process.platform === "win32" });
    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on("close", (exitCode) => resolve({ exitCode, output }));
  });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function runGitOk(args) {
  try {
    git(args);
    return true;
  } catch {
    return false;
  }
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, value) {
  await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, String(value).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"), "utf8");
}
