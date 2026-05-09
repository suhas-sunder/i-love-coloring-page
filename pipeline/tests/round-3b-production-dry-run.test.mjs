import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND3B_PROJECT_MANIFESTS,
  buildAssetIdentity,
  loadRound3BInputState,
  runRound3BProductionDryRun,
  validateDryRunSamples,
} from "../scripts/round-3b-production-dry-run.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

test("project dry-run input is approved-only and uses the line-thick policy", async () => {
  const state = await loadRound3BInputState({ repoRoot: REPO_ROOT });

  assert.equal(state.counts.approvedCandidates, 6566);
  assert.equal(state.counts.blockedSources, 244);
  assert.equal(state.counts.warningSources, 5345);
  assert.equal(state.counts.dryRunSampleSize, 125);
  assert.equal(state.validation.isValid, true);
  assert.equal(state.validation.blockedSamplePaths.length, 0);
  assert.equal(state.validation.missingApprovedPaths.length, 0);
  assert.equal(state.counts.warningDryRunImages, 83);
  assert.equal(state.policy.defaultPreset.presetId, "line-thick");
  assert.equal(state.policy.defaultPreset.presetName, "Lineart - Thick");
  assert.equal(
    state.conversionWrapper.modulePath,
    "pipeline/scripts/round-2-bakeoff.mjs",
  );
  assert.equal(state.conversionWrapper.exportName, "runSingleConversion");
});

test("warning images are allowed when approved but blocked images are rejected from the dry run", () => {
  const approved = {
    entries: [
      sourceEntry("images/animals/ok.png", "animals"),
      sourceEntry("images/chibi/warn.png", "chibi", { warningCodes: ["soft_warning_human_adjacent"] }),
    ],
  };
  const blocked = {
    entries: [sourceEntry("images/animals/blocked.png", "animals")],
  };
  const warnings = {
    entries: [sourceEntry("images/chibi/warn.png", "chibi", { warningCodes: ["soft_warning_human_adjacent"] })],
  };
  const sample = {
    samples: [
      sourceEntry("images/animals/ok.png", "animals"),
      sourceEntry("images/chibi/warn.png", "chibi", { warningCodes: ["soft_warning_human_adjacent"] }),
      sourceEntry("images/animals/blocked.png", "animals"),
      sourceEntry("images/flowers/not-approved.png", "flowers"),
    ],
  };

  const validation = validateDryRunSamples({ sample, approved, blocked, warnings });

  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.blockedSamplePaths, ["images/animals/blocked.png"]);
  assert.deepEqual(validation.missingApprovedPaths, ["images/flowers/not-approved.png"]);
  assert.equal(validation.warningApprovedPaths.length, 1);
  assert.equal(validation.warningApprovedPaths[0], "images/chibi/warn.png");
});

test("asset identities are deterministic and duplicate filenames do not collide", () => {
  const first = buildAssetIdentity(
    sourceEntry("images/animals/shared-name.png", "animals"),
  );
  const second = buildAssetIdentity(
    sourceEntry("images/birds/shared-name.png", "birds"),
  );
  const repeated = buildAssetIdentity(
    sourceEntry("images/animals/shared-name.png", "animals"),
  );

  assert.equal(first.assetId, repeated.assetId);
  assert.equal(first.filenameSlug, "shared-name");
  assert.equal(first.categorySlug, "animals");
  assert.match(first.assetId, /^animals__shared-name__[a-f0-9]{10}$/);
  assert.match(first.svgRelativePath, /^pipeline\/production\/dry-run\/assets\/svg\/animals\/shared-name-[a-f0-9]{10}\.svg$/);
  assert.notEqual(first.assetId, second.assetId);
  assert.notEqual(first.svgRelativePath, second.svgRelativePath);
});

test("exporter source does not glob the source image corpus as production input", async () => {
  const script = await readFile(
    path.join(REPO_ROOT, "pipeline", "scripts", "round-3b-production-dry-run.mjs"),
    "utf8",
  );

  assert.doesNotMatch(script, /glob\([^)]*images/i);
  assert.doesNotMatch(script, /readdir(?:Sync)?\([^)]*images/i);
});

test("fixture dry run quarantines failures, emits parseable manifests, and reruns idempotently", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "round-3b-test-"));
  try {
    await writeFixtureSource(repoRoot, "images/animals/ok.png");
    await writeFixtureSource(repoRoot, "images/chibi/fails.png");
    await writeFixtureSource(repoRoot, "images/flowers/blocked.png");

    const manifests = fixtureManifests();
    const options = {
      repoRoot,
      manifests,
      resetOutputRoot: true,
      converter: fakeConverter,
      createThumbnail: fakeThumbnail,
      inspectPng: fakePngInspector,
      measurePng: fakePngMetrics,
      now: () => "2026-05-09T00:00:00.000Z",
    };

    const firstRun = await runRound3BProductionDryRun(options);
    const secondRun = await runRound3BProductionDryRun(options);

    assert.equal(firstRun.results.totalRequested, 3);
    assert.equal(firstRun.results.totalPassed, 1);
    assert.equal(firstRun.results.totalQuarantined, 1);
    assert.equal(firstRun.results.totalSkipped, 1);
    assert.equal(firstRun.results.warningImageCount, 1);
    assert.equal(secondRun.results.totalPassed, 1);
    assert.deepEqual(
      secondRun.assets.assets.map((asset) => asset.assetId),
      firstRun.assets.assets.map((asset) => asset.assetId),
    );

    const galleryIds = new Set(
      firstRun.gallery.categories.flatMap((category) => category.items.map((item) => item.assetId)),
    );
    assert.deepEqual([...galleryIds], firstRun.assets.assets.map((asset) => asset.assetId));
    assert.equal(firstRun.quarantine.entries[0].status, "quarantined_for_now");
    assert.equal(firstRun.quarantine.entries[0].failureStage, "conversion");

    for (const manifestPath of ROUND3B_PROJECT_MANIFESTS) {
      const projectPath = path.join(repoRoot, manifestPath);
      const parsed = JSON.parse(await readFile(projectPath, "utf8"));
      assert.ok(parsed.generatedAt);
    }

    const sourceAfter = await stat(path.join(repoRoot, "images", "animals", "ok.png"));
    assert.equal(sourceAfter.size, 11);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

function fixtureManifests() {
  const ok = sourceEntry("images/animals/ok.png", "animals");
  const fail = sourceEntry("images/chibi/fails.png", "chibi", {
    warningCodes: ["soft_warning_human_adjacent"],
    status: "approved_with_warning",
  });
  const blocked = sourceEntry("images/flowers/blocked.png", "flowers");
  return {
    approved: { entries: [ok, fail] },
    blocked: { entries: [blocked] },
    warnings: { entries: [fail] },
    sample: { samples: [ok, fail, blocked], actualSampleSize: 3, targetSampleSize: 3 },
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

async function writeFixtureSource(repoRoot, relativePath) {
  const target = path.join(repoRoot, ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, "source-data", "utf8");
}

async function fakeConverter({ sample, outputPaths }) {
  if (sample.sourceRelativePath.includes("fails")) {
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
