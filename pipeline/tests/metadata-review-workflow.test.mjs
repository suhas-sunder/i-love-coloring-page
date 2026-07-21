import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const ROOT = process.cwd();
const runtime = json("src/generated/coloring/runtime-printables.json");
const manifest = json("pipeline/manifests/metadata-review-decisions.json");

test("metadata review workflow is explicit, local, and does not promote candidate attributes", () => {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.publicPromotion, "none");
  assert.deepEqual(manifest.decisions, []);
  const fields = runtime.records.flatMap((record) => [
    ...(record.attributes.unapprovedDetailCandidates || []).length ? [{ record, field: "detailClassification" }] : [],
    ...(record.attributes.unapprovedAudienceCandidates || []).length ? [{ record, field: "audienceClassification" }] : [],
  ]);
  const candidateValues = runtime.records.reduce((total, record) => total + record.attributes.unapprovedDetailCandidates.length + record.attributes.unapprovedAudienceCandidates.length, 0);
  assert.equal(runtime.records.length, 6352);
  assert.equal(new Set(fields.map((candidate) => candidate.record.assetId)).size, 2768);
  assert.equal(fields.length, 5512);
  assert.equal(candidateValues, 5553);
  for (const record of runtime.records) {
    assert.equal(record.attributes.detailClassification, null);
    assert.equal(record.attributes.audienceClassification, null);
  }
});

test("metadata review reports are deterministic and contain per-field disposition", () => {
  execFileSync(process.execPath, ["pipeline/scripts/build-metadata-review-workflow.mjs"], { cwd: ROOT, stdio: "pipe" });
  const csv = text("reports/metadata-candidate-disposition.csv").trim().split("\n");
  const status = text("reports/metadata-review-status.md");
  const batches = text("reports/metadata-review-batches.md");
  assert.equal(csv.length - 1, 5512);
  assert.match(status, /Automatic promotion \(State A\): 0/);
  assert.match(status, /Routes with candidate metadata: 2768/);
  assert.match(status, /Underlying collection-label values: 5553/);
  assert.match(batches, /not approval groups/i);
  assert.match(text("pipeline/review/metadata-review/index.html"), /cannot publish metadata/i);
});

function json(relativePath) { return JSON.parse(readFileSync(`${ROOT}/${relativePath}`, "utf8")); }
function text(relativePath) { return readFileSync(`${ROOT}/${relativePath}`, "utf8"); }
