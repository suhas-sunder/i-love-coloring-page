import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("public source and exported output contain no forbidden em-dash representation", () => {
  execFileSync(process.execPath, ["pipeline/scripts/audit-public-punctuation.mjs", "--phase", "after"], { cwd: process.cwd(), stdio: "pipe" });
  const report = readFileSync("reports/punctuation-occurrences-after.csv", "utf8").trim().split("\n");
  assert.equal(report.length, 1);
  const punctuationAudit = readFileSync("reports/punctuation-audit.md", "utf8");
  assert.match(punctuationAudit, /After correction \| 0 \| 0 \| 0/);
});
