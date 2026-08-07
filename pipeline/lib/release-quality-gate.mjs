import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const AUTHORITATIVE_NODE_MAJOR = "22";
export const EXPECTED_ADS_TXT = "google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0";
export const EXPECTED_PRINTABLE_COUNT = 6_352;
export const EXPECTED_STATIC_OUTPUT_COUNT = 6_920;
export const EXPECTED_PRINTABLE_RECORD_SHA256 = "4fc394e39aa4d8e2b0e2e96ebbc586d00c91e5e18479748b72dbb6075e77bed6";

export const REQUIRED_PACKAGE_SCRIPTS = Object.freeze([
  "build",
  "test",
  "typecheck",
  "verify:release",
  "test:release-gate",
  "validate:static-routes",
  "validate:accessibility",
  "validate:crawl",
  "validate:internal-links",
  "validate:image-sitemap",
  "validate:export-safety",
  "validate:page-layout",
  "validate:refinement",
  "validate:punctuation",
  "audit:performance-accessibility",
  "audit:client-bundle",
  "verify:technical-readiness",
]);

export const RELEASE_COMMANDS = Object.freeze([
  command("Type validation", ["run", "typecheck"]),
  // Several full-suite tests inspect .next/ and out/, so the governed build is their real prerequisite.
  command("Production build", ["run", "build"]),
  command("Full tests", ["test"]),
  command("Static routes", ["run", "validate:static-routes"]),
  command("Accessibility", ["run", "validate:accessibility"]),
  command("Crawl and indexation", ["run", "validate:crawl"]),
  command("Internal links", ["run", "validate:internal-links"]),
  command("Image sitemap", ["run", "validate:image-sitemap"]),
  command("Export safety", ["run", "validate:export-safety"]),
  command("Public page layout", ["run", "validate:page-layout"]),
  command("Refinement contracts", ["run", "validate:refinement"]),
  command("Public punctuation", ["run", "validate:punctuation"]),
  command("Accepted payload budgets", ["run", "audit:performance-accessibility", "--", "--label", "ci-release-quality-gate"]),
  command("Client bundle analysis", ["run", "audit:client-bundle", "--", "--label", "ci-release-quality-gate"]),
  command("Technical production readiness", ["run", "verify:technical-readiness"]),
  diagnostic("Historical aggregate JavaScript diagnostic", ["run", "validate:payload"]),
  diagnostic("External owner-readiness diagnostic", ["run", "verify:production-readiness"]),
]);

export class ReleaseGateError extends Error {
  constructor(message, { exitCode = 1, details = [] } = {}) {
    super(message);
    this.name = "ReleaseGateError";
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function npmExecutable(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function npmInvocation({ execPath = process.execPath, npmExecPath = process.env.npm_execpath } = {}) {
  if (!npmExecPath) {
    throw new ReleaseGateError("Unable to locate npm's CLI entry point; run the gate through npm run verify:release.", { exitCode: 2 });
  }
  return { executable: execPath, argsPrefix: [npmExecPath] };
}

export function formatCommand(executable, args) {
  return [executable, ...args].map((value) => (/\s/.test(value) ? JSON.stringify(value) : value)).join(" ");
}

export function parsePorcelainStatus(source) {
  if (!source.trim()) return [];
  return source.trimEnd().split(/\r?\n/).map((line) => ({
    status: line.slice(0, 2),
    path: normalizeStatusPath(line.slice(3)),
  }));
}

export function compareStatusEntries(before, after) {
  const serialize = (entries) => entries.map((entry) => `${entry.status} ${entry.path}`).sort();
  const left = serialize(before);
  const right = serialize(after);
  return {
    equal: left.length === right.length && left.every((entry, index) => entry === right[index]),
    before: left,
    after: right,
  };
}

export function runChildCommand({
  executable,
  args,
  cwd,
  spawnImpl = spawn,
  signalSource = process,
  output = process.stdout,
}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawnImpl(executable, args, {
      cwd,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });
    const forwardedSignals = ["SIGINT", "SIGTERM"];
    const handlers = new Map();

    const cleanup = () => {
      for (const [signal, handler] of handlers) signalSource.off(signal, handler);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    for (const signal of forwardedSignals) {
      const handler = () => {
        output.write(`\n[release-gate] Forwarding ${signal} to ${formatCommand(executable, args)}\n`);
        if (!child.killed) child.kill(signal);
      };
      handlers.set(signal, handler);
      signalSource.on(signal, handler);
    }

    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => finish({ code: code ?? 1, signal: signal ?? null }));
  });
}

export async function runCommandSequence(definitions, execute, { onResult = () => {} } = {}) {
  const results = [];
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    const result = await execute(definition, index);
    const entry = { definition, ...result };
    results.push(entry);
    onResult(entry);
    if (result.code !== 0 && definition.required) {
      throw new ReleaseGateError(`Required release stage failed: ${definition.name}.`, {
        exitCode: result.code,
        details: [`Command: ${formatCommand(npmExecutable(), definition.args)}`, `Exit code: ${result.code}`],
      });
    }
  }
  return results;
}

