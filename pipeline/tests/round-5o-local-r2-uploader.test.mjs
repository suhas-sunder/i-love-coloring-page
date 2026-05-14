import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const EXPECTED_FILES = 12704;
const EXPECTED_SVG = 6352;
const EXPECTED_WEBP = 6352;
const EXPECTED_DEFERRED = 205;
const EXPECTED_BUCKET = "i-love-coloring-page";
const EXPECTED_PREFIX = "coloring-pages";
const REQUIRED_JSON = [
  "pipeline/manifests/round-5o-project-context-check.json",
  "pipeline/manifests/round-5o-working-tree-audit.json",
  "pipeline/manifests/round-5o-clean-bundle-upload-audit.json",
  "pipeline/manifests/round-5o-upload-dry-run-results.json",
  "pipeline/manifests/round-5o-upload-operation-estimate.json",
  "pipeline/manifests/round-5o-post-upload-verifier-plan.json",
  "pipeline/manifests/round-5o-local-uploader-lifecycle.json",
];

test("Round 5O JSON manifests parse and confirm bounded project context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /R2_SECRET_ACCESS_KEY\s*=\s*[^\\n"]+|AWS_SECRET|AKIA[0-9A-Z]{16}|ca-pub-|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5o-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.repoName, "i-love-coloring-page");
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5nCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.cleanBundleExists, true);
  assert.equal(context.summary.cleanBundleSvgExists, true);
  assert.equal(context.summary.cleanBundleWebpExists, true);
  assert.equal(context.summary.publicContainsGeneratedProductionMedia, false);
  assert.equal(context.summary.imagesStatusClean, true);
  assert.equal(context.summary.ilovesvgStatusClean, true);
  assert.equal(context.summary.svgInternalOnly, true);
  assert.equal(context.summary.publicDownloadsPngJpgWebp, true);
  assert.equal(context.summary.adWellsVisibleByDefault, true);
  assert.equal(context.summary.liveAdSenseCodePresent, false);
  assert.equal(context.summary.imageSitemapPresent, false);
  assert.equal(context.summary.openGraphImageGenerationPresent, false);
  assert.equal(context.summary.wrongContextIndicatorsPresent, false);
});

test("Round 5O clean bundle audit and dry-run upload manifest cover SVG plus WebP only", async () => {
  const audit = await readJson("pipeline/manifests/round-5o-clean-bundle-upload-audit.json");
  const dryRun = await readJson("pipeline/manifests/round-5o-upload-dry-run-results.json");
  const failures = await readJson("pipeline/manifests/round-5o-upload-failures.json");

  assert.equal(audit.summary.includedRecords, EXPECTED_SVG);
  assert.equal(audit.summary.deferredRecords, EXPECTED_DEFERRED);
  assert.equal(audit.summary.svgFiles, EXPECTED_SVG);
  assert.equal(audit.summary.webpFiles, EXPECTED_WEBP);
  assert.equal(audit.summary.totalFiles, EXPECTED_FILES);
  assert.equal(audit.summary.pngFiles, 0);
  assert.equal(audit.summary.thumbFiles, 0);
  assert.equal(audit.summary.manualReviewAssetIdsIncluded, 0);
  assert.equal(audit.summary.missingLocalFiles, 0);
  assert.equal(audit.summary.duplicateObjectKeys, 0);
  assert.equal(audit.summary.mediaFilesStagedInGit, false);

  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.executeRequested, false);
  assert.equal(dryRun.uploadPerformed, false);
  assert.equal(dryRun.deletePerformed, false);
  assert.equal(dryRun.summary.plannedFileCount, EXPECTED_FILES);
  assert.equal(dryRun.summary.svgFileCount, EXPECTED_SVG);
  assert.equal(dryRun.summary.webpFileCount, EXPECTED_WEBP);
  assert.equal(dryRun.summary.pngFileCount, 0);
  assert.equal(dryRun.summary.thumbFileCount, 0);
  assert.equal(dryRun.summary.manualReviewAssetIdsIncluded, 0);
  assert.equal(dryRun.summary.duplicateObjectKeys, 0);
  assert.equal(dryRun.summary.duplicatePrefixCount, 0);
  assert.equal(dryRun.summary.oldTestPrefixCount, 0);
  assert.equal(dryRun.summary.bucket, EXPECTED_BUCKET);
  assert.equal(dryRun.summary.prefix, EXPECTED_PREFIX);
  assert.ok(["clean", "optimized"].includes(dryRun.summary.uploadSource || "clean"));
  assert.match(dryRun.summary.uploadSourceRoot || "pipeline/r2-upload-clean/coloring-pages", /^pipeline\/r2-upload-(?:clean|optimized)\/coloring-pages$/);
  assert.equal(dryRun.summary.readyForOwnerExecuteReview, true);
  assert.ok(dryRun.summary.totalBytes > 0);
  assert.ok(dryRun.summary.totalBytes <= audit.summary.expectedTotalBytes + 1024 * 1024 * 20);
  assert.equal(dryRun.plannedUploads.length, EXPECTED_FILES);
  assert.equal(failures.uploadExecuted, false);
  assert.deepEqual(failures.failures, []);
});

