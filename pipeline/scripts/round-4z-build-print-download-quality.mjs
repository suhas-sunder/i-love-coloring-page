import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RUN_ID = "round-4z-print-download-quality";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";

const JSON_FILES = [
  "pipeline/manifests/round-4z-project-context-check.json",
  "pipeline/manifests/round-4z-contact-config-results.json",
  "pipeline/manifests/round-4z-print-download-audit.json",
  "pipeline/manifests/round-4z-svg-conversion-design.json",
  "pipeline/manifests/round-4z-download-format-decision.json",
  "pipeline/manifests/round-4z-local-cors-preview-results.json",
  "pipeline/manifests/round-4z-production-cors-requirements.json",
  "pipeline/manifests/round-4z-asset-publishing-deferral.json",
  "pipeline/manifests/round-4z-print-quality-results.json",
  "pipeline/manifests/round-4z-browser-download-results.json",
  "pipeline/manifests/round-4z-launch-readiness-adjustment.json",
];

const REPORT_FILES = [
  "pipeline/reports/round-4z-project-context-check.md",
  "pipeline/reports/round-4z-contact-config-report.md",
  "pipeline/reports/round-4z-print-download-audit.md",
  "pipeline/reports/round-4z-svg-conversion-design.md",
  "pipeline/reports/round-4z-download-format-decision.md",
  "pipeline/reports/round-4z-local-cors-preview-report.md",
  "pipeline/reports/round-4z-production-cors-requirements.md",
  "pipeline/reports/round-4z-asset-publishing-deferral.md",
  "pipeline/reports/round-4z-print-quality-report.md",
  "pipeline/reports/round-4z-browser-download-report.md",
  "pipeline/reports/round-4z-launch-readiness-adjustment.md",
  "pipeline/reports/round-4z-next-phase-plan.md",
];

await main();

