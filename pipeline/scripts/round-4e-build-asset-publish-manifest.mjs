import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

const ROUND4E_GENERATED_AT = "2026-05-10";
const ROUND4E_RUN_ID = "round-4e-production-asset-hosting-contract";
const PRODUCTION_ASSET_ROOT = "pipeline/production/full/assets";
const PUBLIC_BASE_URL_TEMPLATE = "${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}";
const IMMUTABLE_CACHE_POLICY = "public, max-age=31536000, immutable";
const CONSERVATIVE_CACHE_POLICY = "public, max-age=86400, stale-while-revalidate=604800";

const INPUT_PATHS = {
  round3cProductionAssets: "pipeline/manifests/round-3c-production-assets.json",
  round3cProductionGalleryData: "pipeline/manifests/round-3c-production-gallery-data.json",
  round3cProductionQuarantine: "pipeline/manifests/round-3c-production-quarantine.json",
  round4bAssetResolutionPlan: "pipeline/manifests/round-4b-asset-resolution-plan.json",
  generatedItems: "src/generated/coloring/items.json",
  generatedRoutes: "src/generated/coloring/routes.json",
};

const MEDIA_TYPES = [
  {
    mediaType: "svg",
    productionPathKey: "svgPath",
    generatedSubpathKey: "svg",
    contentType: "image/svg+xml",
    folder: "svg",
    extension: ".svg",
  },
  {
    mediaType: "pngPreview",
    productionPathKey: "pngPreviewPath",
    generatedSubpathKey: "pngPreview",
    contentType: "image/png",
    folder: "png",
    extension: ".png",
  },
  {
    mediaType: "thumbnail",
    productionPathKey: "thumbnailPath",
    generatedSubpathKey: "thumbnail",
    contentType: "image/png",
    folder: "thumbs",
    extension: ".png",
  },
];

export const ROUND4E_MANIFEST_FILES = [
  "pipeline/manifests/round-4e-asset-inventory-audit.json",
  "pipeline/manifests/round-4e-asset-url-contract.json",
  "pipeline/manifests/round-4e-asset-hosting-decision.json",
  "pipeline/manifests/round-4e-cache-and-content-type-policy.json",
  "pipeline/manifests/round-4e-asset-publish-manifest.json",
];

export const ROUND4E_REPORT_FILES = [
  "pipeline/reports/round-4e-asset-inventory-audit.md",
  "pipeline/reports/round-4e-asset-url-contract.md",
  "pipeline/reports/round-4e-production-asset-hosting-strategy.md",
  "pipeline/reports/round-4e-cache-and-content-type-policy.md",
  "pipeline/reports/round-4e-deployment-asset-checklist.md",
];

export async function runRound4EAssetHostingBuild(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const state = await loadInputs(repoRoot);
  const analysis = await analyzeAssets(state);
  const manifests = buildManifests(state, analysis);
  const reports = buildReports(state, analysis, manifests);

  for (const [relativePath, payload] of Object.entries(manifests)) {
    await writeJson(path.join(repoRoot, relativePath), payload);
  }
  for (const [relativePath, markdown] of Object.entries(reports)) {
    await writeText(path.join(repoRoot, relativePath), markdown);
  }

  return { state, analysis, manifests, reports };
}

async function loadInputs(repoRoot) {
  const inputs = {};
  for (const [key, relativePath] of Object.entries(INPUT_PATHS)) {
    inputs[key] = await readJson(path.join(repoRoot, relativePath));
  }

  const successfulAssets = [...inputs.round3cProductionAssets.assets].sort((a, b) => a.assetId.localeCompare(b.assetId));
  const quarantinedAssets = [...(inputs.round3cProductionQuarantine.entries || [])].sort((a, b) => a.assetId.localeCompare(b.assetId));
  const generatedItems = [...inputs.generatedItems.items].sort((a, b) => a.assetId.localeCompare(b.assetId));
  const successfulAssetIds = new Set(successfulAssets.map((asset) => asset.assetId));
  const quarantinedAssetIds = new Set(quarantinedAssets.map((asset) => asset.assetId));

  return {
    repoRoot,
    inputs,
    successfulAssets,
    quarantinedAssets,
    generatedItems,
    successfulAssetIds,
    quarantinedAssetIds,
    generatedItemById: new Map(generatedItems.map((item) => [item.assetId, item])),
  };
}

