import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND3C_PROJECT_MANIFESTS,
  buildProductionAssetIdentity,
  loadRound3CInputState,
  runRound3CProductionExport,
  validateApprovedCorpusInputs,
} from "../scripts/round-3c-production-export.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

test("project input state uses the corrected approved manifest and has no blocked overlap", async () => {
  const state = await loadRound3CInputState({ repoRoot: REPO_ROOT });

  assert.equal(state.counts.approvedRequested, 6566);
  assert.equal(state.counts.blockedSources, 244);
  assert.equal(state.counts.warningSources, 5345);
  assert.equal(state.validation.isValid, true);
  assert.equal(state.validation.approvedBlockedOverlap.length, 0);
  assert.equal(state.validation.sourceProblems.length, 0);
  assert.equal(state.policy.defaultPreset.presetId, "line-thick");
  assert.equal(state.outputSpec.conversionPolicy.presetId, "line-thick");
  assert.equal(
    state.conversionWrapper.modulePath,
    "pipeline/scripts/round-2-bakeoff.mjs",
  );
  assert.equal(state.conversionWrapper.exportName, "runSingleConversion");
});

test("input validation rejects blocked overlap but allows approved warning images", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "round-3c-validate-"));
  try {
    await writeFixtureSource(repoRoot, "images/animals/ok.png", "ok-source");
    await writeFixtureSource(repoRoot, "images/chibi/warn.png", "warn-source");
    const manifests = fixtureManifests();
    manifests.approved.entries.push(sourceEntry("images/flowers/blocked.png", "flowers"));
    manifests.blocked.entries.push(sourceEntry("images/flowers/blocked.png", "flowers"));

    const validation = await validateApprovedCorpusInputs({
      repoRoot,
      approved: manifests.approved,
      blocked: manifests.blocked,
      warnings: manifests.warnings,
      inventory: manifests.inventory,
    });

    assert.equal(validation.isValid, false);
    assert.deepEqual(validation.approvedBlockedOverlap, ["images/flowers/blocked.png"]);
    assert.deepEqual(validation.warningApprovedPaths, ["images/chibi/warn.png"]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("production asset identities use full output paths and duplicate filenames do not collide", () => {
  const first = buildProductionAssetIdentity(sourceEntry("images/animals/shared.png", "animals"));
  const second = buildProductionAssetIdentity(sourceEntry("images/birds/shared.png", "birds"));
  const repeated = buildProductionAssetIdentity(sourceEntry("images/animals/shared.png", "animals"));

  assert.equal(first.assetId, repeated.assetId);
  assert.equal(first.categorySlug, "animals");
  assert.equal(first.filenameSlug, "shared");
  assert.match(first.svgRelativePath, /^pipeline\/production\/full\/assets\/svg\/animals\/shared-[a-f0-9]{10}\.svg$/);
  assert.notEqual(first.assetId, second.assetId);
  assert.notEqual(first.svgRelativePath, second.svgRelativePath);
});

test("exporter source does not glob the source image corpus as production input", async () => {
  const script = await readFile(
    path.join(REPO_ROOT, "pipeline", "scripts", "round-3c-production-export.mjs"),
    "utf8",
  );

  assert.doesNotMatch(script, /glob\([^)]*images/i);
  assert.doesNotMatch(script, /readdir(?:Sync)?\([^)]*images/i);
});

test("fixture export supports resume, quarantines failures, and emits valid gallery data", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "round-3c-export-"));
  try {
    await writeFixtureSource(repoRoot, "images/animals/ok.png", "ok-source");
    await writeFixtureSource(repoRoot, "images/chibi/warn.png", "warn-source");
    await writeFixtureSource(repoRoot, "images/flowers/fails.png", "fail-source");
    await writeFixtureSource(repoRoot, "images/animals/blocked.png", "blocked-source");

    const options = {
      repoRoot,
      manifests: fixtureManifests(),
      resetOutputRoot: true,
      batchSize: 2,
      converter: fakeConverter,
      createThumbnail: fakeThumbnail,
      inspectPng: fakePngInspector,
      measurePng: fakePngMetrics,
      now: () => "2026-05-09T00:00:00.000Z",
    };

    const firstRun = await runRound3CProductionExport(options);
    const resumeRun = await runRound3CProductionExport({
      ...options,
      resetOutputRoot: false,
      resume: true,
    });

    assert.equal(firstRun.results.totalApprovedRequested, 3);
    assert.equal(firstRun.results.totalPassed, 2);
    assert.equal(firstRun.results.totalQuarantined, 1);
    assert.equal(firstRun.results.totalSkipped, 0);
    assert.equal(firstRun.results.warningImageCount, 1);
    assert.equal(resumeRun.results.totalPassed, 2);
    assert.equal(resumeRun.results.totalQuarantined, 1);
    assert.equal(resumeRun.resumeState.reusedSuccessCount, 2);
    assert.equal(resumeRun.resumeState.reusedQuarantineCount, 1);

    const galleryIds = new Set(
      firstRun.gallery.categories.flatMap((category) => category.items.map((item) => item.assetId)),
    );
    assert.deepEqual([...galleryIds].sort(), firstRun.assets.assets.map((asset) => asset.assetId).sort());

    const categoryAssetCount = firstRun.categoryData.categories.reduce(
      (sum, category) => sum + category.imageCount,
      0,
    );
    assert.equal(categoryAssetCount, firstRun.assets.assets.length);
    assert.equal(firstRun.warningAssets.totalWarningAssets, 1);
    assert.equal(firstRun.quarantine.entries[0].status, "quarantined_for_now");
    assert.equal(firstRun.nextjsDataContract.noPerImageIndexPages, true);

    for (const manifestPath of ROUND3C_PROJECT_MANIFESTS) {
      const parsed = JSON.parse(await readFile(path.join(repoRoot, manifestPath), "utf8"));
      assert.ok(parsed.generatedAt);
    }

    const sourceAfter = await stat(path.join(repoRoot, "images", "animals", "ok.png"));
    assert.equal(sourceAfter.size, "ok-source".length);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("project Round 3C manifests parse and successful gallery references are consistent when present", async (t) => {
  const manifestExists = await exists(path.join(REPO_ROOT, ROUND3C_PROJECT_MANIFESTS[0]));
  if (!manifestExists) {
    t.skip("Round 3C project manifests are generated by the full export command.");
    return;
  }

  const parsed = {};
  for (const manifestPath of ROUND3C_PROJECT_MANIFESTS) {
    parsed[manifestPath] = JSON.parse(await readFile(path.join(REPO_ROOT, manifestPath), "utf8"));
    assert.ok(parsed[manifestPath].generatedAt);
  }

  const results = parsed["pipeline/manifests/round-3c-production-export-results.json"];
  const assets = parsed["pipeline/manifests/round-3c-production-assets.json"];
  const gallery = parsed["pipeline/manifests/round-3c-production-gallery-data.json"];
  const categoryData = parsed["pipeline/manifests/round-3c-production-category-data.json"];
  const contract = parsed["pipeline/manifests/round-3c-nextjs-data-contract.json"];

  assert.equal(results.totalPassed, assets.assets.length);
  assert.equal(categoryData.categories.reduce((sum, category) => sum + category.imageCount, 0), assets.assets.length);
  const assetIds = new Set(assets.assets.map((asset) => asset.assetId));
  assert.equal(
    gallery.categories.every((category) => category.items.every((item) => assetIds.has(item.assetId))),
    true,
  );
  assert.equal(contract.noPerImageIndexPages, true);
});

function fixtureManifests() {
  const ok = sourceEntry("images/animals/ok.png", "animals", { fileSizeBytes: "ok-source".length });
  const warn = sourceEntry("images/chibi/warn.png", "chibi", {
    fileSizeBytes: "warn-source".length,
    status: "approved_with_warning",
    warningCodes: ["soft_warning_human_adjacent"],
  });
  const fail = sourceEntry("images/flowers/fails.png", "flowers", { fileSizeBytes: "fail-source".length });
  const blocked = sourceEntry("images/animals/blocked.png", "animals", { fileSizeBytes: "blocked-source".length });
  return {
    inventory: { entries: [ok, warn, fail, blocked] },
    categorySummary: {
      categories: [
        { categoryName: "animals", categorySlug: "animals", likelyPublicHubCandidate: true },
        { categoryName: "chibi", categorySlug: "chibi", likelyPublicHubCandidate: true },
        { categoryName: "flowers", categorySlug: "flowers", likelyPublicHubCandidate: true },
      ],
    },
    approved: { entries: [ok, warn, fail] },
    blocked: { entries: [blocked] },
    warnings: { entries: [warn] },
    policy: {
      recommendationType: "single_default_preset",
      defaultPreset: { presetId: "line-thick", presetName: "Lineart - Thick" },
      productionReadyOutputSpec: {
        passThresholds: {
          minimumDarkPixelRatio: 0.004,
          maximumDarkPixelRatio: 0.55,
          maximumSvgBytesPreferred: 2000000,
          maximumPathCountPreferred: 2500,
        },
      },
    },
    outputSpec: {
      conversionPolicy: {
        presetId: "line-thick",
        presetName: "Lineart - Thick",
        relevantParameters: { traceMode: "single" },
      },
    },
    preset: {
      presetId: "line-thick",
      presetName: "Lineart - Thick",
      relevantParameters: { traceMode: "single" },
    },
  };
}

function sourceEntry(sourceRelativePath, category, overrides = {}) {
  const filename = path.posix.basename(sourceRelativePath);
  return {
    sourceRelativePath,
    category,
    nestedCategory: null,
    filename,
    fileSizeBytes: 11,
    dimensions: { width: 64, height: 64 },
    status: "approved",
    warningCodes: [],
    reasonCodes: [],
    ...overrides,
  };
}

async function writeFixtureSource(repoRoot, relativePath, content) {
  const target = path.join(repoRoot, ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function fakeConverter({ source, outputPaths }) {
  if (source.sourceRelativePath.includes("fails")) {
    throw new Error("fixture conversion failed");
  }
  await writeFile(
    outputPaths.svgAbsolutePath,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M8 8H56V56H8Z"/></svg>',
    "utf8",
  );
  await writeFile(outputPaths.pngAbsolutePath, "preview-png", "utf8");
  return {
    metrics: {
      renderSucceeded: true,
      darkPixelRatio: 0.12,
      svgBytes: 97,
      pathCount: 1,
      width: 64,
      height: 64,
      engineUsed: "fixture",
    },
    score: {
      qualityScore: 100,
      printableColoringPageCandidate: true,
      flags: [],
      humanReviewFlags: [],
    },
  };
}

async function fakeThumbnail({ outputPaths }) {
  await writeFile(outputPaths.thumbAbsolutePath, "thumb-png", "utf8");
}

async function fakePngInspector() {
  return { width: 64, height: 64, format: "png", sizeBytes: 11 };
}

async function fakePngMetrics() {
  return { darkPixelRatio: 0.12 };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