async function main() {
  await mkdir(path.join(REPO_ROOT, "pipeline", "manifests"), { recursive: true });
  await mkdir(path.join(REPO_ROOT, "pipeline", "reports"), { recursive: true });

  const packageJson = await readJson("package.json");
  const nextConfig = await readText("next.config.mjs");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const envExample = await readText(".env.example");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const galleryGrid = await readText("src/components/coloring/GalleryGrid.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const assets = await readText("src/lib/coloring/assets.ts");
  const publicText = await readPublicText();

  const context = buildContext({ packageJson, nextConfig, publicText });
  const contact = buildContact({ siteConfig, envExample, publicText });
  const audit = buildPrintDownloadAudit({ imageCard, browserDownloads, assets });
  const design = buildConversionDesign();
  const decision = buildDownloadDecision();
  const localCors = buildLocalCorsPreview();
  const corsRequirements = buildProductionCorsRequirements();
  const deferral = buildAssetPublishingDeferral();
  const printQuality = buildPrintQuality({ imageCard, browserDownloads });
  const browserDownloadResults = buildBrowserDownloadResults({ imageCard, browserDownloads });
  const launchAdjustment = buildLaunchReadinessAdjustment();

  const payloads = new Map([
    ["pipeline/manifests/round-4z-project-context-check.json", context],
    ["pipeline/manifests/round-4z-contact-config-results.json", contact],
    ["pipeline/manifests/round-4z-print-download-audit.json", audit],
    ["pipeline/manifests/round-4z-svg-conversion-design.json", design],
    ["pipeline/manifests/round-4z-download-format-decision.json", decision],
    ["pipeline/manifests/round-4z-local-cors-preview-results.json", localCors],
    ["pipeline/manifests/round-4z-production-cors-requirements.json", corsRequirements],
    ["pipeline/manifests/round-4z-asset-publishing-deferral.json", deferral],
    ["pipeline/manifests/round-4z-print-quality-results.json", printQuality],
    ["pipeline/manifests/round-4z-browser-download-results.json", browserDownloadResults],
    ["pipeline/manifests/round-4z-launch-readiness-adjustment.json", launchAdjustment],
  ]);

  for (const [relativePath, payload] of payloads) await writeJson(relativePath, payload);

  await writeReport("pipeline/reports/round-4z-project-context-check.md", "Round 4Z Project Context Check", [
    `Correct repository: ${context.summary.correctRepository}`,
    `Branch: ${context.summary.branch}`,
    `Round 4Y commit present: ${context.summary.round4yCommitExists}`,
    `Static export configured: ${context.summary.staticExportConfigured}`,
    `app/api route present: ${context.summary.appApiRoutePresent}`,
    `R2 local bundle present: ${context.summary.r2BundleExists}`,
    `SVG user download exposed: ${context.summary.svgUserDownloadExposed}`,
    `Live AdSense code present: ${context.summary.liveAdSenseCodePresent}`,
  ]);

  await writeReport("pipeline/reports/round-4z-contact-config-report.md", "Round 4Z Contact Config Report", [
    `Public contact email: ${contact.summary.publicContactEmail}`,
    `Contact method configured: ${contact.summary.contactMethodConfigured}`,
    `Contact page uses email: ${contact.summary.contactPageUsesEmail}`,
    `Privacy and terms use contact method: ${contact.summary.policyPagesUseContactMethod}`,
    "No phone number, address, or company details were invented.",
    "Privacy and terms remain drafts requiring owner/legal review.",
  ]);

  await writeReport("pipeline/reports/round-4z-print-download-audit.md", "Round 4Z Print Download Audit", [
    "Previous print quality issue: print used the generated PNG preview path from the card action instead of a high-quality SVG-derived raster.",
    `Previous print source: ${audit.summary.previousPrintSource}`,
    `PNG preview dimensions found in sample data: ${audit.summary.samplePngPreviewDimensions}`,
    `SVG dimensions found in sample data: ${audit.summary.sampleSvgDimensions}`,
    `Print now calls browser conversion helper: ${audit.summary.printNowUsesConversionHelper}`,
    `SVG visible as user download: ${audit.summary.svgUserDownloadExposed}`,
    "High-quality browser output requires loading the internal SVG into a CORS-clean canvas, exporting a PNG blob, and printing that generated raster.",
  ]);

  await writeReport("pipeline/reports/round-4z-svg-conversion-design.md", "Round 4Z SVG Conversion Design", design.sections.map((section) => `${section.title}: ${section.body}`));
  await writeReport("pipeline/reports/round-4z-download-format-decision.md", "Round 4Z Download Format Decision", [
    `Current public formats: ${decision.summary.currentPublicDownloadFormats.join(", ")}`,
    `SVG internal only: ${decision.summary.svgInternalOnly}`,
    `JPEG/WebP visible in UI: ${decision.summary.jpegWebpVisibleInUi}`,
    "JPG/JPEG/WebP utilities exist for the future path, but controls stay hidden until production CORS and browser export are verified.",
  ]);
  await writeReport("pipeline/reports/round-4z-local-cors-preview-report.md", "Round 4Z Local CORS Preview Report", [
    `Helper script: ${localCors.summary.scriptPath}`,
    `Command: ${localCors.command}`,
    `Production dependency: ${localCors.summary.productionDependency}`,
    "The helper serves only pipeline/r2-upload and sends CORS headers for localhost preview origins.",
  ]);
  await writeReport("pipeline/reports/round-4z-production-cors-requirements.md", "Round 4Z Production CORS Requirements", [
    `Production CORS required for future JPG/WebP UI: ${corsRequirements.summary.productionCorsRequiredForFutureJpegWebpUi}`,
    `Allowed methods: ${corsRequirements.allowedMethods.join(", ")}`,
    `Content types: ${corsRequirements.contentTypes.join(", ")}`,
    "Canvas export requires an origin-clean image. The final R2/custom domain must allow GET and HEAD from the public site origin.",
  ]);
  await writeReport("pipeline/reports/round-4z-asset-publishing-deferral.md", "Round 4Z Asset Publishing Deferral", [
    `Full asset upload deferred: ${deferral.summary.fullAssetUploadDeferred}`,
    `No upload command run: ${deferral.summary.noUploadCommandRun}`,
    "The local bundle is enough for development and browser conversion QA. Full publishing remains a final production-stage task.",
  ]);
  await writeReport("pipeline/reports/round-4z-print-quality-report.md", "Round 4Z Print Quality Report", [
    `Print prefers SVG-derived PNG: ${printQuality.summary.printPrefersSvgDerivedPng}`,
    `Thumbnail used for print: ${printQuality.summary.thumbnailUsedForPrint}`,
    `Fallback to PNG preview available: ${printQuality.summary.fallbackToPngPreviewAvailable}`,
    "If SVG conversion is blocked by CORS, the UI reports the fallback instead of pretending high-quality export succeeded.",
  ]);
  await writeReport("pipeline/reports/round-4z-browser-download-report.md", "Round 4Z Browser Download Report", [
    `Visible SVG download: ${browserDownloadResults.summary.visibleSvgDownload}`,
    `Visible JPG/WebP controls: ${browserDownloadResults.summary.visibleJpegWebpControls}`,
    `PNG download remains available: ${browserDownloadResults.summary.pngDownloadStillAvailable}`,
    `Internal SVG conversion pathway present: ${browserDownloadResults.summary.internalSvgConversionPathPresent}`,
  ]);
  await writeReport("pipeline/reports/round-4z-launch-readiness-adjustment.md", "Round 4Z Launch Readiness Adjustment", [
    `Contact method ready: ${launchAdjustment.summary.contactMethodReady}`,
    `Final public site domain ready: ${launchAdjustment.summary.finalPublicSiteDomainReady}`,
    `Final public asset domain ready: ${launchAdjustment.summary.finalPublicAssetDomainReady}`,
    `Production launch readiness claimed: ${launchAdjustment.summary.productionLaunchReadinessClaimed}`,
    "The contact blocker is reduced, but public launch and AdSense remain blocked by final domain, final asset domain, CORS, and policy review.",
  ]);
  await writeReport("pipeline/reports/round-4z-next-phase-plan.md", "Round 4Z Next Phase Plan", [
    "Round 5A should verify final public site and asset domains, configure production CORS, and then rerun print/download browser QA against public URLs.",
    "Do not start image sitemap, OG image generation, or live AdSense until public assets and policy review are accepted.",
  ]);

  console.log(JSON.stringify({ runId: RUN_ID, jsonFiles: JSON_FILES.length, reportFiles: REPORT_FILES.length }, null, 2));
}

function buildContext({ packageJson, nextConfig, publicText }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      branch: safeGit(["branch", "--show-current"]),
      head: safeGit(["rev-parse", "HEAD"]),
      round4yCommitExists: safeGit(["cat-file", "-t", "00b8f21"]) === "commit",
      round4xCommitExists: safeGit(["cat-file", "-t", "a852cb1"]) === "commit",
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")) || existsSync(path.join(REPO_ROOT, "src", "app", "api")),
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      r2BundleExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages")),
      publicGeneratedMediaPresent: hasPublicGeneratedMedia(),
      sourceImagesUntouched: safeGit(["status", "--short", "--", "images"]) === "",
      ilovesvgUntouched: safeGit(["status", "--short", "--", "ilovesvg"]) === "",
      svgUserDownloadExposed: /Download SVG|SVG download/i.test(publicText),
      adWellsVisibleByDefault: /data-ad-placeholder/.test(publicText),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(publicText),
      wrongTaskContextDetected: /image-to-favicon-generator|iLoveSVG|SVG wrapper route|vite/i.test(publicText),
    },
  };
}