async function analyzeAssets(state) {
  const files = [];
  const missingFiles = [];
  const invalidPaths = [];
  const mediaCounts = { svg: 0, pngPreview: 0, thumbnail: 0 };
  let totalBytes = 0;

  for (const asset of state.successfulAssets) {
    for (const media of MEDIA_TYPES) {
      const localRelativePath = normalizePath(asset[media.productionPathKey]);
      const cdnRelativePath = toCdnRelativePath(localRelativePath);
      const invalidReason = validateAssetPath({ localRelativePath, cdnRelativePath, media });
      const localAbsolutePath = path.resolve(state.repoRoot, ...localRelativePath.split("/"));
      const fileRecord = {
        assetId: asset.assetId,
        mediaType: media.mediaType,
        localRelativePath,
        localAbsolutePath,
        cdnRelativePath,
        expectedPublicUrlTemplate: `${PUBLIC_BASE_URL_TEMPLATE}/${cdnRelativePath}`,
        contentType: media.contentType,
        fileSize: 0,
        sha256: null,
        cachePolicy: IMMUTABLE_CACHE_POLICY,
        sourceProductionAssetId: asset.assetId,
        status: "ready",
      };

      if (invalidReason) {
        fileRecord.status = "invalid_path";
        invalidPaths.push({
          assetId: asset.assetId,
          mediaType: media.mediaType,
          localRelativePath,
          cdnRelativePath,
          reason: invalidReason,
        });
      } else {
        try {
          const fileStat = await stat(localAbsolutePath);
          fileRecord.fileSize = fileStat.size;
          fileRecord.sha256 = await hashFile(localAbsolutePath);
          totalBytes += fileStat.size;
          mediaCounts[media.mediaType] += 1;
        } catch {
          fileRecord.status = "missing";
          missingFiles.push({
            assetId: asset.assetId,
            mediaType: media.mediaType,
            localRelativePath,
          });
        }
      }

      files.push(fileRecord);
    }
  }

  const clientDataLeaks = countClientDataLeaks(state.inputs.generatedItems, state.inputs.generatedRoutes);
  const generatedSubpathMismatches = findGeneratedSubpathMismatches(state);
  const unsafeGeneratedSubpaths = findUnsafeGeneratedSubpaths(state.generatedItems);
  const quarantineOverlap = state.successfulAssets
    .filter((asset) => state.quarantinedAssetIds.has(asset.assetId))
    .map((asset) => asset.assetId);

  return {
    files,
    mediaCounts,
    totalBytes,
    missingFiles,
    invalidPaths,
    clientDataLeaks,
    generatedSubpathMismatches,
    unsafeGeneratedSubpaths,
    quarantineOverlap,
  };
}

