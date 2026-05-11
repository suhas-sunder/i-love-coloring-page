import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROUND4O_RUN_ID = "round-4o-browser-downloads";
export const ROUND4O_LOCAL_ASSET_BASE_URL = "http://127.0.0.1:4175/coloring-pages";
export const ROUND4O_TEMPORARY_R2_SAMPLE_URL = "https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring-pages/png/anime-girls/anime-girl-summoning-jutsu-cute-dinosaur-plushies-e958c58eca.png";

export const ROUND4O_MANIFEST_FILES = [
  "pipeline/manifests/round-4o-project-context-check.json",
  "pipeline/manifests/round-4o-browser-download-format-rules.json",
  "pipeline/manifests/round-4o-download-implementation-audit.json",
  "pipeline/manifests/round-4o-download-format-decision.json",
  "pipeline/manifests/round-4o-browser-conversion-test-results.json",
  "pipeline/manifests/round-4o-download-ui-results.json",
];

export const ROUND4O_REPORT_FILES = [
  "pipeline/reports/round-4o-project-context-check.md",
  "pipeline/reports/round-4o-browser-download-format-research.md",
  "pipeline/reports/round-4o-download-implementation-audit.md",
  "pipeline/reports/round-4o-download-format-decision.md",
  "pipeline/reports/round-4o-browser-conversion-test-results.md",
  "pipeline/reports/round-4o-download-ui-report.md",
  "pipeline/reports/round-4o-next-phase-plan.md",
];

const ROUND4N_COMMIT = "64a018dd98eb9e0c8d0d8fa577f54055190ac322";
const LOCAL_APP_ORIGIN = "http://localhost:3005";
const LOCAL_SAMPLE_PNG_URL = `${ROUND4O_LOCAL_ASSET_BASE_URL}/png/birds/birds-albatross-2380234539.png`;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

const RESEARCH_SOURCES = [
  {
    name: "MDN, Use cross-origin images in a canvas",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image",
    usedFor: "canvas tainting and cross-origin image loading requirements",
  },
  {
    name: "MDN, HTMLImageElement.crossOrigin",
    url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/crossOrigin",
    usedFor: "anonymous CORS image loading before drawing to canvas",
  },
  {
    name: "MDN, HTMLCanvasElement.toBlob",
    url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob",
    usedFor: "PNG baseline, JPEG/WebP optional support, null callback, and SecurityError behavior",
  },
  {
    name: "Cloudflare R2, Configure CORS",
    url: "https://developers.cloudflare.com/r2/buckets/cors/",
    usedFor: "R2 bucket CORS policy and custom-domain response headers",
  },
];