test("Round 5O uploader exists, defaults to dry-run, and refuses unsafe execute modes", async () => {
  const script = "pipeline/scripts/round-5o-upload-clean-bundle-to-r2.mjs";
  const configHelper = "pipeline/lib/r2-upload-config.mjs";
  const scriptText = await readText(script);
  const configText = await readText(configHelper);

  assert.equal(existsSync(path.join(REPO_ROOT, script)), true);
  assert.equal(existsSync(path.join(REPO_ROOT, configHelper)), true);
  assert.match(scriptText, /const mode = executeRequested \? "execute" : "dry-run"/);
  assert.match(scriptText, /PutObjectCommand/);
  assert.match(scriptText, /HeadObjectCommand/);
  assert.match(scriptText, /ContentType/);
  assert.match(scriptText, /CacheControl/);
  assert.match(scriptText, /image\/svg\+xml/);
  assert.match(scriptText, /image\/webp/);
  assert.match(configText, /R2_SECRET_ACCESS_KEY/);
  assert.match(configText, /redact/);

  const executeWithoutConfirm = await runNode([script, "--execute"]);
  assert.notEqual(executeWithoutConfirm.code, 0);
  assert.match(executeWithoutConfirm.stderr, /confirm-bucket|confirm-prefix|confirm-file-count/i);
  assert.doesNotMatch(`${executeWithoutConfirm.stdout}\n${executeWithoutConfirm.stderr}`, /SECRET_ACCESS_KEY=.*\w|Authorization:\s*AWS|AKIA[0-9A-Z]{16}/i);

  const wrongBucket = await runNode([script, "--execute", "--confirm-bucket", "wrong-bucket", "--confirm-prefix", EXPECTED_PREFIX, "--confirm-file-count", String(EXPECTED_FILES)]);
  assert.notEqual(wrongBucket.code, 0);
  assert.match(wrongBucket.stderr, /bucket/i);

  const wrongPrefix = await runNode([script, "--execute", "--confirm-bucket", EXPECTED_BUCKET, "--confirm-prefix", "coloring-pages/coloring-pages", "--confirm-file-count", String(EXPECTED_FILES)]);
  assert.notEqual(wrongPrefix.code, 0);
  assert.match(wrongPrefix.stderr, /prefix/i);

  const missingCredentials = await runNode([script, "--execute", "--confirm-bucket", EXPECTED_BUCKET, "--confirm-prefix", EXPECTED_PREFIX, "--confirm-file-count", String(EXPECTED_FILES)], {
    R2_ACCOUNT_ID: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    R2_BUCKET: EXPECTED_BUCKET,
    R2_PREFIX: EXPECTED_PREFIX,
  });
  assert.notEqual(missingCredentials.code, 0);
  assert.match(missingCredentials.stderr, /missing/i);
});