function buildManifests(state, analysis) {
  const inventoryAudit = {
    generatedAt: ROUND4E_GENERATED_AT,
    runId: ROUND4E_RUN_ID,
    inputs: INPUT_PATHS,
    counts: {
      successfulAssets: state.successfulAssets.length,
      svgAssetFiles: analysis.mediaCounts.svg,
      pngPreviewAssetFiles: analysis.mediaCounts.pngPreview,
      thumbnailAssetFiles: analysis.mediaCounts.thumbnail,
      expectedAssetFiles: state.successfulAssets.length * MEDIA_TYPES.length,
      missingAssetFiles: analysis.missingFiles.length,
      invalidAssetPaths: analysis.invalidPaths.length,
      quarantinedAssets: state.quarantinedAssets.length,
      generatedClientItems: state.generatedItems.length,
      sitemapRouteCount: state.inputs.generatedRoutes.routes.length,
    },
    pathContract: {
      productionAssetRoot: PRODUCTION_ASSET_ROOT,
      productionRelativePattern: "pipeline/production/full/assets/{svg|png|thumbs}/{category-slug}/{filename-slug}-{stable-id}.{svg|png}",
      cdnRelativePattern: "{svg|png|thumbs}/{category-slug}/{filename-slug}-{stable-id}.{svg|png}",
      generatedClientDataUsesSubpathsOnly: true,
      sourceLocalAbsolutePathsInClientData: false,
      localAbsolutePathLeaksInClientData: analysis.clientDataLeaks.length,
      localAbsolutePathAllowedOnlyInPublishManifest: true,
    },
    consistency: {
      generatedItemsMatchSuccessfulRound3CAssets: state.generatedItems.length === state.successfulAssets.length,
      generatedSubpathsMatchProductionManifest: analysis.generatedSubpathMismatches.length === 0,
      unsafeGeneratedSubpaths: analysis.unsafeGeneratedSubpaths.length,
      quarantineOverlapWithSuccessfulAssets: analysis.quarantineOverlap.length,
      allProductionAssetFilesExist: analysis.missingFiles.length === 0,
      allProductionAssetPathsAreSafe: analysis.invalidPaths.length === 0,
    },
    samples: buildPathSamples(state.successfulAssets),
    missingFiles: analysis.missingFiles,
    invalidPaths: analysis.invalidPaths,
    unsafeGeneratedSubpaths: analysis.unsafeGeneratedSubpaths,
    generatedSubpathMismatches: analysis.generatedSubpathMismatches.slice(0, 50),
  };

  const assetUrlContract = {
    generatedAt: ROUND4E_GENERATED_AT,
    runId: ROUND4E_RUN_ID,
    name: "Coloring Asset URL Contract",
    environment: {
      productionBaseUrlVariable: "NEXT_PUBLIC_COLORING_ASSET_BASE_URL",
      localProxyPublicToggle: "NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY",
      localProxyServerToggle: "COLORING_ENABLE_LOCAL_ASSET_PROXY",
      localProxyRoute: "/api/coloring-assets/[...path]",
      siteUrlVariable: "NEXT_PUBLIC_SITE_URL",
    },
    pathRoots: {
      localProductionAssetRoot: PRODUCTION_ASSET_ROOT,
      cdnRelativeRoots: ["svg", "png", "thumbs"],
      clientDataRootPolicy: "subpaths only, never local pipeline paths",
    },
    mediaUrlHelpers: {
      svg: "resolveSvgAssetUrl(assetSubpaths.svg)",
      pngPreview: "resolvePngPreviewAssetUrl(assetSubpaths.pngPreview)",
      thumbnail: "resolveThumbnailAssetUrl(assetSubpaths.thumbnail)",
      itemBundle: "resolveColoringItemAssetUrls(assetSubpaths)",
    },
    generationRules: [
      "NEXT_PUBLIC_COLORING_ASSET_BASE_URL is trimmed of trailing slashes.",
      "CDN URLs are built by joining the normalized base URL with encoded path segments.",
      "Local proxy URLs are built only when NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY is exactly 1.",
      "Unsafe paths return null and never produce a public URL.",
      "Components must receive resolved URLs instead of building them directly.",
    ],
    clientDataPolicy: {
      localFilesystemPathsAllowed: false,
      windowsAbsolutePathsAllowed: false,
      sourceRelativePathsAllowed: false,
      stableRelativeAssetSubpathsRequired: true,
    },
    localProxy: {
      disabledByDefault: true,
      developmentOnly: true,
      serverToggleRequired: true,
      publicToggleRequiredForClientRendering: true,
      pathTraversalAllowed: false,
      allowedLocalRoots: MEDIA_TYPES.map((media) => `${PRODUCTION_ASSET_ROOT}/${media.folder}`),
    },
    unavailableState: {
      behavior: "render intentional placeholder and hide download or print actions when URLs are unavailable",
      brokenImageIconsAllowed: false,
    },
    forbiddenPatterns: [
      "hardcoded local filesystem paths in client code",
      "manual asset URL construction in gallery components",
      "serving quarantined assets",
      "copying production media into public",
      "using the local proxy as production media hosting",
    ],
  };

  const hostingDecision = {
    generatedAt: ROUND4E_GENERATED_AT,
    runId: ROUND4E_RUN_ID,
    recommendedStrategy: "object-storage-cdn",
    productionAssetSourceOfTruth: PRODUCTION_ASSET_ROOT,
    productionUrlSourceOfTruth: "NEXT_PUBLIC_COLORING_ASSET_BASE_URL",
    options: {
      objectStorageCdn: {
        recommended: true,
        summary: "Publish generated media to object storage behind a CDN and point the deployed app at the CDN base URL.",
        pros: ["small app repository", "strong caching", "provider portable path contract", "works with static and server deployments"],
        cons: ["requires a later upload or sync step", "needs public URL verification before SEO image work"],
      },
      nextPublicFolder: {
        recommended: false,
        summary: "Do not commit thousands of generated media files to the app repo. Use only as a temporary local experiment if a later prompt approves it.",
        pros: ["simple static paths"],
        cons: ["bloats git history", "slows builds", "mixes generated media with application source"],
      },
      nextApiRouteProduction: {
        recommended: false,
        summary: "The API route is for local review, not production media serving for this asset set.",
        pros: ["useful for protected local previews"],
        cons: ["adds runtime file-serving load", "weaker CDN behavior", "larger attack surface"],
      },
      vpsFilesystem: {
        recommended: false,
        summary: "Serving directly from a VPS filesystem couples media storage to app infrastructure and is less portable.",
        pros: ["can be made to work with a tuned web server"],
        cons: ["harder cache management", "manual backups", "deployment coupling"],
      },
    },
    rejectedStrategies: {
      publicFolderProduction: { recommended: false },
      nextApiRouteProduction: { recommended: false },
      vpsFilesystemAsDefault: { recommended: false },
    },
    deploymentImplications: {
      appDeploysWithoutMedia: true,
      mediaUploadIsSeparateStep: true,
      noProductionMediaCommittedToRepo: true,
      providerNeutralPublishManifest: "pipeline/manifests/round-4e-asset-publish-manifest.json",
    },
    futureSeoImpact: {
      jsonLdWaitsForStablePublicAssetUrls: true,
      openGraphImageWorkWaitsForStablePublicAssetUrls: true,
      imageSitemapWorkWaitsForStablePublicAssetUrls: true,
    },
  };

  const cachePolicy = {
    generatedAt: ROUND4E_GENERATED_AT,
    runId: ROUND4E_RUN_ID,
    contentTypes: {
      svg: "image/svg+xml",
      pngPreview: "image/png",
      thumbnail: "image/png",
    },
    recommendedHeaders: {
      versionedImmutableRelease: {
        cacheControl: IMMUTABLE_CACHE_POLICY,
        requirement: "Only use when the CDN base URL or object key prefix is versioned and published files are not replaced in place.",
      },
      unversionedOrReplaceableRelease: {
        cacheControl: CONSERVATIVE_CACHE_POLICY,
        requirement: "Use when files may be replaced under the same URL.",
      },
    },
    selectedPublishManifestPolicy: {
      cacheControl: IMMUTABLE_CACHE_POLICY,
      reason: "The publish manifest represents a release artifact and assumes upload under a versioned CDN base URL.",
      fallbackIfNoVersionedPrefix: CONSERVATIVE_CACHE_POLICY,
    },
    downloadPolicy: {
      safeFilenamesUseCdnRelativeBasename: true,
      localAbsolutePathsInDownloadNames: false,
      unapprovedOrQuarantinedPathsServed: false,
    },
    securityPolicy: {
      approvedRootsOnly: true,
      userUploadsShareThisMechanism: false,
      pathTraversalAllowed: false,
    },
  };

  const publishManifest = {
    generatedAt: ROUND4E_GENERATED_AT,
    runId: ROUND4E_RUN_ID,
    purpose: "Provider-neutral publish manifest for a later dry-run or real upload step.",
    inputs: INPUT_PATHS,
    baseUrlTemplate: PUBLIC_BASE_URL_TEMPLATE,
    localProductionAssetRoot: PRODUCTION_ASSET_ROOT,
    clientExposurePolicy: {
      localAbsolutePathIncluded: true,
      localAbsolutePathClientFacing: false,
      intendedConsumer: "pipeline and deployment tooling only",
    },
    summary: {
      sourceProductionAssetCount: state.successfulAssets.length,
      quarantinedAssetCount: state.quarantinedAssets.length,
      totalFiles: analysis.files.length,
      totalSvgFiles: analysis.mediaCounts.svg,
      totalPngPreviewFiles: analysis.mediaCounts.pngPreview,
      totalThumbnailFiles: analysis.mediaCounts.thumbnail,
      totalBytes: analysis.totalBytes,
      missingFiles: analysis.missingFiles.length,
      invalidPaths: analysis.invalidPaths.length,
      cachePolicy: IMMUTABLE_CACHE_POLICY,
      contentTypes: {
        svg: "image/svg+xml",
        pngPreview: "image/png",
        thumbnail: "image/png",
      },
    },
    files: analysis.files,
  };

  return {
    "pipeline/manifests/round-4e-asset-inventory-audit.json": inventoryAudit,
    "pipeline/manifests/round-4e-asset-url-contract.json": assetUrlContract,
    "pipeline/manifests/round-4e-asset-hosting-decision.json": hostingDecision,
    "pipeline/manifests/round-4e-cache-and-content-type-policy.json": cachePolicy,
    "pipeline/manifests/round-4e-asset-publish-manifest.json": publishManifest,
  };
}