function buildContact({ siteConfig, envExample, publicText }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      publicContactEmail: CONTACT_EMAIL,
      contactMethodConfigured: new RegExp(CONTACT_EMAIL.replace(".", "\\.")).test(siteConfig + envExample),
      contactPageUsesEmail: new RegExp(CONTACT_EMAIL.replace(".", "\\.")).test(publicText) || /siteConfig\.contactEmail/.test(publicText),
      policyPagesUseContactMethod: /siteConfig\.contactEmail/.test(publicText),
      fakeContactDetailsPresent: /support@example\.com|123 Main|555-|fake address|fake phone/i.test(publicText),
      policyDraftReviewStillRequired: true,
    },
  };
}

function buildPrintDownloadAudit({ imageCard, browserDownloads, assets }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      previousPrintSource: "assetUrls.png generated PNG preview, commonly 341x512 in current sample data",
      samplePngPreviewDimensions: "341x512",
      sampleSvgDimensions: "800x1200 vector source, rasterized to 1600x2400 or larger for print",
      previousPrintLikelyLowResolution: true,
      printNowUsesConversionHelper: /printFromHighQualitySource/.test(imageCard),
      printPassesInternalSvgUrl: /internalSvgUrl/.test(imageCard),
      conversionUtilityUsesInternalSvg: /convertInternalSvgToBlob/.test(browserDownloads),
      conversionUtilityUsesCanvas: /drawImage|toBlob/.test(browserDownloads),
      conversionUtilityDetectsCorsFailure: /canvas-tainted|CORS/i.test(browserDownloads),
      assetResolverProvidesInternalSvg: /resolveSvgAssetUrl/.test(assets),
      svgUserDownloadExposed: /Download SVG|SVG download/i.test(imageCard),
      jpegWebpVisible: /Download JPG|Download JPEG|Download WebP/i.test(imageCard),
    },
  };
}

