const { execFile } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SITE_NAME",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_COLORING_ASSET_BASE_URL",
  "NEXT_PUBLIC_CONTACT_EMAIL",
  "NEXT_PUBLIC_SITE_OWNER_NAME",
  "NEXT_PUBLIC_SITE_JURISDICTION",
];

async function readText(relativePath) {
  return fsp.readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function writeJson(relativePath, value) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
  await fsp.writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
  await fsp.writeFile(absolutePath, value.endsWith("\n") ? value : `${value}\n`);
}

async function listFilesIfExists(root) {
  try {
    await fsp.access(root);
  } catch {
    return [];
  }

  const results = [];
  async function walk(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
    if (!fs.existsSync(absoluteRoot)) continue;
    const rootStat = await fsp.stat(absoluteRoot);
    if (rootStat.isFile()) {
      chunks.push(await readText(relativeRoot));
      continue;
    }

    for (const file of await listFilesIfExists(absoluteRoot)) {
      const normalized = normalizePath(file);
      if (!/\.(?:ts|tsx|css|json|md|xml|mjs|cjs)$/.test(normalized)) continue;
      if (options.skipGeneratedColoring && normalized.startsWith("src/generated/coloring/")) continue;
      if (options.skipReview && normalized.startsWith("pipeline/review/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function execFileLogged(command, args, options = {}) {
  const executable = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command)
    ? process.env.ComSpec || "cmd.exe"
    : command;
  const executableArgs = executable === command
    ? args
    : ["/d", "/s", "/c", [command, ...args].map(quoteCmdArg).join(" ")];
  const { stdout, stderr } = await execFileAsync(executable, executableArgs, {
    cwd: REPO_ROOT,
    maxBuffer: 1024 * 1024 * 64,
    ...options,
  });
  return { stdout, stderr };
}

function quoteCmdArg(value) {
  const stringValue = String(value);
  if (!/[\s"&<>|^]/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '\\"')}"`;
}

async function git(args) {
  return execFileLogged("git", args);
}

async function gitStatusFor(relativePath) {
  const { stdout } = await git(["status", "--short", "--", relativePath]);
  return stdout;
}

async function getGitContext() {
  const [topLevel, branch, status] = await Promise.all([
    git(["rev-parse", "--show-toplevel"]).then((result) => result.stdout.trim()),
    git(["branch", "--show-current"]).then((result) => result.stdout.trim()),
    git(["status", "--short", "--branch"]).then((result) => result.stdout.trim()),
  ]);
  return { topLevel, branch, status };
}

async function ensureStaticExport(options = {}) {
  const outDir = path.join(REPO_ROOT, "out");
  const indexPath = path.join(outDir, "index.html");
  if (!options.force && fs.existsSync(indexPath)) {
    return { buildRan: false, outDir };
  }

  await fsp.rm(outDir, { recursive: true, force: true });
  const env = { ...process.env };
  for (const key of PUBLIC_ENV_KEYS) delete env[key];

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const startedAt = new Date().toISOString();
  await execFileLogged(npmCommand, ["run", "build"], { env, timeout: 1000 * 60 * 8 });
  return { buildRan: true, outDir, startedAt, finishedAt: new Date().toISOString() };
}

async function startStaticServer(rootDir) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const filePath = await resolveStaticPath(rootDir, url.pathname);
      if (!filePath) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(200, { "content-type": getMimeType(filePath) });
      fs.createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : "Server error");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function installStaticExportRoutes(context, rootDir, origin = "https://www.ilovecoloringpage.com") {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  await context.route(`${normalizedOrigin}/**`, async (route) => {
    const requestUrl = new URL(route.request().url());
    const filePath = await resolveStaticPath(rootDir, requestUrl.pathname);
    if (!filePath) {
      await route.fulfill({
        status: 404,
        contentType: "text/plain; charset=utf-8",
        body: "Not found in local static export",
      });
      return;
    }

    await route.fulfill({
      status: 200,
      path: filePath,
      contentType: getMimeType(filePath),
    });
  });
  return normalizedOrigin;
}

async function resolveStaticPath(rootDir, pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const safePath = decodedPath.replace(/^\/+/, "");
  const candidates = [];
  if (!safePath) {
    candidates.push(path.join(rootDir, "index.html"));
  } else {
    candidates.push(path.join(rootDir, safePath));
    if (/\.__PAGE__\.txt$/i.test(safePath)) {
      candidates.push(path.join(rootDir, safePath.replace(/\.(__PAGE__\.txt)$/i, path.sep + "$1")));
    }
    candidates.push(path.join(rootDir, `${safePath}.html`));
    candidates.push(path.join(rootDir, safePath, "index.html"));
  }

  const normalizedRoot = path.resolve(rootDir);
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(normalizedRoot)) continue;
    try {
      const stats = await fsp.stat(resolved);
      if (stats.isFile()) return resolved;
    } catch {
      continue;
    }
  }
  return null;
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "application/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".xml") return "application/xml; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".png") return "image/png";
  return "application/octet-stream";
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function countMatches(value, regex) {
  return [...value.matchAll(regex)].length;
}

function passFail(value) {
  return value ? "pass" : "fail";
}

function renderTable(rows) {
  return [
    "| Check | Result |",
    "| --- | --- |",
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
  ].join("\n");
}

module.exports = {
  REPO_ROOT,
  countMatches,
  ensureStaticExport,
  execFileLogged,
  getGitContext,
  git,
  gitStatusFor,
  installStaticExportRoutes,
  listFilesIfExists,
  normalizePath,
  passFail,
  readJson,
  readProjectText,
  readText,
  renderTable,
  startStaticServer,
  writeJson,
  writeText,
};