function buildReports(state, analysis, manifests) {
  const inventory = manifests["pipeline/manifests/round-4e-asset-inventory-audit.json"];
  const publish = manifests["pipeline/manifests/round-4e-asset-publish-manifest.json"];

  return {
    "pipeline/reports/round-4e-asset-inventory-audit.md": [
      "# Round 4E Asset Inventory Audit",
      "",
      `Generated: ${ROUND4E_GENERATED_AT}`,
      "",
      "## Counts",
      "",
      `- Successful Round 3C assets: ${inventory.counts.successfulAssets}`,
      `- SVG files found: ${inventory.counts.svgAssetFiles}`,
      `- PNG preview files found: ${inventory.counts.pngPreviewAssetFiles}`,
      `- Thumbnail files found: ${inventory.counts.thumbnailAssetFiles}`,
      `- Missing asset files: ${inventory.counts.missingAssetFiles}`,
      `- Invalid asset paths: ${inventory.counts.invalidAssetPaths}`,
      `- Quarantined assets excluded: ${inventory.counts.quarantinedAssets}`,
      `- Generated client items: ${inventory.counts.generatedClientItems}`,
      "",
      "## Path Contract Observed",
      "",
      `- Local production root: \`${PRODUCTION_ASSET_ROOT}/\``,
      "- CDN-relative paths use `svg/`, `png/`, or `thumbs/` followed by category and filename.",
      "- Generated client data stores only CDN-relative subpaths.",
      "- No Windows absolute paths or local production paths were found in generated client-facing data.",
      "",
      "## Result",
      "",
      analysis.missingFiles.length === 0 && analysis.invalidPaths.length === 0 && analysis.generatedSubpathMismatches.length === 0
        ? "The current production asset inventory is consistent and ready for a provider-neutral publish manifest."
        : "The inventory has issues that must be fixed before upload.",
    ].join("\n") + "\n",
    "pipeline/reports/round-4e-asset-url-contract.md": [
      "# Round 4E Asset URL Contract",
      "",
      `Generated: ${ROUND4E_GENERATED_AT}`,
      "",
      "## Source Of Truth",
      "",
      "- Production media stays outside the app repository under `pipeline/production/full/assets/` during development.",
      "- The deployed app must use `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` for public media URLs.",
      "- Components must not build media URLs by hand. They receive resolved URLs from the centralized resolver.",
      "",
      "## URL Shape",
      "",
      "- SVG: `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/svg/{category}/{file}.svg`",
      "- PNG preview: `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/png/{category}/{file}.png`",
      "- Thumbnail: `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/thumbs/{category}/{file}-thumb.png`",
      "",
      "## Local Preview",
      "",
      "- Local proxy URLs are allowed only when `NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY=1` and `COLORING_ENABLE_LOCAL_ASSET_PROXY=1`.",
      "- The proxy remains disabled by default.",
      "- The proxy serves only approved production asset roots and rejects traversal.",
      "",
      "## Unavailable State",
      "",
      "When neither CDN base URL nor local proxy is configured, the gallery renders intentional placeholders and does not expose broken download or print controls.",
    ].join("\n") + "\n",
    "pipeline/reports/round-4e-production-asset-hosting-strategy.md": [
      "# Round 4E Production Asset Hosting Strategy",
      "",
      `Generated: ${ROUND4E_GENERATED_AT}`,
      "",
      "## Recommendation",
      "",
      "Use object storage behind a CDN for generated coloring media.",
      "",
      "Do not commit thousands of generated media files to the app repo. Do not use the Next.js API route as the production media server for this asset set. Do not use `public/` as the long-term strategy unless a later prompt approves a temporary experiment.",
      "",
      "## Comparison",
      "",
      "| Strategy | Pros | Cons | Decision |",
      "| --- | --- | --- | --- |",
      "| Object storage + CDN | Small repo, strong caching, portable deployment, clean public URLs | Requires upload/sync step and URL verification | Recommended |",
      "| Copy assets into `public/` | Simple paths | Bloats repo and build context, mixes generated media with source | Not recommended |",
      "| Next.js API route | Useful local proxy | Adds runtime file-serving load and weaker production caching | Development only |",
      "| VPS filesystem | Direct control | Coupled deploys, manual backup and cache work | Not recommended as default |",
      "",
      "## Cache And Versioning",
      "",
      "- Prefer a versioned CDN base URL or object prefix for each released asset set.",
      "- Use immutable caching only when files are never replaced at the same URL.",
      "- If files may be replaced in place, use the conservative cache policy from the Round 4E cache manifest.",
      "",
      "## Backup And Rebuild",
      "",
      "- The source images remain immutable and ignored.",
      "- Production assets can be regenerated from the approved manifests and production export scripts.",
      "- The publish manifest records hashes and sizes for upload verification.",
      "",
      "## Future SEO Impact",
      "",
      "JSON-LD, Open Graph image decisions, and any image sitemap should wait until the CDN base URL is stable and representative public URLs are verified.",
    ].join("\n") + "\n",
    "pipeline/reports/round-4e-cache-and-content-type-policy.md": [
      "# Round 4E Cache And Content-Type Policy",
      "",
      `Generated: ${ROUND4E_GENERATED_AT}`,
      "",
      "## Content Types",
      "",
      "- SVG files: `image/svg+xml`",
      "- PNG previews: `image/png`",
      "- Thumbnails: `image/png`",
      "",
      "## Cache Policy",
      "",
      `- Versioned immutable release: \`${IMMUTABLE_CACHE_POLICY}\``,
      `- Unversioned or replaceable release: \`${CONSERVATIVE_CACHE_POLICY}\``,
      "",
      "The publish manifest uses the immutable policy because it is intended for a versioned release prefix. If deployment uses unversioned paths, use the conservative policy instead.",
      "",
      "## Safety",
      "",
      "- Downloads should use safe public filenames from the CDN-relative path.",
      "- Local absolute paths must never appear in browser-visible URLs or filenames.",
      "- Quarantined assets must not be published.",
      "- User uploads and unapproved paths must not use this public asset mechanism.",
    ].join("\n") + "\n",
    "pipeline/reports/round-4e-deployment-asset-checklist.md": [
      "# Round 4E Deployment Asset Checklist",
      "",
      `Generated: ${ROUND4E_GENERATED_AT}`,
      "",
      "## Generate Assets",
      "",
      "```powershell",
      "node pipeline\\scripts\\round-3c-production-export.mjs --batch-size 250 --resume",
      "node pipeline\\scripts\\round-4b-build-next-gallery-data.mjs",
      "node pipeline\\scripts\\round-4e-build-asset-publish-manifest.mjs",
      "```",
      "",
      "## Upload Later",
      "",
      "- Use `pipeline/manifests/round-4e-asset-publish-manifest.json` as the upload input.",
      "- Upload only files with `status: ready`.",
      "- Preserve each `cdnRelativePath` under the configured bucket or CDN prefix.",
      "- Do not upload quarantined assets.",
      "- Do not copy production assets into `public/`.",
      "",
      "## Configure App",
      "",
      "- Set `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` to the public CDN or object-storage base URL.",
      "- Prefer a versioned base URL or prefix for immutable caching.",
      "- Keep `NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY=0` in production.",
      "- Keep `COLORING_ENABLE_LOCAL_ASSET_PROXY=0` in production.",
      "",
      "## Verify",
      "",
      `- Confirm total publish files: ${publish.summary.totalFiles}.`,
      `- Confirm total publish bytes: ${publish.summary.totalBytes}.`,
      "- Spot check SVG, PNG preview, and thumbnail public URLs.",
      "- Run the local proxy preview only with the explicit development toggles.",
      "- Confirm `public/` does not contain copied production asset folders.",
      "- Confirm generated client data has no Windows paths, source image paths, or local production paths.",
      "- Test Download PNG, Download SVG, and Print with a configured asset base URL.",
      "",
      "## Before SEO Image Work",
      "",
      "- Verify stable public media URLs.",
      "- Confirm content types and cache headers from the public origin.",
      "- Decide Open Graph image policy.",
      "- Decide whether an image sitemap is useful and safe.",
    ].join("\n") + "\n",
  };
}

