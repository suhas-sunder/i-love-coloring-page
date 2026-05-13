import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

import ts from "typescript";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ROUND4F_RUN_ID = "round-4f-frontend-only-netlify-static";

const ROUND4F_MANIFESTS = [
  "pipeline/manifests/round-4f-runtime-dependency-audit.json",
  "pipeline/manifests/round-4f-deployment-mode-decision.json",
  "pipeline/manifests/round-4f-netlify-deployment-plan.json",
  "pipeline/manifests/round-4f-static-export-checks.json",
  "pipeline/manifests/round-4f-frontend-asset-contract.json",
  "pipeline/manifests/round-4f-backend-deferral-plan.json",
];

test("Round 4F manifests parse and select frontend-only static export", async () => {
  for (const manifestPath of ROUND4F_MANIFESTS) {
    const manifest = await readJson(manifestPath);
    assert.equal(manifest.runId, ROUND4F_RUN_ID, manifestPath);
  }

  const decision = await readJson("pipeline/manifests/round-4f-deployment-mode-decision.json");
  const checks = await readJson("pipeline/manifests/round-4f-static-export-checks.json");
  const assetContract = await readJson("pipeline/manifests/round-4f-frontend-asset-contract.json");

  assert.equal(decision.selectedDeploymentMode, "static-export");
  assert.equal(decision.productionBackendRequired, false);
  assert.equal(decision.netlifyPublishDirectory, "out");
  assert.equal(checks.staticExportSupported, true);
  assert.equal(checks.productionRouteHandlersRemaining, 0);
  assert.equal(assetContract.productionAssetBaseUrlVariable, "NEXT_PUBLIC_COLORING_ASSET_BASE_URL");
  assert.equal(assetContract.productionApiRouteDependency, false);
});

test("Netlify and Next config match static export deployment mode", async () => {
  const nextConfig = await readText("next.config.mjs");
  const netlify = await readText("netlify.toml");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(nextConfig, /trailingSlash:\s*true/);
  assert.match(nextConfig, /unoptimized:\s*true/);
  assert.match(netlify, /command\s*=\s*"npm run build"/);
  assert.match(netlify, /publish\s*=\s*"out"/);
  assert.doesNotMatch(netlify, /functions|serverless|edge_functions/i);
  assert.match(netlify, /NEXT_PUBLIC_COLORING_ASSET_BASE_URL/);
});

