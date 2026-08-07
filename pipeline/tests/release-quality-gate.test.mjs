import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AUTHORITATIVE_NODE_MAJOR,
  EXPECTED_PRINTABLE_RECORD_SHA256,
  RELEASE_COMMANDS,
  REQUIRED_PACKAGE_SCRIPTS,
  ReleaseGateError,
  compareStatusEntries,
  inspectRepositoryPreflight,
  npmExecutable,
  npmInvocation,
  parsePorcelainStatus,
  runChildCommand,
  runCommandSequence,
  verifyGeneratedCleanliness,
  verifyProtectedContracts,
} from "../lib/release-quality-gate.mjs";

const ROOT = process.cwd();
const WORKFLOW_PATH = path.join(ROOT, ".github", "workflows", "release-quality-gate.yml");

test("workflow is a read-only main-branch gate with a manual trigger", async () => {
  const workflow = await readFile(WORKFLOW_PATH, "utf8");
  assert.match(workflow, /^name: Release Quality Gate$/m);
  assert.match(workflow, /^on:\s*$/m);
  assert.match(workflow, /^  pull_request:\s*\n    branches:\s*\n      - main$/m);
  assert.match(workflow, /^  push:\s*\n    branches:\s*\n      - main$/m);
  assert.match(workflow, /^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /pull_request_target|repository_dispatch|workflow_run|schedule:/);
  assert.match(workflow, /^permissions:\s*\n  contents: read$/m);
  assert.doesNotMatch(workflow, /\bwrite\b|id-token|pull-requests:|issues:|deployments:|packages:/);
  assert.match(workflow, /^concurrency:\s*$/m);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /timeout-minutes: 35/);
});

test("workflow pins only current official actions and uses Node 22 with npm download caching", async () => {
  const workflow = await readFile(WORKFLOW_PATH, "utf8");
  const actionReferences = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
  assert.deepEqual(actionReferences, [
    "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
    "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
  ]);
  assert.ok(actionReferences.every((reference) => /@[a-f0-9]{40}$/.test(reference)));
  assert.match(workflow, new RegExp(`node-version: "${AUTHORITATIVE_NODE_MAJOR}"`));
  assert.match(workflow, /cache: npm/);
  assert.match(workflow, /cache-dependency-path: package-lock\.json/);
  assert.doesNotMatch(workflow, /node_modules|\.next|\bout\/?\s*$/m);
});

test("workflow installs exactly from the lockfile and invokes one authoritative local command", async () => {
  const workflow = await readFile(WORKFLOW_PATH, "utf8");
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run verify:release/);
  assert.doesNotMatch(workflow, /npm install|continue-on-error|\|\|\s*true/);
  assert.doesNotMatch(workflow, /secrets\.|^\s*env:|NEXT_PUBLIC_|NODE_ENV/m);
  assert.doesNotMatch(workflow, /netlify|cloudflare|deploy|force-push|git\s+(?:commit|push)|upload-artifact/i);
  assert.equal((workflow.match(/^jobs:\s*$/gm) || []).length, 1);
  assert.equal((workflow.match(/^  [a-z][a-z0-9_-]*:\s*$/gm) || []).filter((line) => line.trim() === "verify:").length, 1);
});

test("release stages use the actual artifact prerequisite order and avoid duplicate full work", () => {
  const requiredNames = RELEASE_COMMANDS.filter((entry) => entry.required).map((entry) => entry.name);
  assert.ok(requiredNames.indexOf("Production build") < requiredNames.indexOf("Full tests"));
  assert.equal(RELEASE_COMMANDS.filter((entry) => entry.args.join(" ") === "run build").length, 1);
  assert.equal(RELEASE_COMMANDS.filter((entry) => entry.args.join(" ") === "test").length, 1);
  assert.equal(RELEASE_COMMANDS.filter((entry) => entry.name === "Internal links").length, 1);
  assert.equal(RELEASE_COMMANDS.filter((entry) => entry.name === "Client bundle analysis").length, 1);
  assert.equal(RELEASE_COMMANDS.filter((entry) => !entry.required).length, 2);
  assert.deepEqual(RELEASE_COMMANDS.filter((entry) => !entry.required).map((entry) => entry.name), [
    "Historical aggregate JavaScript diagnostic",
    "External owner-readiness diagnostic",
  ]);
  const serialized = JSON.stringify(RELEASE_COMMANDS);
  assert.doesNotMatch(serialized, /https?:\/\/|curl|wget|netlify|cloudflare|deploy|&&|\|\|/i);
});

