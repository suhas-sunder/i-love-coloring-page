import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("visual refinement contracts stay structural rather than pixel-snapshot based", () => {
  execFileSync(process.execPath, ["pipeline/scripts/validate-refinement-contracts.mjs"], { cwd: process.cwd(), stdio: "pipe" });
});