test("production app has no API route, middleware, or server runtime dependency for gallery assets", async () => {
  const appFiles = await listFiles(path.join(REPO_ROOT, "app"), [".ts", ".tsx"]);
  const relativeAppFiles = appFiles.map((file) => normalizePath(path.relative(REPO_ROOT, file)));
  const routeHandlers = relativeAppFiles.filter((file) => file.endsWith("/route.ts") || file.endsWith("/route.tsx"));

  assert.deepEqual(routeHandlers, []);
  assert.equal(relativeAppFiles.some((file) => file === "middleware.ts" || file.endsWith("/middleware.ts")), false);

  for (const file of appFiles) {
    const relative = normalizePath(path.relative(REPO_ROOT, file));
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /NextRequest|NextResponse|cookies\(|headers\(|node:fs|fs\/promises|runtime\s*=|force-dynamic/i, relative);
  }
});

test("asset resolver is CDN-only in production and returns unavailable state without a base URL", async () => {
  const withCdn = await loadAssetResolver({
    NEXT_PUBLIC_COLORING_ASSET_BASE_URL: "https://cdn.example.com/coloring///",
    NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY: "1",
  });
  assert.equal(
    withCdn.resolveColoringAssetUrl("svg/animals/animals-alligator-4feec8505a.svg"),
    "https://cdn.example.com/coloring/svg/animals/animals-alligator-4feec8505a.svg",
  );
  assert.equal(withCdn.resolveColoringAssetUrl("thumbs/animals/file thumb.png"), "https://cdn.example.com/coloring/thumbs/animals/file%20thumb.png");
  assert.equal(withCdn.normalizeAssetSubpath("../animals/file.svg"), null);
  assert.equal(withCdn.normalizeAssetSubpath("svg\\animals\\file.svg"), null);

  const withoutCdn = await loadAssetResolver({ NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY: "1" });
  assert.equal(withoutCdn.hasConfiguredColoringAssetSource(), false);
  assert.equal(withoutCdn.resolveColoringAssetUrl("svg/animals/file.svg"), null);
});

test("public routes remain Phase 1 only and no per-image routes are created", async () => {
  const routes = await readJson("src/generated/coloring/routes.json");
  const hubs = await readJson("src/generated/coloring/hubs.json");
  const phase2 = await readJson("pipeline/manifests/round-4a-phase-2-hub-backlog.json");
  const routedSlugs = new Set(routes.routes.map((route) => route.slug).filter(Boolean));

  assert.equal(routes.routes.length, 65);
  assert.equal(routes.phase2RoutesExcluded, true);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(hubs.summary.phase1Only, true);
  for (const hub of phase2.hubs) {
    assert.equal(routedSlugs.has(hub.slug), false, hub.slug);
  }

  const appFiles = (await listFiles(path.join(REPO_ROOT, "app"), [".ts", ".tsx"])).map((file) => normalizePath(path.relative(REPO_ROOT, file)));
  assert.equal(appFiles.some((file) => /\/\[assetId\]\/|\/\[image/.test(file)), false);
  assert.equal(appFiles.some((file) => /\/image\//.test(file)), false);
});

test("hub pagination is static-path based and generated at build time", async () => {
  const hubPage = await readText("app/coloring-pages/[hubSlug]/page.tsx");
  const pagedHubPage = await readText("app/coloring-pages/[hubSlug]/page/[page]/page.tsx");
  const pagination = await readText("src/components/coloring/Pagination.tsx");

  assert.match(hubPage, /export const dynamicParams = false/);
  assert.match(hubPage, /generateStaticParams/);
  assert.doesNotMatch(hubPage, /searchParams/);
  assert.match(pagedHubPage, /export const dynamicParams = false/);
  assert.match(pagedHubPage, /generateStaticParams/);
  assert.match(pagedHubPage, /getStaticHubPageParams/);
  assert.doesNotMatch(pagination, /\?page=/);
  assert.match(pagination, /\/page\/\$\{page\}/);
});

test("generated data is used and client-facing data contains no local paths", async () => {
  const dataSource = await readText("src/lib/coloring/data.ts");
  assert.match(dataSource, /@\/generated\/coloring\/(?:runtime-)?hubs\.json/);
  assert.match(dataSource, /@\/generated\/coloring\/(?:runtime-available-)?items\.json/);
  assert.match(dataSource, /@\/generated\/coloring\/(?:runtime-)?routes\.json/);

  for (const generatedPath of [
    "src/generated/coloring/items.json",
    "src/generated/coloring/hubs.json",
    "src/generated/coloring/hub-items.json",
    "src/generated/coloring/routes.json",
    "src/generated/coloring/runtime-available-items.json",
    "src/generated/coloring/runtime-hubs.json",
    "src/generated/coloring/runtime-hub-items.json",
    "src/generated/coloring/runtime-routes.json",
  ]) {
    const text = await readText(generatedPath);
    assert.doesNotMatch(text, /[A-Za-z]:[\\/]|pipeline\/production\/full|images\/|ilovesvg\/|sourceRelativePath/i, generatedPath);
  }
});

test("production assets are not copied into public and source repositories are unchanged", async () => {
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  assert.equal(publicFiles.some((file) => /pipeline[\\/]+production/i.test(file)), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);

  const inventory = await readJson("pipeline/manifests/image-inventory.json");
  for (const entry of inventory.entries) {
    const sourceStat = await stat(path.join(REPO_ROOT, ...entry.sourceRelativePath.split("/")));
    assert.equal(Number(sourceStat.size), Number(entry.fileSizeBytes), entry.sourceRelativePath);
  }

  assert.equal((await gitStatusFor("images")).trim(), "");
  assert.equal((await gitStatusFor("ilovesvg")).trim(), "");
  assert.equal((await gitStatusFor("pipeline/production/full")).trim(), "");
});

test("no backend, upload, credential, auth, database, or payment dependency is added", async () => {
  const packageJson = await readJson("package.json");
  const dependencyNames = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
  for (const forbidden of ["@netlify/functions", "stripe", "@stripe/stripe-js", "next-auth", "supabase", "@supabase/supabase-js", "prisma", "@prisma/client"]) {
    assert.equal(dependencyNames.includes(forbidden), false, forbidden);
  }

  const scannedFiles = [
    "netlify.toml",
    "pipeline/reports/round-4f-netlify-deployment-plan.md",
    "pipeline/reports/round-4f-asset-runtime-plan.md",
    "pipeline/manifests/round-4f-netlify-deployment-plan.json",
    "pipeline/manifests/round-4f-frontend-asset-contract.json",
  ];
  for (const file of scannedFiles) {
    const text = await readText(file);
    assert.doesNotMatch(text, /aws\s+s3|gsutil|rclone|azcopy|doctl|spaces|wrangler\s+r2|curl\s+-T/i, file);
    assert.doesNotMatch(text, /access_key|private_key|api[_-]?key\s*=|token\s*=|secret/i, file);
  }

  const envExample = await readText(".env.example");
  for (const variableName of [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_R2_BUCKET",
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_ENDPOINT",
  ]) {
    assert.match(envExample, new RegExp(`^${variableName}=`, "m"));
    assert.match(envExample, new RegExp(`^${variableName}=$`, "m"));
  }
  assert.doesNotMatch(envExample, /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|token\s*=\S+/i);
});

async function loadAssetResolver(env) {
  const source = await readText("src/lib/coloring/assets.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    process: { env },
    URL,
    encodeURIComponent,
  };
  vm.runInNewContext(compiled, context, { filename: "assets.ts" });
  return module.exports;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFiles(root, extensions) {
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if ([".git", ".next", "node_modules", "images", "ilovesvg", "out"].includes(entry.name)) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (extensions.includes(path.extname(entry.name))) {
        results.push(entryPath);
      }
    }
  }
  await walk(root);
  return results;
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }
  return (await listFiles(root, [".png", ".svg", ".jpg", ".jpeg", ".webp", ".json"])).map((file) => path.relative(root, file));
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}