test("cross-platform npm execution does not require a shell", () => {
  assert.equal(npmExecutable("win32"), "npm.cmd");
  assert.equal(npmExecutable("linux"), "npm");
  assert.equal(npmExecutable("darwin"), "npm");
  assert.deepEqual(npmInvocation({ execPath: "/runtime/node", npmExecPath: "/runtime/npm-cli.js" }), {
    executable: "/runtime/node",
    argsPrefix: ["/runtime/npm-cli.js"],
  });
  assert.throws(() => npmInvocation({ execPath: "node", npmExecPath: "" }), /run the gate through npm run verify:release/);
});

test("successful and failed children preserve ordering and original exit codes", async () => {
  const success = await runFakeChild({ exitCode: 0 });
  assert.equal(success.result.code, 0);
  assert.equal(success.options.shell, false);
  assert.equal(success.options.stdio, "inherit");

  const failure = await runFakeChild({ exitCode: 17 });
  assert.equal(failure.result.code, 17);
});

test("command sequencing advances on success, stops on required failure, and reports the failing command", async () => {
  const calls = [];
  const definitions = [
    { name: "first", args: ["run", "first"], required: true },
    { name: "second", args: ["run", "second"], required: true },
    { name: "never", args: ["run", "never"], required: true },
  ];
  await assert.rejects(
    runCommandSequence(definitions, async (definition) => {
      calls.push(definition.name);
      return { code: definition.name === "second" ? 23 : 0 };
    }),
    (error) => error instanceof ReleaseGateError
      && error.exitCode === 23
      && /second/.test(error.message)
      && error.details.some((entry) => /npm(?:\.cmd)? run second/.test(entry)),
  );
  assert.deepEqual(calls, ["first", "second"]);

  const diagnosticCalls = [];
  const diagnosticResults = await runCommandSequence([
    { name: "diagnostic", args: ["run", "diagnostic"], required: false },
    { name: "required", args: ["run", "required"], required: true },
  ], async (definition) => {
    diagnosticCalls.push(definition.name);
    return { code: definition.required ? 0 : 9 };
  });
  assert.deepEqual(diagnosticCalls, ["diagnostic", "required"]);
  assert.deepEqual(diagnosticResults.map((entry) => entry.code), [9, 0]);
});

test("termination is forwarded once and child listeners are cleaned up", async () => {
  const signalSource = new EventEmitter();
  const child = new FakeChild();
  const promise = runChildCommand({
    executable: "npm",
    args: ["test"],
    cwd: ROOT,
    signalSource,
    output: { write() {} },
    spawnImpl: () => child,
  });
  signalSource.emit("SIGTERM");
  assert.deepEqual(child.kills, ["SIGTERM"]);
  child.emit("exit", null, "SIGTERM");
  const result = await promise;
  assert.equal(result.code, 1);
  assert.equal(result.signal, "SIGTERM");
  assert.equal(signalSource.listenerCount("SIGINT"), 0);
  assert.equal(signalSource.listenerCount("SIGTERM"), 0);
});

test("status parsing reports exact Windows and Linux paths deterministically", () => {
  const parsed = parsePorcelainStatus(" M src\\a.ts\n?? pipeline/new.mjs\nR  old.ts -> src/new.ts\n");
  assert.deepEqual(parsed, [
    { status: " M", path: "src/a.ts" },
    { status: "??", path: "pipeline/new.mjs" },
    { status: "R ", path: "src/new.ts" },
  ]);
  assert.equal(compareStatusEntries(parsed, [...parsed].reverse()).equal, true);
  assert.equal(compareStatusEntries(parsed, parsed.slice(1)).equal, false);
});

