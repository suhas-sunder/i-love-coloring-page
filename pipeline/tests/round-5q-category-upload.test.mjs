import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const CATEGORY = "st-patricks-day";
const EXPECTED_RECORDS = 20;
const EXPECTED_FILES = 40;
const EXPECTED_BUCKET = "i-love-coloring-page";
const EXPECTED_PREFIX = "coloring-pages";
const SCRIPT = "pipeline/scripts/round-5o-upload-clean-bundle-to-r2.mjs";
const VERIFY_SCRIPT = "pipeline/scripts/round-5o-verify-clean-upload-r2.mjs";
const REQUIRED_JSON = [
  "pipeline/manifests/round-5q-project-context-check.json",
  "pipeline/manifests/round-5q-st-patricks-day-upload-plan.json",
  "pipeline/manifests/round-5q-st-patricks-day-dry-run-results.json",
  "pipeline/manifests/round-5q-st-patricks-day-verification-plan.json",
];

test("Round 5Q category dry-run creates st-patricks-day SVG and WebP upload artifacts only", async () => {
  const result = await runNode([SCRIPT, "--dry-run", "--category", CATEGORY]);
  assert.equal(result.code, 0, result.stderr);
  assertNoSecrets(`${result.stdout}\n${result.stderr}`);

  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assertNoSecrets(raw);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5q-project-context-check.json");
  const plan = await readJson("pipeline/manifests/round-5q-st-patricks-day-upload-plan.json");
  const dryRun = await readJson("pipeline/manifests/round-5q-st-patricks-day-dry-run-results.json");
  const verification = await readJson("pipeline/manifests/round-5q-st-patricks-day-verification-plan.json");

  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5pCommitExists, true);
  assert.equal(context.summary.uploadScriptExists, true);
  assert.equal(context.summary.optimizedBundleExists, true);
  assert.equal(context.summary.cleanBundleExists, true);
  assert.equal(context.summary.envR2UploadLocalIgnored, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);

  assert.equal(plan.summary.category, CATEGORY);
  assert.equal(plan.summary.includedRecords, EXPECTED_RECORDS);
  assert.equal(plan.summary.svgCount, EXPECTED_RECORDS);
  assert.equal(plan.summary.webpCount, EXPECTED_RECORDS);
  assert.equal(plan.summary.totalFileCount, EXPECTED_FILES);
  assert.equal(plan.summary.confirmFileCountRequired, EXPECTED_FILES);
  assert.equal(plan.summary.uploadPerformed, false);
  assert.match(plan.summary.expectedUploadCommand, /--confirm-category st-patricks-day/);
  assert.match(plan.summary.expectedVerificationCommand, /--category st-patricks-day/);

  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.executeRequested, false);
  assert.equal(dryRun.uploadPerformed, false);
  assert.equal(dryRun.deletePerformed, false);
  assert.equal(dryRun.summary.category, CATEGORY);
  assert.equal(dryRun.summary.plannedFileCount, EXPECTED_FILES);
  assert.equal(dryRun.summary.svgFileCount, EXPECTED_RECORDS);
  assert.equal(dryRun.summary.webpFileCount, EXPECTED_RECORDS);
  assert.equal(dryRun.summary.pngFileCount, 0);
  assert.equal(dryRun.summary.thumbFileCount, 0);
  assert.equal(dryRun.summary.manualReviewAssetIdsIncluded, 0);
  assert.equal(dryRun.summary.duplicateObjectKeys, 0);
  assert.equal(dryRun.summary.totalBytes > 0, true);
  assert.equal(dryRun.summary.requiredConfirmFileCount, EXPECTED_FILES);
  assert.equal(dryRun.plannedUploads.length, EXPECTED_FILES);
  assert.ok(dryRun.plannedUploads.every((entry) => entry.objectKey.startsWith(`coloring-pages/${entry.kind}/${CATEGORY}/`)));
  assert.ok(dryRun.plannedUploads.every((entry) => entry.localPath.startsWith(`pipeline/r2-upload-optimized/coloring-pages/${entry.kind}/${CATEGORY}/`)));
  assert.ok(dryRun.plannedUploads.every((entry) => ["image/svg+xml", "image/webp"].includes(entry.contentType)));
  assert.equal(dryRun.plannedUploads.some((entry) => /\/(?:png|thumbs)\//i.test(entry.objectKey)), false);

  assert.equal(verification.summary.category, CATEGORY);
  assert.equal(verification.summary.selectedObjectCount, EXPECTED_FILES);
  assert.match(verification.commands.category, /round-5o-verify-clean-upload-r2\.mjs --category st-patricks-day/);
});