export function inspectRepositoryPreflight(root, { allowDirty = false, git = defaultGit } = {}) {
  const packagePath = path.join(root, "package.json");
  const lockPath = path.join(root, "package-lock.json");
  if (!existsSync(packagePath)) throw new ReleaseGateError("Repository preflight failed: package.json is missing.", { exitCode: 2 });
  if (!existsSync(lockPath)) throw new ReleaseGateError("Repository preflight failed: package-lock.json is missing.", { exitCode: 2 });

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const missingScripts = REQUIRED_PACKAGE_SCRIPTS.filter((name) => !packageJson.scripts?.[name]);
  if (missingScripts.length) {
    throw new ReleaseGateError("Repository preflight failed: required package scripts are missing.", {
      exitCode: 2,
      details: missingScripts,
    });
  }

  const tracked = git(root, ["ls-files", "-z"]).split("\0").filter(Boolean).map(normalizePath);
  const prohibitedTracked = tracked.filter((file) =>
    /^(?:\.next|out|node_modules)\//.test(file)
    || /(?:^|\/)\.env$/.test(file)
    || /(?:^|\/)(?:id_rsa|id_ed25519)$/.test(file)
    || /\.(?:pem|key|p12|pfx)$/i.test(file),
  );
  if (prohibitedTracked.length) {
    throw new ReleaseGateError("Repository preflight failed: prohibited tracked files were found.", {
      exitCode: 2,
      details: prohibitedTracked,
    });
  }

  const status = parsePorcelainStatus(git(root, ["status", "--porcelain=v1", "--untracked-files=all"]));
  const sourceImageChanges = status.filter((entry) => entry.path === "images" || entry.path.startsWith("images/"));
  if (sourceImageChanges.length) {
    throw new ReleaseGateError("Repository preflight failed: source-image changes are prohibited.", {
      exitCode: 2,
      details: sourceImageChanges.map((entry) => `${entry.status} ${entry.path}`),
    });
  }
  if (!allowDirty && status.length) {
    throw new ReleaseGateError("Repository preflight failed: strict mode requires a clean tracked and untracked worktree.", {
      exitCode: 2,
      details: status.map((entry) => `${entry.status} ${entry.path}`),
    });
  }

  const adsTxt = readFileSync(path.join(root, "public", "ads.txt"), "utf8");
  if (adsTxt !== `${EXPECTED_ADS_TXT}\n` && adsTxt !== EXPECTED_ADS_TXT) {
    throw new ReleaseGateError("Repository preflight failed: public/ads.txt is not the exact authorized seller record.", { exitCode: 2 });
  }
  if (adsTxt.charCodeAt(0) === 0xfeff || adsTxt.split(/\r?\n/).filter(Boolean).length !== 1) {
    throw new ReleaseGateError("Repository preflight failed: public/ads.txt contains a BOM or duplicate line.", { exitCode: 2 });
  }

  const netlify = readFileSync(path.join(root, "netlify.toml"), "utf8");
  const nodeMatch = netlify.match(/NODE_VERSION\s*=\s*"(\d+)"/);
  if (nodeMatch?.[1] !== AUTHORITATIVE_NODE_MAJOR) {
    throw new ReleaseGateError(`Repository preflight failed: Netlify Node major must remain ${AUTHORITATIVE_NODE_MAJOR}.`, { exitCode: 2 });
  }

  const changedFiles = status.map((entry) => entry.path);
  const activeFiles = [...new Set([...tracked, ...changedFiles])].filter((file) =>
    file === "package.json"
    || file.startsWith(".github/")
    || file.startsWith("app/")
    || file.startsWith("src/")
    || file.startsWith("pipeline/lib/")
    || file.startsWith("pipeline/scripts/"),
  ).filter((file) => /\.(?:c?js|mjs|json|md|ts|tsx|ya?ml)$/.test(file));
  const pathFindings = findMachineSpecificPaths(root, activeFiles);
  if (pathFindings.length) {
    throw new ReleaseGateError("Repository preflight failed: machine-specific absolute paths were found in active files.", {
      exitCode: 2,
      details: pathFindings,
    });
  }

  return { initialStatus: status, trackedFileCount: tracked.length, nodeMajor: nodeMatch[1] };
}

