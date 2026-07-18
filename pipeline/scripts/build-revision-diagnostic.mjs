import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hubsPath = path.join(root, "src/generated/coloring/runtime-hubs.json");
const printablesPath = path.join(root, "src/generated/coloring/runtime-printables.json");
const outputPath = path.join(root, "public/build-revision.json");
const [hubsRaw, printablesRaw] = await Promise.all([readFile(hubsPath), readFile(printablesPath)]);
const hubs = JSON.parse(hubsRaw);
const printables = JSON.parse(printablesRaw);
const gitRevision = readGit(["rev-parse", "HEAD"]);
const gitCommitDate = readGit(["show", "-s", "--format=%cI", "HEAD"]);

const diagnostic = {
  schemaVersion: 1,
  revision: process.env.COMMIT_REF || gitRevision || "unknown",
  gitRevision,
  gitCommitDate,
  deploymentContext: process.env.CONTEXT || "local",
  branch: process.env.BRANCH || readGit(["rev-parse", "--abbrev-ref", "HEAD"]),
  hubCount: hubs.length,
  printableCount: printables.length,
  runtimeDataSha256: createHash("sha256").update(hubsRaw).update(printablesRaw).digest("hex"),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(diagnostic, null, 2)}\n`);
console.log(`Wrote build revision diagnostics for revision ${diagnostic.revision}.`);

function readGit(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}