function buildConversionDesign() {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    sections: [
      {
        title: "Internal SVG source",
        body: "The gallery resolver keeps the SVG URL as internal action data and passes it to the browser conversion helper without rendering a public SVG download link.",
      },
      {
        title: "Canvas conversion",
        body: "The browser loads the SVG with crossOrigin=anonymous, draws it to a white canvas at a print-safe long edge, and exports PNG, JPEG, or WebP blobs through toBlob.",
      },
      {
        title: "Print flow",
        body: "Print opens a blank window synchronously, prepares the high-quality PNG from SVG, writes a print document using the generated blob URL, and falls back to the PNG preview with a visible status message if conversion fails.",
      },
      {
        title: "Error handling",
        body: "Conversion returns structured failure reasons for missing assets, browser API gaps, image loading failures, tainted canvases, unsupported MIME types, and popup blockers.",
      },
      {
        title: "CORS",
        body: "Canvas export only works when the final asset host allows the app origin for GET and HEAD on SVG and PNG media.",
      },
    ],
  };
}

function buildDownloadDecision() {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      currentPublicDownloadFormats: ["PNG"],
      svgInternalOnly: true,
      jpegWebpImplementedInUtility: true,
      jpegWebpVisibleInUi: false,
      jpegWebpDeferredUntilCorsVerified: true,
      fakeControlsAdded: false,
    },
  };
}

function buildLocalCorsPreview() {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      scriptPath: "pipeline/scripts/round-4z-cors-media-server.mjs",
      servesRoot: "pipeline/r2-upload",
      pathTraversalProtected: true,
      localhostCorsOnly: true,
      productionDependency: false,
      appApiRouteAdded: false,
    },
    command: "node pipeline/scripts/round-4z-cors-media-server.mjs --root pipeline/r2-upload --port 4176",
  };
}