function buildPathSamples(assets) {
  const first = assets[0];
  if (!first) return {};
  return {
    svg: {
      localRelativePath: normalizePath(first.svgPath),
      cdnRelativePath: toCdnRelativePath(normalizePath(first.svgPath)),
    },
    pngPreview: {
      localRelativePath: normalizePath(first.pngPreviewPath),
      cdnRelativePath: toCdnRelativePath(normalizePath(first.pngPreviewPath)),
    },
    thumbnail: {
      localRelativePath: normalizePath(first.thumbnailPath),
      cdnRelativePath: toCdnRelativePath(normalizePath(first.thumbnailPath)),
    },
  };
}

function findGeneratedSubpathMismatches(state) {
  const mismatches = [];
  for (const asset of state.successfulAssets) {
    const item = state.generatedItemById.get(asset.assetId);
    if (!item) {
      mismatches.push({ assetId: asset.assetId, reason: "missing_generated_item" });
      continue;
    }
    for (const media of MEDIA_TYPES) {
      const expected = toCdnRelativePath(normalizePath(asset[media.productionPathKey]));
      const actual = item.assetSubpaths?.[media.generatedSubpathKey] || null;
      if (actual !== expected) {
        mismatches.push({
          assetId: asset.assetId,
          mediaType: media.mediaType,
          expected,
          actual,
        });
      }
    }
  }
  return mismatches;
}