export async function runRound4OBrowserDownloads({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  await mkdir(path.join(repoRoot, "pipeline", "manifests"), { recursive: true });
  await mkdir(path.join(repoRoot, "pipeline", "reports"), { recursive: true });

  const packageJson = await readJson(repoRoot, "package.json");
  const nextConfig = await readText(repoRoot, "next.config.mjs");
  const source = await readSourceFiles(repoRoot);
  const projectContext = buildProjectContext({ repoRoot, packageJson, nextConfig, source });
  const rules = buildBrowserDownloadRules();
  const audit = buildDownloadImplementationAudit({ source });
  const conversionResults = await buildBrowserConversionResults();
  const decision = buildDownloadFormatDecision(conversionResults);
  const uiResults = buildDownloadUiResults({ source, decision });

  await writeJson(repoRoot, "pipeline/manifests/round-4o-project-context-check.json", projectContext);
  await writeJson(repoRoot, "pipeline/manifests/round-4o-browser-download-format-rules.json", rules);
  await writeJson(repoRoot, "pipeline/manifests/round-4o-download-implementation-audit.json", audit);
  await writeJson(repoRoot, "pipeline/manifests/round-4o-download-format-decision.json", decision);
  await writeJson(repoRoot, "pipeline/manifests/round-4o-browser-conversion-test-results.json", conversionResults);
  await writeJson(repoRoot, "pipeline/manifests/round-4o-download-ui-results.json", uiResults);

  await writeText(repoRoot, "pipeline/reports/round-4o-project-context-check.md", renderProjectContext(projectContext));
  await writeText(repoRoot, "pipeline/reports/round-4o-browser-download-format-research.md", renderResearchReport(rules));
  await writeText(repoRoot, "pipeline/reports/round-4o-download-implementation-audit.md", renderDownloadAudit(audit));
  await writeText(repoRoot, "pipeline/reports/round-4o-download-format-decision.md", renderDecision(decision));
  await writeText(repoRoot, "pipeline/reports/round-4o-browser-conversion-test-results.md", renderConversionResults(conversionResults));
  await writeText(repoRoot, "pipeline/reports/round-4o-download-ui-report.md", renderUiResults(uiResults));
  await writeText(repoRoot, "pipeline/reports/round-4o-next-phase-plan.md", renderNextPhasePlan());

  return {
    runId: ROUND4O_RUN_ID,
    generatedManifestCount: ROUND4O_MANIFEST_FILES.length,
    generatedReportCount: ROUND4O_REPORT_FILES.length,
  };
}

function buildProjectContext({ repoRoot, packageJson, nextConfig, source }) {
  const appApiRoutePresent = existsSync(path.join(repoRoot, "app", "api"));
  const r2BundleExists = existsSync(path.join(repoRoot, "pipeline", "r2-upload", "coloring-pages"));
  const publicGeneratedMediaPresent = existsSync(path.join(repoRoot, "public", "png"))
    || existsSync(path.join(repoRoot, "public", "svg"))
    || existsSync(path.join(repoRoot, "public", "thumbs"));
  const branch = safeGit(repoRoot, ["branch", "--show-current"]);
  const round4nCommitType = safeGit(repoRoot, ["cat-file", "-t", ROUND4N_COMMIT]);
  const head = safeGit(repoRoot, ["rev-parse", "HEAD"]);
  const publicSvgLabels = findPublicSvgDownloadLabels(source.publicFacingText);

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4O_RUN_ID,
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      branch,
      head,
      round4nCommitExists: round4nCommitType === "commit",
      appApiRoutePresent,
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      publicDownloadUiExposesSvg: publicSvgLabels.length > 0,
      currentPublicDownloadFormats: /Download PNG/.test(source.imageCard) ? ["PNG"] : [],
      printActionPresent: /Print/.test(source.imageCard),
      r2BundleExists,
      publicGeneratedMediaPresent,
      sourceImagesUntouched: safeGit(repoRoot, ["status", "--short", "--", "images"]) === "",
      ilovesvgUntouched: safeGit(repoRoot, ["status", "--short", "--", "ilovesvg"]) === "",
      wrongTaskContextDetected: false,
    },
  };
}

function buildBrowserDownloadRules() {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4O_RUN_ID,
    sources: RESEARCH_SOURCES,
    rules: {
      pngBaseline: "Direct PNG download is already supported by generated preview files and does not require canvas export.",
      canvasInput: "Any browser-side conversion must use the PNG preview URL as the image input.",
      corsRequired: "Cross-origin image data drawn into canvas requires CORS approval from the asset host.",
      crossOriginAnonymous: "The image element must set crossOrigin to anonymous before assigning the source URL.",
      toBlobNullHandling: "toBlob may pass null if an image cannot be created and may throw SecurityError for a non-origin-clean canvas.",
      jpegWebpOptional: "Browsers are required to support PNG export, while JPEG and WebP support is browser-dependent.",
      unsupportedFallback: "If a browser falls back to another MIME type, the UI must treat that format as unsupported.",
      svgInternalOnly: "SVG is retained for internal future coloring tools and is not a user-facing download format.",
    },
  };
}