test("Round 5Q execute mode requires exact confirm-category and still requires credentials", async () => {
  const missingCategoryConfirm = await runNode([
    SCRIPT,
    "--execute",
    "--category",
    CATEGORY,
    "--confirm-bucket",
    EXPECTED_BUCKET,
    "--confirm-prefix",
    EXPECTED_PREFIX,
    "--confirm-file-count",
    String(EXPECTED_FILES),
  ], blankR2Env());
  assert.notEqual(missingCategoryConfirm.code, 0);
  assert.match(missingCategoryConfirm.stderr, /confirm-category/i);
  assertNoSecrets(`${missingCategoryConfirm.stdout}\n${missingCategoryConfirm.stderr}`);

  const wrongCategoryConfirm = await runNode([
    SCRIPT,
    "--execute",
    "--category",
    CATEGORY,
    "--confirm-bucket",
    EXPECTED_BUCKET,
    "--confirm-prefix",
    EXPECTED_PREFIX,
    "--confirm-category",
    "animals",
    "--confirm-file-count",
    String(EXPECTED_FILES),
  ], blankR2Env());
  assert.notEqual(wrongCategoryConfirm.code, 0);
  assert.match(wrongCategoryConfirm.stderr, /confirm-category/i);

  const missingCredentials = await runNode([
    SCRIPT,
    "--execute",
    "--category",
    CATEGORY,
    "--confirm-bucket",
    EXPECTED_BUCKET,
    "--confirm-prefix",
    EXPECTED_PREFIX,
    "--confirm-category",
    CATEGORY,
    "--confirm-file-count",
    String(EXPECTED_FILES),
    "--skip-existing",
  ], blankR2Env());
  assert.notEqual(missingCredentials.code, 0);
  assert.match(missingCredentials.stderr, /missing/i);
  assertNoSecrets(`${missingCredentials.stdout}\n${missingCredentials.stderr}`);
});

test("Round 5Q verifier supports category-limited checks without changing runtime boundaries", async () => {
  const uploaderText = await readText(SCRIPT);
  const verifierText = await readText(VERIFY_SCRIPT);
  const nextConfig = await readText("next.config.mjs");
  const generatedItems = await readText("src/generated/coloring/items.json");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const ignoredLocalEnv = await gitCheckIgnore(".env.r2-upload.local");

  assert.match(uploaderText, /--category/);
  assert.match(uploaderText, /--confirm-category/);
  assert.match(verifierText, /--category/);
  assert.match(verifierText, /st-patricks-day/);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)), false);
  assert.doesNotMatch(generatedItems, /round-5q|r2-upload-optimized/);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.equal(existsSync(path.join(REPO_ROOT, "pipeline/manifests/round-5o-upload-execute-results.json")), false);
  assert.equal(existsSync(path.join(REPO_ROOT, "pipeline/manifests/round-5q-st-patricks-day-execute-results.json")), false);
  assert.match(ignoredLocalEnv, /\.env\.r2-upload\.local/);
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
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

async function runNode(args, extraEnv = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("node", args, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...extraEnv },
      maxBuffer: 1024 * 1024 * 40,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code || 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || "",
    };
  }
}

function blankR2Env() {
  return {
    R2_ACCOUNT_ID: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    R2_BUCKET: EXPECTED_BUCKET,
    R2_PREFIX: EXPECTED_PREFIX,
  };
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitCheckIgnore(relativePath) {
  const { stdout } = await execFileAsync("git", ["check-ignore", "-v", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function assertNoSecrets(value) {
  assert.doesNotMatch(value, /R2_SECRET_ACCESS_KEY\s*=\s*\S+|R2_ACCESS_KEY_ID\s*=\s*\S+|Authorization:\s*AWS|AKIA[0-9A-Z]{16}|secretAccessKey["']?\s*[:=]\s*["']?[^"',\s]+/i);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