test("Round 5O operation estimate, verifier plan, lifecycle, and runbook are present", async () => {
  const estimate = await readJson("pipeline/manifests/round-5o-upload-operation-estimate.json");
  const verifierPlan = await readJson("pipeline/manifests/round-5o-post-upload-verifier-plan.json");
  const lifecycle = await readJson("pipeline/manifests/round-5o-local-uploader-lifecycle.json");
  const runbook = await readText("pipeline/reports/round-5o-owner-upload-runbook.md");
  const verifier = await readText("pipeline/scripts/round-5o-verify-clean-upload-r2.mjs");

  assert.equal(estimate.summary.putObjectOperations, EXPECTED_FILES);
  assert.equal(estimate.summary.headObjectOperationsWithSkipExisting, EXPECTED_FILES);
  assert.ok(["clean", "optimized"].includes(estimate.summary.uploadSource || "clean"));
  assert.match(estimate.summary.uploadSourceRoot || "pipeline/r2-upload-clean/coloring-pages", /^pipeline\/r2-upload-(?:clean|optimized)\/coloring-pages$/);
  assert.ok(estimate.summary.totalUploadBytes > 0);
  assert.equal(estimate.summary.deleteOperations, 0);
  assert.equal(verifierPlan.summary.publicBaseUrl, "https://assets.ilovecoloringpage.com/coloring-pages");
  assert.equal(verifierPlan.summary.fullVerificationCount, EXPECTED_FILES);
  assert.match(verifier, /Access-Control-Allow-Origin/);
  assert.match(verifier, /image\/svg\+xml/);
  assert.match(verifier, /image\/webp/);
  assert.equal(lifecycle.summary.localOnlyUtility, true);
  assert.equal(lifecycle.summary.usedByAppRuntime, false);
  assert.equal(lifecycle.summary.usedByBuild, false);
  assert.equal(lifecycle.summary.recurringTask, false);
  assert.equal(lifecycle.summary.backgroundWatcher, false);
  assert.match(runbook, /never paste keys/i);
  assert.match(runbook, /R2_ACCOUNT_ID/);
  assert.match(runbook, /--dry-run/);
  assert.match(runbook, /--execute --confirm-bucket i-love-coloring-page --confirm-prefix coloring-pages --confirm-file-count 12704 --limit 10 --skip-existing/);
  assert.match(runbook, /--execute --confirm-bucket i-love-coloring-page --confirm-prefix coloring-pages --confirm-file-count 12704 --skip-existing/);
  assert.match(runbook, /round-5o-verify-clean-upload-r2\.mjs --full/);
});

test("Round 5O credentials are ignored and execute results are absent in this Codex round", async () => {
  const envExample = await readText(".env.r2-upload.example");
  const gitignore = await readText(".gitignore");
  const committedFiles = await gitLsFiles(".");
  const executeManifest = path.join(REPO_ROOT, "pipeline/manifests/round-5o-upload-execute-results.json");
  const ignoredLocal = await gitCheckIgnore(".env.r2-upload.local");
  const ignoredBase = await gitCheckIgnore(".env.r2-upload");

  assert.match(envExample, /R2_ACCOUNT_ID=/);
  assert.match(envExample, /R2_ACCESS_KEY_ID=/);
  assert.match(envExample, /R2_SECRET_ACCESS_KEY=/);
  assert.match(envExample, /R2_BUCKET=i-love-coloring-page/);
  assert.match(envExample, /R2_PREFIX=coloring-pages/);
  assert.doesNotMatch(envExample, /R2_ACCOUNT_ID=.+|R2_ACCESS_KEY_ID=.+|R2_SECRET_ACCESS_KEY=.+|AKIA[0-9A-Z]{16}|token-[a-z0-9]{20}/i);
  assert.match(gitignore, /\.env\.r2-upload\.local/);
  assert.match(gitignore, /\.env\.r2-upload/);
  assert.match(ignoredLocal, /\.env\.r2-upload\.local/);
  assert.match(ignoredBase, /\.env\.r2-upload/);
  assert.equal(existsSync(executeManifest), false);
  assert.doesNotMatch(committedFiles, /\.env\.r2-upload\.local|\.env\.local/);
});

test("Round 5O preserves static export, runtime paths, source media, and deferred launch work", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const generatedItems = await readText("src/generated/coloring/items.json");
  const adsConfig = await readText("src/lib/ads/config.ts");
  const projectText = await readProjectText(["app", "src"]);
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusR2Upload = await gitStatusFor("pipeline/r2-upload");
  const statusR2UploadClean = await gitStatusFor("pipeline/r2-upload-clean");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const statusPublic = await gitStatusFor("public");
  const renameStatus = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)), false);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.doesNotMatch(generatedItems, /round-5o|cleanSvgObjectKey|cleanWebpObjectKey/);
  assert.match(adsConfig, /Advertisement/);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /opengraph-image|twitter-image|ImageResponse/i);
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusR2Upload.trim(), "");
  assert.equal(statusR2UploadClean.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.doesNotMatch(statusPublic, /(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i);
  assert.equal(renameStatus.split(/\r?\n/).some((line) => /^R/.test(line.trim())), false);
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }

  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results.map(normalizePath);
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatus() {
  const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: REPO_ROOT });
  return stdout;
}

async function gitCheckIgnore(relativePath) {
  const { stdout } = await execFileAsync("git", ["check-ignore", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function runNode(args, envOverrides = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("node", args, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...envOverrides },
      maxBuffer: 1024 * 1024 * 20,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout || "",
      stderr: error.stderr || String(error.message || error),
    };
  }
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