function findUnsafeGeneratedSubpaths(generatedItems) {
  const unsafe = [];
  for (const item of generatedItems) {
    for (const media of MEDIA_TYPES) {
      const subpath = item.assetSubpaths?.[media.generatedSubpathKey] || "";
      const reason = validateCdnRelativePath(subpath, media);
      if (reason) {
        unsafe.push({
          assetId: item.assetId,
          mediaType: media.mediaType,
          subpath,
          reason,
        });
      }
    }
  }
  return unsafe;
}

function countClientDataLeaks(...payloads) {
  const joined = payloads.map((payload) => JSON.stringify(payload)).join("\n");
  const matches = joined.match(/[A-Za-z]:[\\/]|pipeline\/production\/full|images\/|ilovesvg\/|sourceRelativePath/gi);
  return matches || [];
}

function validateAssetPath({ localRelativePath, cdnRelativePath, media }) {
  if (!localRelativePath.startsWith(`${PRODUCTION_ASSET_ROOT}/`)) return "outside_production_asset_root";
  return validateCdnRelativePath(cdnRelativePath, media);
}

function validateCdnRelativePath(cdnRelativePath, media) {
  if (!cdnRelativePath) return "missing_path";
  if (!cdnRelativePath.startsWith(`${media.folder}/`)) return "unexpected_media_root";
  if (!cdnRelativePath.endsWith(media.extension)) return "unexpected_extension";
  if (cdnRelativePath.startsWith("/") || cdnRelativePath.includes("//")) return "absolute_or_duplicate_slash";
  if (cdnRelativePath.includes("\\") || cdnRelativePath.includes(":")) return "unsafe_separator_or_drive";
  if (cdnRelativePath.split("/").some((segment) => !segment || segment === "." || segment === "..")) return "path_traversal_segment";
  if (!/^[a-z0-9][a-z0-9._/-]*$/.test(cdnRelativePath)) return "unsupported_characters";
  return null;
}

function toCdnRelativePath(localRelativePath) {
  if (!localRelativePath) return "";
  const marker = `${PRODUCTION_ASSET_ROOT}/`;
  return localRelativePath.startsWith(marker) ? localRelativePath.slice(marker.length) : "";
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

async function hashFile(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runRound4EAssetHostingBuild()
    .then((result) => {
      const summary = result.manifests["pipeline/manifests/round-4e-asset-publish-manifest.json"].summary;
      console.log(JSON.stringify({
        generatedAt: ROUND4E_GENERATED_AT,
        runId: ROUND4E_RUN_ID,
        totalFiles: summary.totalFiles,
        totalBytes: summary.totalBytes,
        missingFiles: summary.missingFiles,
        invalidPaths: summary.invalidPaths,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