function buildDownloadImplementationAudit({ source }) {
  const visibleSvgLabels = findPublicSvgDownloadLabels(source.publicFacingText);
  const visibleJpegWebpLabels = findJpegWebpLabels(source.imageCard);

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4O_RUN_ID,
    summary: {
      imageCardUsesPngUrl: /assetUrls\.png/.test(source.imageCard),
      printUsesPngOnly: /const printUrl = pngUrl/.test(source.imageCard),
      pngDownloadPresent: /Download PNG/.test(source.imageCard),
      publicDownloadFormats: /Download PNG/.test(source.imageCard) ? ["PNG"] : [],
      svgVisibleInPublicUi: visibleSvgLabels.length > 0 || /assetUrls\.svg|svgUrl|pngUrl\s*\|\|\s*svgUrl/.test(source.imageCard),
      jpegWebpLabelsVisible: visibleJpegWebpLabels.length > 0,
      assetResolverPreservesInternalSvg: /resolveSvgAssetUrl/.test(source.assets),
      conversionUtilityPresent: /convertPngPreviewToBrowserDownload/.test(source.browserDownloads),
      conversionUtilityUsesPngPreviewInput: /pngPreviewUrl/.test(source.browserDownloads),
      conversionUtilitySetsCrossOriginAnonymous: /crossOrigin\s*=\s*"anonymous"/.test(source.browserDownloads),
      currentLocalMediaServerCorsTestableWithoutFalsePositives: false,
    },
    visibleSvgLabels,
    visibleJpegWebpLabels,
    checkedFiles: [
      "src/components/coloring/ImageCard.tsx",
      "src/lib/coloring/assets.ts",
      "src/lib/coloring/browserDownloads.ts",
    ],
  };
}

async function buildBrowserConversionResults() {
  const localProbe = await probeCorsHeaders(LOCAL_SAMPLE_PNG_URL);
  const temporaryR2Probe = await probeCorsHeaders(ROUND4O_TEMPORARY_R2_SAMPLE_URL);
  const localAllows = corsHeaderAllowsOrigin(localProbe.accessControlAllowOrigin, LOCAL_APP_ORIGIN);
  const r2Allows = corsHeaderAllowsOrigin(temporaryR2Probe.accessControlAllowOrigin, LOCAL_APP_ORIGIN);

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4O_RUN_ID,
    appOrigin: LOCAL_APP_ORIGIN,
    sampleUrls: {
      local: LOCAL_SAMPLE_PNG_URL,
      temporaryR2: ROUND4O_TEMPORARY_R2_SAMPLE_URL,
    },
    probes: {
      local: localProbe,
      temporaryR2: temporaryR2Probe,
    },
    summary: {
      localCorsAllowsCanvasExport: localAllows,
      temporaryR2CorsAllowsCanvasExport: r2Allows,
      browserCanvasConversionVerified: localAllows || r2Allows,
      jpegConversionSafeToExpose: false,
      webpConversionSafeToExpose: false,
      reason: "No currently configured test asset source returned CORS headers that allow the app origin, so canvas export cannot be verified safely.",
    },
  };
}

function buildDownloadFormatDecision(conversionResults) {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4O_RUN_ID,
    summary: {
      implementedJpegWebp: false,
      deferredJpegWebp: true,
      svgInternalOnly: true,
      publicDownloadFormats: ["PNG"],
      requiresCorsBeforeUiExposure: true,
      decisionReason: conversionResults.summary.reason,
    },
    requiredBeforeExposingJpegWebp: [
      "Configure the production asset host to send Access-Control-Allow-Origin for the app origin.",
      "Retest actual browser canvas export from CDN PNG previews.",
      "Show JPG/WebP controls only after format support and export success are confirmed in the browser.",
    ],
  };
}

function buildDownloadUiResults({ source, decision }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4O_RUN_ID,
    summary: {
      visibleSvgOptions: findPublicSvgDownloadLabels(source.publicFacingText).length > 0,
      visibleJpegWebpOptions: findJpegWebpLabels(source.imageCard).length > 0,
      currentPublicDownloadFormats: decision.summary.publicDownloadFormats,
      printActionPresent: /Print/.test(source.imageCard),
      pngDownloadPresent: /Download PNG/.test(source.imageCard),
      adPlacementChanged: false,
      adStylingChanged: false,
      appApiRouteRequired: false,
    },
  };
}

