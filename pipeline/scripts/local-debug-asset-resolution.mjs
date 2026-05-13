import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import vm from "node:vm";
import ts from "typescript";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const DEFAULT_ASSET_ID = "animals__animals-alligator__4feec8505a";
const EXPECTED_ASSET_BASE = "https://assets.ilovecoloringpage.com/coloring-pages";
const EXPECTED_WEBP_URL = `${EXPECTED_ASSET_BASE}/webp/animals/animals-alligator-4feec8505a.webp`;
const EXPECTED_SVG_URL = `${EXPECTED_ASSET_BASE}/svg/animals/animals-alligator-4feec8505a.svg`;
const LOCAL_ORIGIN = "http://localhost:3005";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const assetId = args.assetId || DEFAULT_ASSET_ID;
  const generatedAt = new Date().toISOString();
  const effectiveEnv = await getEffectivePublicEnv();
  const resolver = await loadAssetResolver(effectiveEnv.values);

  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const assetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const hubItems = await readJson("src/generated/coloring/runtime-hub-items.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const searchIndex = await readJson("src/generated/coloring/runtime-search-index.json");

  const item = available.items.find((entry) => entry.assetId === assetId) || null;
  const pathRecord = assetPaths.records.find((entry) => entry.assetId === assetId) || null;
  const hubMembership = hubItems.items.find((entry) => entry.assetId === assetId) || null;
  const searchEntry = searchIndex.entries.find((entry) => entry.assetId === assetId) || null;
  const memberHubs = hubMembership
    ? hubs.hubs
        .filter((hub) => hubMembership.hubIds.includes(hub.hubId))
        .map((hub) => ({ hubId: hub.hubId, slug: hub.slug, route: hub.route, title: hub.title, assetCount: hub.assetCount }))
    : [];

  const resolvedUrls = item ? resolver.resolveColoringItemAssetUrls(item.assetSubpaths) : null;
  const webpUrl = resolvedUrls?.webp || "";
  const svgUrl = resolvedUrls?.svg || "";
  const webpHttp = webpUrl ? await checkUrl(webpUrl) : null;
  const svgHttp = svgUrl ? await checkUrl(svgUrl) : null;
  const svgCors = svgUrl ? await checkUrl(svgUrl, { Origin: LOCAL_ORIGIN }) : null;

  const payload = {
    generatedAt,
    runId: "local-preview-animals-alligator-trace",
    assetId,
    expected: {
      webpUrl: EXPECTED_WEBP_URL,
      svgUrl: EXPECTED_SVG_URL,
      svgCorsOrigin: LOCAL_ORIGIN,
    },
    effectivePublicEnv: effectiveEnv.redacted,
    sourceItemRecord: item,
    runtimeAvailableItemRecord: item,
    runtimeAssetPathRecord: pathRecord,
    hubMembership,
    hubMembershipDetails: memberHubs,
    currentGalleryItemData: item
      ? {
          assetId: item.assetId,
          title: item.title,
          altText: item.altText,
          assetSubpaths: item.assetSubpaths,
        }
      : null,
    searchEntry,
    resolvedUrls: {
      webpRelativePath: item?.assetSubpaths.webpPreview || null,
      webpAbsoluteUrl: webpUrl || null,
      svgRelativePath: item?.assetSubpaths.svg || null,
      svgAbsoluteUrl: svgUrl || null,
      pngFallbackPath: item?.assetSubpaths.pngPreview || null,
      pngFallbackUrl: resolvedUrls?.png || null,
      previewUrl: resolvedUrls?.preview || null,
      fallbackPreviewUrl: resolvedUrls?.previewFallback || null,
    },
    http: {
      webp: webpHttp,
      svg: svgHttp,
      svgCorsWithLocalOrigin: svgCors,
    },
    summary: {
      itemFound: Boolean(item),
      runtimeAssetPathFound: Boolean(pathRecord),
      hubMembershipFound: Boolean(hubMembership),
      webpUrlMatchesExpected: webpUrl === EXPECTED_WEBP_URL,
      svgUrlMatchesExpected: svgUrl === EXPECTED_SVG_URL,
      webpHttpOk: webpHttp?.ok || false,
      svgHttpOk: svgHttp?.ok || false,
      svgCorsAllowsLocalOrigin: Boolean(svgCors?.accessControlAllowOrigin && svgCors.accessControlAllowOrigin !== ""),
      duplicateColoringPagesPrefix: /coloring-pages\/coloring-pages/i.test(`${webpUrl}\n${svgUrl}`),
      localUrlUsed: /localhost|127\.0\.0\.1|::1/i.test(`${webpUrl}\n${svgUrl}`),
      r2DevUsed: /\.r2\.dev/i.test(`${webpUrl}\n${svgUrl}`),
    },
  };

  await writeJson("pipeline/manifests/local-preview-animals-alligator-trace.json", payload);
  await writeText("pipeline/reports/local-preview-animals-alligator-trace.md", renderReport(payload));
  console.log(JSON.stringify(payload.summary, null, 2));
}

async function checkUrl(url, headers = {}) {
  try {
    const response = await fetch(url, { headers, redirect: "manual" });
    await response.arrayBuffer();
    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      cacheControl: response.headers.get("cache-control") || "",
      accessControlAllowOrigin: response.headers.get("access-control-allow-origin") || "",
      location: response.headers.get("location") || "",
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      contentType: "",
      cacheControl: "",
      accessControlAllowOrigin: "",
      location: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function loadAssetResolver(env) {
  const source = await readText("src/lib/coloring/assets.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    compiled,
    {
      module,
      exports: module.exports,
      process: { env },
      URL,
      encodeURIComponent,
      Set,
    },
    { filename: "assets.ts" },
  );
  return module.exports;
}

async function getEffectivePublicEnv() {
  const fileValues = await readDotEnvPublicValues(".env.local");
  const values = {
    ...fileValues,
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("NEXT_PUBLIC_"))),
  };
  return {
    values,
    redacted: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        /SECRET|KEY|TOKEN|PASSWORD/i.test(key) ? "[redacted]" : value,
      ]),
    ),
  };
}

async function readDotEnvPublicValues(relativePath) {
  try {
    const raw = await readText(relativePath);
    const values = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
    return values;
  } catch {
    return {};
  }
}

function renderReport(payload) {
  return [
    "# Local Preview Animals Alligator Trace",
    "",
    `- Asset ID: \`${payload.assetId}\``,
    `- WebP URL: \`${payload.resolvedUrls.webpAbsoluteUrl || "missing"}\``,
    `- SVG URL: \`${payload.resolvedUrls.svgAbsoluteUrl || "missing"}\``,
    `- WebP matches expected: ${payload.summary.webpUrlMatchesExpected}`,
    `- SVG matches expected: ${payload.summary.svgUrlMatchesExpected}`,
    `- WebP HTTP: ${payload.http.webp?.status ?? "not_run"} ${payload.http.webp?.contentType || ""}`,
    `- SVG HTTP: ${payload.http.svg?.status ?? "not_run"} ${payload.http.svg?.contentType || ""}`,
    `- SVG CORS for ${LOCAL_ORIGIN}: ${payload.http.svgCorsWithLocalOrigin?.accessControlAllowOrigin || "missing"}`,
    `- Local URL used: ${payload.summary.localUrlUsed}`,
    `- Duplicate prefix: ${payload.summary.duplicateColoringPagesPrefix}`,
    `- R2 dev URL used: ${payload.summary.r2DevUsed}`,
  ].join("\n");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, payload) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${text.replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--asset-id") parsed.assetId = argv[++index];
  }
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