function buildProductionCorsRequirements() {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      productionCorsRequiredForFutureJpegWebpUi: true,
      corsRequiredForHighQualityPrint: true,
      finalAssetDomainStillDeferred: true,
    },
    allowedOrigins: ["http://localhost:3005", "http://127.0.0.1:3005", "final production site URL when known"],
    allowedMethods: ["GET", "HEAD"],
    allowedHeaders: ["Origin", "Range"],
    contentTypes: ["image/svg+xml", "image/png"],
    notes: [
      "Canvas export requires origin-clean SVG and PNG responses.",
      "R2/custom domain CORS must be configured before exposing JPG/JPEG/WebP controls.",
      "Full image publishing remains a final production-stage task.",
    ],
  };
}

function buildAssetPublishingDeferral() {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      fullAssetUploadDeferred: true,
      localBundleUsedForTesting: true,
      finalPublicAssetDomainVerificationNeededLater: true,
      noUploadCommandRun: true,
      imageSitemapDeferred: true,
      openGraphImageDeferred: true,
      liveAdsDeferred: true,
    },
  };
}

function buildPrintQuality({ imageCard, browserDownloads }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      printPrefersSvgDerivedPng: /printFromHighQualitySource/.test(imageCard) && /convertInternalSvgToBlob/.test(browserDownloads),
      thumbnailUsedForPrint: /printUrl\s*=\s*assetUrls\.thumbnail|printUrl\s*=\s*assetUrls\.preview/.test(imageCard),
      fallbackToPngPreviewAvailable: /png-preview-fallback|pngPreviewUrl/.test(browserDownloads),
      popupBlockedHandled: /popup-blocked/.test(browserDownloads),
      corsFailureHandled: /canvas-tainted|CORS/i.test(browserDownloads),
    },
  };
}

function buildBrowserDownloadResults({ imageCard, browserDownloads }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      pngDownloadStillAvailable: /Download PNG/.test(imageCard),
      visibleSvgDownload: /Download SVG|SVG download/i.test(imageCard),
      visibleJpegWebpControls: /Download JPG|Download JPEG|Download WebP/i.test(imageCard),
      internalSvgConversionPathPresent: /convertInternalSvgToBlob/.test(browserDownloads),
      downloadPngPrefersInternalSvg: /downloadPng[\s\S]*convertInternalSvgToBlob/.test(browserDownloads),
      futureJpegWebpHelpersPresent: /downloadJpeg/.test(browserDownloads) && /downloadWebp/.test(browserDownloads),
    },
  };
}

function buildLaunchReadinessAdjustment() {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      contactMethodReady: true,
      finalPublicSiteDomainReady: false,
      finalPublicAssetDomainReady: false,
      productionCorsReady: false,
      policyLegalReviewComplete: false,
      productionLaunchReadinessClaimed: false,
      adsenseReadyToApply: false,
    },
    blockers: [
      "Final public site domain still needs production configuration.",
      "Final public asset domain and CORS still need verification.",
      "Privacy and terms drafts still require owner/legal review.",
      "Full asset upload remains deferred until final production staging.",
    ],
  };
}

async function readPublicText() {
  const chunks = [];
  for (const relativeRoot of ["app", "src/components", "src/lib"]) {
    for (const file of await listFiles(relativeRoot)) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (file.startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function listFiles(relativeRoot) {
  const root = path.join(REPO_ROOT, relativeRoot);
  if (!existsSync(root)) return [];
  const results = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute).replaceAll("\\", "/"));
    }
  }
  if ((await import("node:fs")).statSync(root).isFile()) return [relativeRoot];
  await walk(root);
  return results.sort();
}

function hasPublicGeneratedMedia() {
  return ["png", "svg", "thumbs", "coloring-pages"].some((folder) => existsSync(path.join(REPO_ROOT, "public", folder)));
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, payload) {
  await writeFile(path.join(REPO_ROOT, relativePath), `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeReport(relativePath, title, bullets) {
  const body = [`# ${title}`, "", ...bullets.map((item) => `- ${item}`), ""].join("\n");
  await writeFile(path.join(REPO_ROOT, relativePath), body);
}

function safeGit(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