export function verifyProtectedContracts(root) {
  const runtime = readJson(root, "src/generated/coloring/runtime-printables.json");
  const routeIndex = readJson(root, "src/generated/coloring/runtime-printable-route-index.json");
  const routeManifest = readJson(root, "pipeline/manifests/runtime-printable-route-manifest.json");
  const crawl = readJson(root, "pipeline/manifests/crawl-indexation-validation.json");
  const imageSitemap = readJson(root, "pipeline/manifests/image-sitemap-data.json");
  const trust = readJson(root, "pipeline/manifests/trust-ads-readiness.json");
  const baseline = readJson(root, "pipeline/tests/fixtures/printable-paper-profile-baseline.json");

  assertContract(runtime.summary.recordCount === EXPECTED_PRINTABLE_COUNT, "runtime printable count");
  assertContract(runtime.records.length === EXPECTED_PRINTABLE_COUNT, "runtime printable records");
  assertContract(runtime.summary.recordSha256 === EXPECTED_PRINTABLE_RECORD_SHA256, "runtime printable protected hash");
  assertContract(routeIndex.summary.entryCount === EXPECTED_PRINTABLE_COUNT, "route-index count");
  assertContract(routeIndex.summary.recordSha256 === EXPECTED_PRINTABLE_RECORD_SHA256, "route-index protected hash");
  assertContract(routeManifest.summary.routeCount === EXPECTED_PRINTABLE_COUNT, "frozen route count");
  assertContract(routeManifest.summary.recordSha256 === EXPECTED_PRINTABLE_RECORD_SHA256, "frozen route protected hash");
  assertContract(crawl.summary.passed === true && crawl.summary.canonicalMismatchCount === 0, "crawl/canonical validation");
  assertContract(crawl.summary.printableHtmlCount === EXPECTED_PRINTABLE_COUNT, "static printable count");
  assertContract(imageSitemap.summary.imageEntryCount === EXPECTED_PRINTABLE_COUNT, "image sitemap count");
  assertContract(imageSitemap.summary.publicWebpOnly === true && imageSitemap.summary.svgUrlsExcluded === true, "WebP-only public image contract");
  assertContract(trust.counts.staticOutputs === EXPECTED_STATIC_OUTPUT_COUNT, "static output count");
  assertContract(trust.adsTxtStatus.exactAuthorizedSellerRecord === true, "ads.txt readiness contract");
  assertContract(baseline.defaultProfile.pdfPoints.join("x") === "612x792", "default Letter PDF MediaBox");
  assertContract(baseline.defaultProfile.rasterPixels.join("x") === "2550x3300", "default Letter raster size");
  assertContract(baseline.defaultProfile.pdfImage.filter === "FlateDecode", "default PDF compression");

  return {
    printableCount: runtime.summary.recordCount,
    protectedHash: runtime.summary.recordSha256,
    staticOutputCount: trust.counts.staticOutputs,
    defaultPdfBytes: baseline.representativeOutputs[0].pdfBytes,
    defaultPdfSha256: baseline.representativeOutputs[0].pdfSha256,
  };
}

export function verifyGeneratedCleanliness(root, initialStatus, { allowDirty = false, git = defaultGit } = {}) {
  const finalStatus = parsePorcelainStatus(git(root, ["status", "--porcelain=v1", "--untracked-files=all"]));
  const comparison = compareStatusEntries(allowDirty ? initialStatus : [], finalStatus);
  if (!comparison.equal) {
    let diffStat = "";
    try {
      diffStat = git(root, ["diff", "--stat", "--"]);
    } catch {
      diffStat = "Unable to collect git diff --stat.";
    }
    throw new ReleaseGateError("Generated-output cleanliness failed: the release gate changed repository paths.", {
      details: [
        `Initial: ${comparison.before.length ? comparison.before.join(", ") : "clean"}`,
        `Final: ${comparison.after.length ? comparison.after.join(", ") : "clean"}`,
        diffStat.trim(),
      ].filter(Boolean),
    });
  }
  return finalStatus;
}

function command(name, args) {
  return Object.freeze({ name, args: Object.freeze(args), required: true });
}

function diagnostic(name, args) {
  return Object.freeze({ name, args: Object.freeze(args), required: false });
}

function defaultGit(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function assertContract(condition, label) {
  if (!condition) throw new ReleaseGateError(`Protected-contract verification failed: ${label}.`);
}

function findMachineSpecificPaths(root, files) {
  const drivePattern = new RegExp(String.raw`(?:^|[^A-Za-z0-9])([A-Za-z]:[\\/](?:Users|home|PROJECTS-and-WORK|projects|tmp)[\\/][^\s"'\x60]+)`, "g");
  const posixPrefixes = [`/${"Users"}/`, `/${"home"}/`];
  const findings = [];
  for (const file of files) {
    const absolute = path.join(root, file);
    if (!existsSync(absolute)) continue;
    const source = readFileSync(absolute, "utf8");
    for (const match of source.matchAll(drivePattern)) findings.push(`${file}: ${match[1]}`);
    for (const prefix of posixPrefixes) {
      const index = source.indexOf(prefix);
      if (index >= 0) findings.push(`${file}: ${source.slice(index, source.indexOf("\n", index) >= 0 ? source.indexOf("\n", index) : undefined).trim()}`);
    }
  }
  return findings;
}

function normalizeStatusPath(value) {
  const renamed = value.includes(" -> ") ? value.split(" -> ").at(-1) : value;
  return normalizePath(renamed.replace(/^"|"$/g, ""));
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}