test("strict preflight catches tracked and untracked drift while ignored build output is irrelevant", async () => {
  const fixture = await makePreflightFixture();
  try {
    const cleanGit = gitFixture("");
    const clean = inspectRepositoryPreflight(fixture, { git: cleanGit });
    assert.deepEqual(clean.initialStatus, []);
    await mkdir(path.join(fixture, ".next"), { recursive: true });
    await writeFile(path.join(fixture, ".next", "ignored-output"), "ignored", "utf8");
    assert.doesNotThrow(() => inspectRepositoryPreflight(fixture, { git: cleanGit }));
    assert.throws(
      () => inspectRepositoryPreflight(fixture, { git: gitFixture("?? unexpected.json\n") }),
      (error) => error instanceof ReleaseGateError && /clean tracked and untracked worktree/.test(error.message),
    );
    const allowed = inspectRepositoryPreflight(fixture, { allowDirty: true, git: gitFixture(" M package.json\n") });
    assert.equal(allowed.initialStatus[0].path, "package.json");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("preflight rejects source-image changes, exact ads.txt defects, and machine paths", async () => {
  const fixture = await makePreflightFixture();
  try {
    assert.throws(
      () => inspectRepositoryPreflight(fixture, { allowDirty: true, git: gitFixture(" M images/source.png\n") }),
      /source-image changes are prohibited/,
    );
    await writeFile(path.join(fixture, "public", "ads.txt"), "google.com, wrong\n", "utf8");
    assert.throws(() => inspectRepositoryPreflight(fixture, { git: gitFixture("") }), /exact authorized seller record/);
    await writeFile(path.join(fixture, "public", "ads.txt"), "google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0\n", "utf8");
    await mkdir(path.join(fixture, "src"), { recursive: true });
    await writeFile(path.join(fixture, "src", "local.ts"), 'export const local = "C:\\Users\\Person\\repo";\n', "utf8");
    const withSource = gitFixture("", ["src/local.ts"]);
    assert.throws(() => inspectRepositoryPreflight(fixture, { git: withSource }), /machine-specific absolute paths/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("generated cleanliness compares against clean or explicitly accepted initial status without reverting", () => {
  const initial = parsePorcelainStatus(" M package.json\n?? pipeline/tests/new.test.mjs\n");
  assert.deepEqual(verifyGeneratedCleanliness(ROOT, initial, { allowDirty: true, git: gitFixture(" M package.json\n?? pipeline/tests/new.test.mjs\n") }), initial);
  assert.throws(
    () => verifyGeneratedCleanliness(ROOT, initial, { allowDirty: true, git: gitFixture(" M package.json\n?? drift.json\n") }),
    /changed repository paths/,
  );
  assert.throws(() => verifyGeneratedCleanliness(ROOT, [], { git: gitFixture("?? drift.json\n") }), /changed repository paths/);
});

test("protected release summary consumes existing authoritative hashes and export fixtures", () => {
  const result = verifyProtectedContracts(ROOT);
  assert.equal(result.printableCount, 6_352);
  assert.equal(result.protectedHash, EXPECTED_PRINTABLE_RECORD_SHA256);
  assert.equal(result.staticOutputCount, 6_920);
  assert.equal(result.defaultPdfBytes, 613_584);
  assert.equal(result.defaultPdfSha256, "8bab1edb0e18f90800974c16be753d2448a20c6b0a104fbc92e7df774ec82bca");
});

test("governed generated outputs use stable UTF-8 text and contain no local release paths", async () => {
  const files = [
    "pipeline/manifests/trust-ads-readiness.json",
    "pipeline/manifests/crawl-indexation-validation.json",
    "pipeline/manifests/image-sitemap-xml-validation.json",
    "pipeline/reports/trust-ads-readiness.md",
    "pipeline/reports/crawl-indexation-validation.md",
    "pipeline/reports/image-sitemap-xml-validation-report.md",
    "reports/related-printable-quality.md",
    "reports/related-printable-samples.csv",
    "public/image-sitemap.xml",
  ];
  for (const relativePath of files) {
    const buffer = await readFile(path.join(ROOT, relativePath));
    const text = buffer.toString("utf8");
    assert.notEqual(buffer[0], 0xef, `${relativePath}: no UTF-8 BOM`);
    assert.equal(text.includes("\r\n"), false, `${relativePath}: stable LF endings`);
    assert.doesNotMatch(text, /[A-Za-z]:\\Users\\|[A-Za-z]:\/Users\/|\/Users\/[^/]+\/|\/home\/[^/]+\//, relativePath);
  }
  const imageData = JSON.parse(await readFile(path.join(ROOT, "pipeline/manifests/image-sitemap-data.json"), "utf8"));
  const pageUrls = imageData.imageEntries.map((entry) => entry.pageUrl);
  assert.deepEqual(pageUrls, [...pageUrls].sort((left, right) => left.localeCompare(right)));
});

test("technical readiness mode preserves external owner gates without claiming production approval", async () => {
  const source = await readFile(path.join(ROOT, "pipeline", "scripts", "build-trust-ads-readiness.mjs"), "utf8");
  assert.match(source, /VERIFY_TECHNICAL_MODE = process\.argv\.includes\("--verify-technical"\)/);
  assert.match(source, /if \(!technicalPassed \|\| \(VERIFY_MODE && !productionReady\)\) process\.exitCode = 1/);
  assert.match(source, /productionReady/);
});

test("normal test script includes focused release-gate coverage without recursive release execution", async () => {
  const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  for (const script of REQUIRED_PACKAGE_SCRIPTS) assert.equal(typeof packageJson.scripts[script], "string", script);
  assert.match(packageJson.scripts.test, /pipeline\/tests\/release-quality-gate\.test\.mjs/);
  assert.doesNotMatch(packageJson.scripts.test, /verify:release/);
  assert.equal(packageJson.scripts["test:release-gate"], "node --test --test-concurrency=1 pipeline/tests/release-quality-gate.test.mjs");
});

async function runFakeChild({ exitCode }) {
  const signalSource = new EventEmitter();
  const child = new FakeChild();
  let options;
  const promise = runChildCommand({
    executable: "npm",
    args: ["test"],
    cwd: ROOT,
    signalSource,
    output: { write() {} },
    spawnImpl: (_executable, _args, received) => {
      options = received;
      queueMicrotask(() => child.emit("exit", exitCode, null));
      return child;
    },
  });
  return { result: await promise, options };
}

class FakeChild extends EventEmitter {
  killed = false;
  kills = [];

  kill(signal) {
    this.killed = true;
    this.kills.push(signal);
    return true;
  }
}

async function makePreflightFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ilcp-release-gate-"));
  await mkdir(path.join(root, "public"), { recursive: true });
  const scripts = Object.fromEntries(REQUIRED_PACKAGE_SCRIPTS.map((name) => [name, "node fixture.mjs"]));
  await writeFile(path.join(root, "package.json"), `${JSON.stringify({ scripts }, null, 2)}\n`, "utf8");
  await writeFile(path.join(root, "package-lock.json"), "{}\n", "utf8");
  await writeFile(path.join(root, "netlify.toml"), '[build.environment]\n  NODE_VERSION = "22"\n', "utf8");
  await writeFile(path.join(root, "public", "ads.txt"), "google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0\n", "utf8");
  return root;
}

function gitFixture(status, extras = []) {
  const tracked = ["package.json", "package-lock.json", "netlify.toml", "public/ads.txt", ...extras];
  return (_root, args) => {
    const command = args.join(" ");
    if (command === "ls-files -z") return `${tracked.join("\0")}\0`;
    if (command.startsWith("status --porcelain")) return status;
    if (command === "diff --stat --") return " fixture | 1 +";
    throw new Error(`Unexpected Git fixture command: ${command}`);
  };
}