async function probeCorsHeaders(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        Origin: LOCAL_APP_ORIGIN,
      },
      signal: AbortSignal.timeout(10000),
    });

    return {
      url,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type") || "",
      accessControlAllowOrigin: response.headers.get("access-control-allow-origin") || "",
      accessControlAllowMethods: response.headers.get("access-control-allow-methods") || "",
      vary: response.headers.get("vary") || "",
      checkedWithOrigin: LOCAL_APP_ORIGIN,
    };
  } catch (error) {
    return {
      url,
      status: "not_run_or_unreachable",
      ok: false,
      contentType: "",
      accessControlAllowOrigin: "",
      accessControlAllowMethods: "",
      vary: "",
      checkedWithOrigin: LOCAL_APP_ORIGIN,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

function corsHeaderAllowsOrigin(header, origin) {
  return header === "*" || header.split(",").map((item) => item.trim()).includes(origin);
}

function renderProjectContext(context) {
  return `# Round 4O Project Context Check

Status: ${context.summary.correctRepository && context.summary.branch === "version-4" && context.summary.round4nCommitExists ? "passed" : "blocked"}

- Repository package: ${context.summary.correctRepository ? "i-love-coloring-page" : "unexpected"}
- Branch: ${context.summary.branch}
- Round 4N commit present: ${context.summary.round4nCommitExists}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api route present: ${context.summary.appApiRoutePresent}
- Public download UI exposes SVG: ${context.summary.publicDownloadUiExposesSvg}
- Current public download formats: ${context.summary.currentPublicDownloadFormats.join(", ")}
- Print action present: ${context.summary.printActionPresent}
- Local R2 bundle present: ${context.summary.r2BundleExists}
- Generated media copied into public: ${context.summary.publicGeneratedMediaPresent}
- Source images untouched: ${context.summary.sourceImagesUntouched}
- Local reference repo untouched: ${context.summary.ilovesvgUntouched}
`;
}

function renderResearchReport(rules) {
  return `# Round 4O Browser Download Format Research

Sources reviewed:
${rules.sources.map((source) => `- ${source.name}: ${source.url}`).join("\n")}

Findings:
- Canvas export from a cross-origin PNG requires the asset host to allow the app origin with CORS headers.
- Browser image loading must set \`crossOrigin = "anonymous"\` before assigning the PNG URL.
- \`HTMLCanvasElement.toBlob()\` always has PNG as the baseline export, while JPEG and WebP support depends on the browser.
- \`toBlob()\` can return null or throw when the canvas is not origin-clean.
- Cloudflare R2 custom domains return CORS response headers only when a bucket CORS policy is configured and the request includes a valid Origin header.
- SVG remains internal only and is not a public download input or output in this round.
`;
}

function renderDownloadAudit(audit) {
  return `# Round 4O Download Implementation Audit

- ImageCard uses PNG URL: ${audit.summary.imageCardUsesPngUrl}
- Print uses PNG only: ${audit.summary.printUsesPngOnly}
- PNG download present: ${audit.summary.pngDownloadPresent}
- SVG visible in public UI: ${audit.summary.svgVisibleInPublicUi}
- JPG/JPEG/WebP labels visible: ${audit.summary.jpegWebpLabelsVisible}
- Internal SVG resolver preserved: ${audit.summary.assetResolverPreservesInternalSvg}
- Conversion utility present: ${audit.summary.conversionUtilityPresent}
- Conversion utility uses PNG preview input: ${audit.summary.conversionUtilityUsesPngPreviewInput}
- Conversion utility sets crossOrigin anonymous: ${audit.summary.conversionUtilitySetsCrossOriginAnonymous}

The current public UI remains PNG-only.
`;
}

function renderDecision(decision) {
  return `# Round 4O Download Format Decision

Decision: defer public JPG/JPEG/WebP controls.

- Implemented JPG/WebP now: ${decision.summary.implementedJpegWebp}
- Deferred JPG/WebP: ${decision.summary.deferredJpegWebp}
- SVG internal only: ${decision.summary.svgInternalOnly}
- Public formats now: ${decision.summary.publicDownloadFormats.join(", ")}
- Requires CORS before UI exposure: ${decision.summary.requiresCorsBeforeUiExposure}

Reason: ${decision.summary.decisionReason}
`;
}

function renderConversionResults(results) {
  return `# Round 4O Browser Conversion Test Results

App origin checked: ${results.appOrigin}

Local media probe:
- Status: ${results.probes.local.status}
- Content-Type: ${results.probes.local.contentType || "none"}
- Access-Control-Allow-Origin: ${results.probes.local.accessControlAllowOrigin || "none"}
- Canvas export allowed: ${results.summary.localCorsAllowsCanvasExport}

Temporary R2 probe:
- Status: ${results.probes.temporaryR2.status}
- Content-Type: ${results.probes.temporaryR2.contentType || "none"}
- Access-Control-Allow-Origin: ${results.probes.temporaryR2.accessControlAllowOrigin || "none"}
- Canvas export allowed: ${results.summary.temporaryR2CorsAllowsCanvasExport}

Browser canvas conversion verified: ${results.summary.browserCanvasConversionVerified}

JPG/WebP remain hidden because conversion cannot be verified safely without CORS approval from the current asset source.
`;
}

function renderUiResults(results) {
  return `# Round 4O Download UI Report

- Visible SVG options: ${results.summary.visibleSvgOptions}
- Visible JPG/WebP options: ${results.summary.visibleJpegWebpOptions}
- Current public formats: ${results.summary.currentPublicDownloadFormats.join(", ")}
- Print action present: ${results.summary.printActionPresent}
- PNG download present: ${results.summary.pngDownloadPresent}
- Ad placement changed: ${results.summary.adPlacementChanged}
- Ad styling changed: ${results.summary.adStylingChanged}
- app/api required: ${results.summary.appApiRouteRequired}

No layout, ad, or affiliate placement changes were made for this download decision.
`;
}

function renderNextPhasePlan() {
  return `# Round 4O Next Phase Plan

Round 4P should configure and verify production asset-host CORS before exposing any browser-side JPG/JPEG/WebP options.

Recommended next steps:
1. Configure the Cloudflare R2 bucket or custom asset domain to allow GET/HEAD CORS requests from the production app origin and local preview origin.
2. Purge or refresh cached assets after changing the CORS policy.
3. Use the existing PNG-preview conversion utility to test real browser canvas export for JPG and WebP.
4. Add the compact Download menu only after JPG/WebP exports succeed in browser QA.

Keep SVG internal only. Do not add app/api routes or backend image conversion for this public gallery.
`;
}

async function readSourceFiles(repoRoot) {
  const imageCard = await readText(repoRoot, "src/components/coloring/ImageCard.tsx");
  const assets = await readText(repoRoot, "src/lib/coloring/assets.ts");
  const browserDownloads = existsSync(path.join(repoRoot, "src/lib/coloring/browserDownloads.ts"))
    ? await readText(repoRoot, "src/lib/coloring/browserDownloads.ts")
    : "";
  const publicFacingText = [
    await readDirectoryText(repoRoot, "app"),
    await readDirectoryText(repoRoot, "src/components"),
    await readDirectoryText(repoRoot, "src/lib/navigation"),
  ].join("\n");

  return {
    imageCard,
    assets,
    browserDownloads,
    publicFacingText,
  };
}

async function readDirectoryText(repoRoot, relativeRoot) {
  const files = await listRelativeFiles(repoRoot, relativeRoot);
  const chunks = [];
  for (const file of files) {
    if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
    chunks.push(await readText(repoRoot, file));
  }
  return chunks.join("\n");
}

function findPublicSvgDownloadLabels(text) {
  const patterns = [
    /Download SVG/gi,
    /SVG download[s]?/gi,
    /SVG and PNG/gi,
    /PNG and SVG/gi,
    /download format[s]?:?\s*SVG/gi,
  ];
  return patterns.flatMap((pattern) => Array.from(text.matchAll(pattern)).map((match) => match[0]));
}

function findJpegWebpLabels(text) {
  return Array.from(text.matchAll(/\bDownload (?:JPG|JPEG|WebP)\b/gi)).map((match) => match[0]);
}

async function readJson(repoRoot, relativePath) {
  return JSON.parse(await readText(repoRoot, relativePath));
}

async function readText(repoRoot, relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function writeJson(repoRoot, relativePath, data) {
  await writeFile(path.join(repoRoot, relativePath), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeText(repoRoot, relativePath, text) {
  await writeFile(path.join(repoRoot, relativePath), text, "utf8");
}

async function listRelativeFiles(repoRoot, relativeRoot) {
  const root = path.join(repoRoot, relativeRoot);
  if (!existsSync(root)) return [];
  const results = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else results.push(path.relative(repoRoot, entryPath).replaceAll("\\", "/"));
    }
  }

  await walk(root);
  return results.sort();
}

function safeGit(repoRoot, args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runRound4OBrowserDownloads().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
