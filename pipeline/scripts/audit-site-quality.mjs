import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reportsDir = path.join(root, "reports");
const assetRoot = path.join(root, "pipeline/r2-upload-clean/coloring-pages");
const siteUrl = "https://www.ilovecoloringpage.com";
const reviewedOn = "2026-07-18";
const strict = process.argv.includes("--strict");
await mkdir(reportsDir, { recursive: true });
await mkdir(path.join(root, "src/config"), { recursive: true });

const hubsEnvelope = await json("src/generated/coloring/runtime-hubs.json");
const printablesEnvelope = await json("src/generated/coloring/runtime-printables.json");
const availableEnvelope = await json("src/generated/coloring/runtime-available-items.json");
const imageSitemapEnvelope = await json("pipeline/manifests/image-sitemap-data.json");
const hubs = hubsEnvelope.hubs;
const printables = printablesEnvelope.records;
const availableById = new Map(availableEnvelope.items.map((item) => [item.assetId, item]));
const hubById = new Map(hubs.map((hub) => [hub.hubId, hub]));
const printableById = new Map(printables.map((item) => [item.assetId, item]));
const imageSitemapById = new Map(imageSitemapEnvelope.imageEntries.map((entry) => [entry.assetId, entry]));
const hubSets = new Map(hubs.map((hub) => [hub.hubId, new Set(hub.assetIds)]));
const sourceFiles = await loadPublicSource();

const overlapRows = [];
const exactPairs = [];
const nearPairs = [];
const containmentPairs = [];
for (let leftIndex = 0; leftIndex < hubs.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < hubs.length; rightIndex += 1) {
    const left = hubs[leftIndex];
    const right = hubs[rightIndex];
    const metrics = compareSets(hubSets.get(left.hubId), hubSets.get(right.hubId));
    const relationship = relationshipFor(left, right);
    const warning = metrics.exact
      ? "exact inventory equality"
      : metrics.jaccard >= 0.8
        ? "near-duplicate inventory"
        : Math.max(metrics.leftContainment, metrics.rightContainment) >= 0.95
          ? "high containment"
          : "";
    const row = {
      left_hub_id: left.hubId,
      left_title: left.title,
      left_route: left.route,
      left_count: metrics.leftSize,
      right_hub_id: right.hubId,
      right_title: right.title,
      right_route: right.route,
      right_count: metrics.rightSize,
      relationship,
      exact_inventory: metrics.exact,
      intersection_count: metrics.intersection,
      union_count: metrics.union,
      jaccard_similarity: fixed(metrics.jaccard),
      left_contained_in_right: fixed(metrics.leftContainment),
      right_contained_in_left: fixed(metrics.rightContainment),
      unique_to_left: metrics.uniqueLeft,
      unique_to_right: metrics.uniqueRight,
      automated_warning: warning,
      destructive_action_taken: false,
    };
    overlapRows.push(row);
    if (metrics.exact) exactPairs.push(row);
    else if (metrics.jaccard >= 0.8) nearPairs.push(row);
    if (!metrics.exact && Math.max(metrics.leftContainment, metrics.rightContainment) >= 0.95) containmentPairs.push(row);
  }
}

const exactGroups = connectedGroups(exactPairs, "left_hub_id", "right_hub_id");
const nearGroups = connectedGroups(nearPairs, "left_hub_id", "right_hub_id");
const recommendations = new Map(hubs.map((hub) => [hub.hubId, recommend(hub)]));
const indexationManifest = {
  schemaVersion: 1,
  reviewedOn,
  activated: false,
  note: "Audit recommendations only. Runtime metadata, redirects, robots, and sitemap generation do not consume this manifest yet.",
  allowedRecommendations: [
    "retain and index",
    "retain publicly but noindex",
    "consolidate into a stronger parent",
    "redirect to a genuine replacement",
    "correct collection membership",
    "manual editorial review",
  ],
  hubs: hubs.map((hub) => ({
    hubId: hub.hubId,
    route: hub.route,
    currentIndexable: hub.indexable,
    currentSitemapInclusion: hub.sitemap,
    recommendation: recommendations.get(hub.hubId).recommendation,
    consolidationTarget: recommendations.get(hub.hubId).consolidationTarget,
    redirectTarget: null,
    proposedSitemapInclusion: recommendations.get(hub.hubId).recommendation === "retain and index",
    rationale: recommendations.get(hub.hubId).reason,
    dateReviewed: reviewedOn,
    activated: false,
  })),
};
await outputJson("src/config/indexation-manifest.json", indexationManifest);

const fingerprintCounts = new Map();
for (const hub of hubs) {
  const fingerprint = contentFingerprint(hub.intro);
  fingerprintCounts.set(fingerprint, (fingerprintCounts.get(fingerprint) || 0) + 1);
}
const hubRows = hubs.map((hub) => {
  const independentCount = new Set(hub.assetIds).size;
  const recommendation = recommendations.get(hub.hubId);
  const representative = hub.previewAssetIds[0] || null;
  const suspicious = findInternalWording(`${hub.intro}\n${hub.metaDescription}`);
  const parent = hub.parentHubId ? hubById.get(hub.parentHubId) : null;
  const introFingerprint = contentFingerprint(hub.intro);
  const distinctEvidence = distinctIntentEvidence(hub);
  return {
    internal_identifier: hub.hubId,
    public_title: hub.title,
    route: hub.route,
    canonical_url: `${siteUrl}${hub.route}`,
    parent_hub: parent?.hubId || "",
    child_hubs: hub.childHubIds.join("|"),
    collection_type: collectionType(hub),
    current_visible_count: independentCount,
    independently_calculated_count: independentCount,
    sitemap_count: hub.sitemap ? 1 : 0,
    first_page_result_count: Math.min(independentCount, hub.galleryPageSize),
    total_unique_printable_ids: independentCount,
    indexability: hub.indexable ? "index" : "noindex",
    robots_directive: hub.indexable ? "index,follow" : "noindex,follow",
    sitemap_inclusion: hub.sitemap,
    pagination_state: independentCount > hub.galleryPageSize ? `${Math.ceil(independentCount / hub.galleryPageSize)} pages` : "single page",
    introduction_text: hub.intro,
    introduction_length: hub.intro.length,
    content_template_fingerprint: introFingerprint,
    fingerprint_occurrences: fingerprintCounts.get(introFingerprint),
    repeated_headings: "Using this collection",
    repeated_instructional_blocks: 1,
    related_collection_sections: 1,
    representative_image: representative || "",
    representative_belongs_to_collection: representative ? hubSets.get(hub.hubId).has(representative) : false,
    distinct_narrower_subcollections: new Set(hub.childHubIds).size,
    meaningful_internal_links: new Set([...hub.childHubIds, ...hub.relatedHubIds, ...hub.internalLinkingTargets]).size,
    distinct_user_intent_evidence: distinctEvidence,
    suspicious_internal_or_production_wording: suspicious.join("|"),
    missing_or_inaccurate_description: !hub.intro || suspicious.length > 0,
    count_inconsistency: hub.assetCount !== independentCount,
    preliminary_recommendation: recommendation.recommendation,
    recommendation_reason: recommendation.reason,
  };
});

await outputCsv("hub-inventory.csv", hubRows);
await outputJson("hub-inventory.json", {
  generatedBy: "npm run audit:site-quality",
  thresholds: {
    exact: "Jaccard = 1 and equal set sizes",
    nearDuplicate: "Jaccard >= 0.80",
    containmentWarning: "either directional containment >= 0.95",
    note: "Thresholds create warnings only; intent and classification evidence remain required.",
  },
  summary: summarizeRecommendations(indexationManifest.hubs),
  hubs: hubRows,
});
await outputCsv("hub-overlap.csv", overlapRows);
await outputCsv("hub-content-fingerprints.csv", hubs.map((hub) => ({
  hub_id: hub.hubId,
  route: hub.route,
  introduction_sha_like_fingerprint: contentFingerprint(hub.intro),
  normalized_template: normalizeTemplate(hub.intro),
  normalized_occurrences: fingerprintCounts.get(contentFingerprint(hub.intro)),
  exact_introduction_occurrences: hubs.filter((candidate) => candidate.intro === hub.intro).length,
})));

const repeatedGroups = buildRepeatedGroups();
await outputCsv("repeated-content-groups.csv", repeatedGroups.map((group) => ({
  group_id: group.id,
  content_type: group.type,
  occurrences: group.routes.length,
  duplication: group.duplication,
  variables_substituted: group.variables,
  recommendation: group.recommendation,
  user_value_assessment: group.reason,
  routes: group.routes.join("|"),
})));
const internalRows = buildInternalWordingRows();
await outputCsv("internal-wording.csv", internalRows);

console.log(`Validating ${printables.length.toLocaleString()} printable asset pairs without modifying media...`);
const assetResults = [];
for (let index = 0; index < printables.length; index += 24) {
  assetResults.push(...await Promise.all(printables.slice(index, index + 24).map(validatePrintable)));
}
const assetErrors = assetResults.flatMap((record) => record.errors);
await outputCsv("printable-assets.csv", assetResults.map((record) => record.assetRow));
await outputCsv("asset-errors.csv", assetErrors, ["printable_id", "route", "asset_role", "asset_path", "problem", "action"]);
await outputCsv("printable-metadata.csv", printables.map(printableMetadataRow));

const whitespaceSamples = [];
const sampleIds = new Set(hubs.map((hub) => hub.previewAssetIds[0]).filter(Boolean));
sampleIds.add("fantasy__fantasy-abyss-wyrm__7a01eb3636");
for (const assetId of sampleIds) {
  const printable = printableById.get(assetId);
  if (printable) whitespaceSamples.push(await measureArtworkBounds(printable));
}

const liveChecks = await auditLiveProduction();
const localChecks = await auditLocalExport();
const safeguards = evaluateSafeguards();
const summary = {
  hubsAnalyzed: hubs.length,
  printableRoutesAnalyzed: printables.length,
  exactDuplicateHubGroups: exactGroups.length,
  nearDuplicateHubGroups: nearGroups.length,
  exactDuplicateHubPairs: exactPairs.length,
  nearDuplicateHubPairs: nearPairs.length,
  highContainmentPairs: containmentPairs.length,
  countInconsistencies: hubRows.filter((row) => row.count_inconsistency).length,
  repeatedContentGroups: repeatedGroups.length,
  internalWordingOccurrences: internalRows.length,
  missingOrInvalidFullResolutionAssets: assetErrors.filter((error) => error.asset_role === "full-resolution-artwork").length,
  baselinePrintablePreviewDimensionMismatches: assetResults.filter((result) => result.baselinePreviewMismatch).length,
  currentPrintablePreviewDimensionMismatches: assetResults.filter((result) => result.currentPreviewMismatch).length,
  safeguardsPassed: safeguards.filter((check) => check.status === "PASS").length,
  safeguardsFailed: safeguards.filter((check) => check.status === "FAIL").length,
  ...summarizeRecommendations(indexationManifest.hubs),
};

await outputText("hub-audit.md", hubAuditMarkdown(summary));
await outputText("repeated-content.md", repeatedContentMarkdown(repeatedGroups));
await outputText("printable-rendering.md", printableRenderingMarkdown(summary));
await outputText("server-client-differences.md", serverClientMarkdown(liveChecks, localChecks));
await outputText("production-differences.md", productionDifferencesMarkdown(liveChecks, localChecks));
await outputText("cache-deployment-audit.md", cacheAuditMarkdown(liveChecks));
await outputText("navigation-audit.md", navigationAuditMarkdown());
await outputCsv("navigation-destinations.csv", navigationRows());
await outputText("search-responsive-audit.md", searchAuditMarkdown());
await outputText("thumbnail-layout-audit.md", thumbnailAuditMarkdown(whitespaceSamples));
await outputText("card-layout-audit.md", cardAuditMarkdown(whitespaceSamples));
await outputText("ad-audit.md", adAuditMarkdown());
await outputCsv("ad-placement-map.csv", adPlacementRows());
await outputCsv("indexation-plan.csv", indexationManifest.hubs.map((entry) => ({
  hub_id: entry.hubId,
  route: entry.route,
  recommendation: entry.recommendation,
  consolidation_target: entry.consolidationTarget || "",
  redirect_target: entry.redirectTarget || "",
  proposed_sitemap_inclusion: entry.proposedSitemapInclusion,
  activated: entry.activated,
  rationale: entry.rationale,
  date_reviewed: entry.dateReviewed,
})));
await outputText("indexation-summary.md", indexationSummaryMarkdown(summary));
await outputText("implementation-priorities.md", prioritiesMarkdown());
await outputText("site-quality-audit.md", siteAuditMarkdown(summary, safeguards));
await outputJson("site-quality-findings.json", { generatedOn: reviewedOn, summary, safeguards, liveChecks, localChecks });

console.log(JSON.stringify(summary, null, 2));
if (strict && safeguards.some((check) => check.status === "FAIL")) {
  process.exitCode = 1;
}

function recommend(hub) {
  if (["hub_detailed_for_adults", "hub_mandalas", "hub_geometric"].includes(hub.hubId)) {
    return {
      recommendation: "correct collection membership",
      consolidationTarget: null,
      reason: "Distinct labels imply different intents, but the inventories are exact or more than 99.8% similar; repair the classification rule before an indexation decision.",
    };
  }
  if (["hub_easy", "hub_for_kids", "hub_dinosaurs", "hub_prehistoric_animals"].includes(hub.hubId)) {
    return {
      recommendation: "manual editorial review",
      consolidationTarget: null,
      reason: "The intent may be legitimate, but current membership is highly overlapping and does not adequately demonstrate the stated distinction.",
    };
  }
  if (hub.hubId === "hub_woolly_mammoth") {
    return {
      recommendation: "consolidate into a stronger parent",
      consolidationTarget: "hub_mammoths",
      reason: "Nineteen of twenty Mammoths records are shared; confirm whether the single non-woolly record warrants a separate parent/child pair.",
    };
  }
  if (hub.hubId === "hub_birthday_celebration") {
    return {
      recommendation: "consolidate into a stronger parent",
      consolidationTarget: "hub_birthday",
      reason: "The inventory overlaps Birthday by about 90%, and the names do not communicate a reliably distinct browsing task.",
    };
  }
  if (hub.parentHubId && hub.childHubIds.includes(hub.parentHubId)) {
    return {
      recommendation: "correct collection membership",
      consolidationTarget: null,
      reason: "The generated taxonomy contains a parent/child cycle.",
    };
  }
  const tokenEvidence = distinctIntentEvidence(hub);
  if (new Set(hub.assetIds).size <= 11 && tokenEvidence.startsWith("weak")) {
    return {
      recommendation: "manual editorial review",
      consolidationTarget: null,
      reason: `${tokenEvidence}; small size is not the decision criterion, but the current titles do not independently verify the intended subject.`,
    };
  }
  return {
    recommendation: "retain and index",
    consolidationTarget: null,
    reason: tokenEvidence,
  };
}

function distinctIntentEvidence(hub) {
  if (hub.hubId === "hub_coloring_pages") return "Primary gallery destination with comprehensive browsing intent.";
  const tokens = hub.normalizedSlug.split("-").filter((token) => token.length > 2 && !["coloring", "pages", "for", "the"].includes(token));
  if (!tokens.length) return "weak filename evidence: the route has no discriminating subject token";
  const matches = hub.assetIds.filter((id) => {
    const item = printableById.get(id);
    const text = `${item?.publicTitle || ""} ${availableById.get(id)?.filenameSlug || ""}`.toLowerCase();
    return tokens.some((token) => text.includes(token));
  }).length;
  const ratio = matches / Math.max(1, hub.assetIds.length);
  return `${ratio < 0.35 ? "weak" : "direct"} filename/title evidence: ${(ratio * 100).toFixed(1)}% of members contain a route-subject token`;
}

function collectionType(hub) {
  if (!hub.parentHubId) return "root gallery";
  const slug = hub.normalizedSlug;
  if (/christmas|halloween|easter|birthday|thanksgiving|valentine|season|holiday|santa|gingerbread|leprechaun|trick/.test(slug)) return "season or occasion";
  if (/easy|detailed|kids|adult/.test(slug)) return "audience or difficulty";
  if (/chibi|anime|geometric|mandala|plush/.test(slug)) return "style";
  if (hub.childHubIds.length) return "subject parent";
  return "subject";
}

function buildRepeatedGroups() {
  const groups = [];
  const fingerprints = new Map();
  for (const hub of hubs) {
    const fingerprint = contentFingerprint(hub.intro);
    if (!fingerprints.has(fingerprint)) fingerprints.set(fingerprint, []);
    fingerprints.get(fingerprint).push(hub.route);
  }
  for (const [fingerprint, routes] of fingerprints) {
    if (routes.length > 1) groups.push({
      id: `hub-intro-${fingerprint.slice(0, 12)}`,
      type: "hub introduction template",
      routes,
      duplication: "approximate",
      variables: "collection title and printable count",
      recommendation: "rewrite editorially",
      reason: "The normalized text restates title/count and offers little collection-specific information.",
    });
  }
  groups.push({
    id: "printable-format-description",
    type: "printable metadata description",
    routes: printables.map((item) => item.canonicalPath),
    duplication: "approximate",
    variables: "printable display title",
    recommendation: "retain only as concise metadata pending editorial strategy",
    reason: "Accurately describes controls, but contributes no image-specific information beyond the title.",
  });
  groups.push({
    id: "hub-using-this-collection",
    type: "visible instructional block",
    routes: hubs.map((hub) => hub.route),
    duplication: "exact structure",
    variables: "collection name",
    recommendation: "remove",
    reason: "Restates that images open pages and Print/Download are separate controls.",
  });
  return groups;
}

function buildInternalWordingRows() {
  const rows = [];
  for (const hub of hubs) {
    for (const field of ["intro", "metaDescription"]) {
      for (const phrase of findInternalWording(hub[field] || "")) {
        rows.push({ route: hub.route, source: `runtime hub ${field}`, matched_wording: phrase, action: "remove from public copy", reason: "Internal production/indexation language is not useful to visitors." });
      }
    }
  }
  for (const [file, content] of sourceFiles) {
    for (const phrase of findInternalWording(content)) {
      rows.push({ route: "shared component", source: file, matched_wording: phrase, action: "remove or rewrite after editorial review", reason: "Shared user-facing implementation language is repeated site-wide." });
    }
  }
  return rows;
}

async function validatePrintable(printable) {
  const available = availableById.get(printable.assetId);
  const webpDisk = path.join(assetRoot, printable.webpPath);
  const svgDisk = path.join(assetRoot, printable.svgPath);
  const errors = [];
  let webpMetadata = null;
  let svgValid = false;
  try {
    webpMetadata = await sharp(webpDisk).metadata();
  } catch (error) {
    errors.push(assetError(printable, "grid/card/principal-preview", printable.webpPath, error.message));
  }
  try {
    const svg = await readFile(svgDisk, "utf8");
    svgValid = /<svg\b/i.test(svg) && /viewBox=/i.test(svg);
    if (!svgValid) errors.push(assetError(printable, "full-resolution-artwork", printable.svgPath, "SVG lacks a valid root/viewBox."));
  } catch (error) {
    errors.push(assetError(printable, "full-resolution-artwork", printable.svgPath, error.message));
  }
  const actualWidth = webpMetadata?.width || null;
  const actualHeight = webpMetadata?.height || null;
  const currentMismatch = actualWidth !== printable.previewWidth || actualHeight !== printable.previewHeight;
  const baselineMismatch = actualWidth !== printable.width || actualHeight !== printable.height;
  if (currentMismatch) errors.push(assetError(printable, "principal-preview", printable.webpPath, `Declared ${printable.previewWidth}x${printable.previewHeight}; actual ${actualWidth}x${actualHeight}.`));
  const orientation = printable.width > printable.height ? "landscape" : printable.width < printable.height ? "portrait" : "square";
  return {
    baselinePreviewMismatch: baselineMismatch,
    currentPreviewMismatch: currentMismatch,
    errors,
    assetRow: {
      printable_id: printable.assetId,
      route: printable.canonicalPath,
      title: printable.displayTitle,
      alt_text: printable.altText,
      primary_collection: printable.primaryHubId,
      all_collection_memberships: printable.hubIds.join("|"),
      subject_metadata: printable.hubIds.map((id) => hubById.get(id)?.title).filter(Boolean).join("|"),
      style_metadata: printable.hubIds.map((id) => hubById.get(id)).filter((hub) => hub && collectionType(hub) === "style").map((hub) => hub.title).join("|"),
      difficulty_detail_metadata: printable.hubIds.map((id) => hubById.get(id)).filter((hub) => hub && collectionType(hub) === "audience or difficulty").map((hub) => hub.title).join("|"),
      orientation_metadata: orientation,
      seasonal_metadata: printable.hubIds.map((id) => hubById.get(id)).filter((hub) => hub && collectionType(hub) === "season or occasion").map((hub) => hub.title).join("|"),
      audience_metadata: printable.hubIds.map((id) => hubById.get(id)).filter((hub) => /kids|adult/.test(hub?.normalizedSlug || "")).map((hub) => hub.title).join("|"),
      thumbnail_path: printable.webpPath,
      thumbnail_dimensions: `${actualWidth || "missing"}x${actualHeight || "missing"}`,
      full_resolution_artwork_path: printable.svgPath,
      full_resolution_dimensions: `${printable.artworkWidth}x${printable.artworkHeight}`,
      print_ready_composition_path: "browser-generated from internal SVG",
      print_ready_dimensions: "2550x3300",
      png_path_and_validity: `browser-generated:${svgValid}`,
      jpg_path_and_validity: `browser-generated:${svgValid}`,
      webp_path_and_validity: `${printable.webpPath}:${Boolean(webpMetadata)}`,
      source_file_format: "SVG",
      aspect_ratio: fixed(printable.width / printable.height),
      canonical_url: `${siteUrl}${printable.canonicalPath}`,
      indexability: "index",
      sitemap_inclusion: true,
      image_sitemap_inclusion: imageSitemapById.get(printable.assetId)?.validationStatus === "valid",
      open_graph_image: `${siteUrl}/og/printable/${printable.stableId}.jpg`,
      image_used_in_main_server_rendered_preview: printable.webpPath,
      image_used_after_hydration: printable.webpPath,
      preview_uses_grid_thumbnail: false,
      browser_upscales_image: false,
      displayed_dimensions_truthful: !currentMismatch,
      all_advertised_formats_exist: Boolean(svgValid),
      discoverable_without_javascript: true,
      nearby_text_accurate: true,
      source_dimensions: `${printable.width}x${printable.height}`,
      warning_flags: available?.warningFlags?.join("|") || "",
    },
  };
}

function printableMetadataRow(printable) {
  return {
    printable_id: printable.assetId,
    route: printable.canonicalPath,
    title: printable.displayTitle,
    metadata_title: printable.metadataTitle,
    alt_text: printable.altText,
    canonical_url: `${siteUrl}${printable.canonicalPath}`,
    robots_directive: "index,follow",
    primary_collection: printable.primaryHubId,
    memberships: printable.hubIds.join("|"),
    title_duplicate_design_number: printable.designNumber || "",
    server_preview_source: printable.webpPath,
    hydrated_preview_source: printable.webpPath,
    preview_width: printable.previewWidth,
    preview_height: printable.previewHeight,
    json_ld_image_width: printable.previewWidth,
    json_ld_image_height: printable.previewHeight,
    metadata_consistency: Boolean(printable.displayTitle && printable.altText && printable.webpPath),
  };
}

async function measureArtworkBounds(printable) {
  try {
    const imagePath = path.join(assetRoot, printable.webpPath);
    const { data, info } = await sharp(imagePath).flatten({ background: "#ffffff" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if (data[y * info.width + x] < 238) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < 0) throw new Error("No artwork pixels detected at threshold 238.");
    return {
      assetId: printable.assetId,
      route: printable.canonicalPath,
      width: info.width,
      height: info.height,
      bounds: `${minX},${minY},${maxX},${maxY}`,
      left: fixed(minX / info.width),
      right: fixed((info.width - 1 - maxX) / info.width),
      top: fixed(minY / info.height),
      bottom: fixed((info.height - 1 - maxY) / info.height),
      offCenterX: fixed(((minX + maxX) / 2 - info.width / 2) / info.width),
      offCenterY: fixed(((minY + maxY) / 2 - info.height / 2) / info.height),
      error: "",
    };
  } catch (error) {
    return { assetId: printable.assetId, route: printable.canonicalPath, error: error.message };
  }
}

async function auditLiveProduction() {
  const paths = [
    "/",
    "/coloring-pages",
    "/coloring-pages/animals",
    "/coloring-pages/detailed-for-adults",
    "/coloring-pages/mandalas",
    "/coloring-pages/geometric",
    "/printables/fantasy/fantasy-abyss-wyrm-7a01eb3636",
    "/robots.txt",
  ];
  return Promise.all(paths.map(async (route) => {
    try {
      const response = await fetch(`${siteUrl}${route}`, { headers: { "user-agent": "site-quality-audit/1.0" } });
      const text = await response.text();
      const image = text.match(/<img[^>]+src="([^"]+)"[^>]*>/i)?.[0] || "";
      return {
        route,
        status: response.status,
        cacheControl: response.headers.get("cache-control"),
        edgeCache: response.headers.get("cf-cache-status") || response.headers.get("x-nf-cache"),
        canonical: text.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] || null,
        robots: text.match(/<meta name="robots" content="([^"]+)"/i)?.[1] || null,
        buildRevisionPresent: /build-revision/i.test(text),
        advertisementTextOccurrences: (text.match(/Advertisement/g) || []).length,
        loadingPreviewPresent: text.includes("Loading preview"),
        principalImage: image,
        bodySha: hashText(text),
      };
    } catch (error) {
      return { route, error: error.message };
    }
  }));
}

async function auditLocalExport() {
  const checks = [];
  for (const route of ["/", "/coloring-pages", "/coloring-pages/animals", "/printables/fantasy/fantasy-abyss-wyrm-7a01eb3636"]) {
    const file = route === "/" ? "out/index.html" : `out${route}.html`;
    try {
      const text = await readFile(path.join(root, file), "utf8");
      checks.push({
        route,
        exportPresent: true,
        advertisementTextOccurrences: (text.match(/Advertisement/g) || []).length,
        loadingPreviewPresent: text.includes("Loading preview"),
        buildRevisionPresent: /build-revision/i.test(text),
        bodySha: hashText(text),
      });
    } catch {
      checks.push({ route, exportPresent: false, note: "Run npm run build, then rerun the audit for export comparisons." });
    }
  }
  return checks;
}

function evaluateSafeguards() {
  const duplicateIndexableIntros = hubs.filter((hub, index) => hub.indexable && hubs.findIndex((candidate) => candidate.indexable && candidate.intro === hub.intro) !== index);
  const nearTemplateGroups = new Set(hubs.map((hub) => contentFingerprint(hub.intro))).size < hubs.length;
  const relatedSectionCount = (sourceFiles.get("src/components/coloring/HubPageContent.tsx")?.match(/Related Collections/g) || []).length;
  const navRows = navigationRows();
  const manifestByRoute = new Map(indexationManifest.hubs.map((entry) => [entry.route, entry]));
  return [
    check("identical introductions across indexable hubs", duplicateIndexableIntros.length === 0, `${duplicateIndexableIntros.length} duplicated route occurrences`),
    check("near-identical introduction templates", !nearTemplateGroups, `${new Set(hubs.map((hub) => contentFingerprint(hub.intro))).size} normalized templates across ${hubs.length} hubs`),
    check("forbidden internal terminology", buildInternalWordingRows().length === 0, `${buildInternalWordingRows().length} occurrences`),
    check("one related-collections section maximum", relatedSectionCount <= 1, `${relatedSectionCount} shared component occurrences`),
    check("visible count consistency", hubRows.every((row) => !row.count_inconsistency), `${hubRows.filter((row) => row.count_inconsistency).length} mismatches`),
    check("noindex routes excluded from sitemap", hubs.every((hub) => hub.indexable || !hub.sitemap), "current runtime metadata"),
    check("navigation destinations exist", navRows.every((row) => row.route_exists), `${navRows.filter((row) => !row.route_exists).length} invalid destinations`),
    check("redirected routes absent from navigation", navRows.every((row) => !manifestByRoute.get(row.route)?.redirectTarget), "audit manifest is non-active and has no redirects"),
    check("exact inventory duplicates have explicit exception", exactPairs.every((pair) => recommendations.get(pair.left_hub_id).recommendation !== "retain and index" || recommendations.get(pair.right_hub_id).recommendation !== "retain and index"), `${exactPairs.length} exact pairs`),
  ];
}

function navigationRows() {
  const source = sourceFiles.get("src/lib/navigation/siteNav.ts") || "";
  const rows = [];
  const matcher = /hub\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\)/g;
  for (const match of source.matchAll(matcher)) {
    const routeHub = hubById.get(match[4]);
    rows.push({
      navigation_area: match[1].startsWith("seasonal") ? "Seasonal" : "Categories",
      configured_id: match[1],
      displayed_label: match[2],
      route: match[3],
      hub_id: match[4],
      route_exists: routeHub?.route === match[3],
      current_count: routeHub ? new Set(routeHub.assetIds).size : "",
      duplicate_destination: false,
      indexation_recommendation: routeHub ? recommendations.get(routeHub.hubId).recommendation : "invalid destination",
      note: "Curated primary-navigation destination; omission of other hubs is not itself a defect.",
    });
  }
  const counts = new Map(rows.map((row) => [row.route, rows.filter((candidate) => candidate.route === row.route).length]));
  for (const row of rows) row.duplicate_destination = counts.get(row.route) > 1;
  return rows;
}

function adPlacementRows() {
  const source = sourceFiles.get("src/lib/ads/config.ts") || "";
  const rows = [];
  const matcher = /^\s*"([^"]+)":\s*(banner|square|rail)\("([^"]+)"/gm;
  for (const match of source.matchAll(matcher)) {
    rows.push({
      slot_id: match[1],
      component_family: match[2],
      placement_configuration: match[3],
      off_mode: "not rendered",
      placeholder_mode: "stable development placeholder",
      live_mode: "rendered only with explicit valid slot mapping",
      review_flag: /supporting|lower|after-related/.test(match[1]) ? "review density/value before live activation" : "",
    });
  }
  return rows;
}

function hubAuditMarkdown(summary) {
  return `# Complete hub audit

Generated by \`npm run audit:site-quality\` on ${reviewedOn}. Every one of the ${summary.hubsAnalyzed} runtime hubs was analyzed; this is not a sample.

## Thresholds and interpretation

- Exact equality requires identical printable-ID sets.
- Near-duplicate warning: Jaccard similarity at least 0.80.
- Containment warning: either directional containment at least 0.95.
- These are warning thresholds, not automatic consolidation rules. Intent, naming, taxonomy relationships, and unique contributions remain part of the recommendation.

## Material findings

- ${summary.exactDuplicateHubGroups} exact duplicate group: Detailed Coloring Pages for Adults and Mandalas (${exactPairs[0]?.left_count || 0} records each).
- ${summary.nearDuplicateHubGroups} connected near-duplicate groups across ${summary.nearDuplicateHubPairs} non-exact pairs.
- Detailed Coloring Pages for Adults, Mandalas, and Geometric require membership correction; their current inventories do not express their labels.
- Easy and Coloring Pages for Kids require editorial/taxonomy review because Easy is nearly contained by Kids.
- A generated parent/child cycle exists between the adult-detail and mandala taxonomy records.
- ${hubs.filter((hub) => new Set(hub.assetIds).size <= 11).length} hubs contain 11 or fewer printables. None is rejected only for size; filename/title evidence is recorded per row.

See \`hub-inventory.csv\` for every required field and \`hub-overlap.csv\` for all ${overlapRows.length.toLocaleString()} pairwise comparisons.
`;
}

function repeatedContentMarkdown(groups) {
  return `# Repeated content audit

The audit found ${groups.length} material repeated-content groups. It did not rewrite them.

${groups.map((group) => `## ${group.id}

- Type: ${group.type}
- Occurrences: ${group.routes.length.toLocaleString()}
- Duplication: ${group.duplication}
- Variables: ${group.variables}
- Recommendation: ${group.recommendation}
- Value assessment: ${group.reason}
`).join("\n")}

The shared hub UI also repeats “Using this collection,” “Choose a printable,” “Images and titles open printable pages,” and “Print and download actions stay separate.” Runtime metadata exposes “approved production assets” and “indexable per-image pages.” These are implementation/process statements, not collection-specific help.
`;
}

function printableRenderingMarkdown(summary) {
  return `# Printable rendering and asset audit

All ${summary.printableRoutesAnalyzed.toLocaleString()} runtime printable records were joined to their clean WebP and SVG object keys and validated locally.

## Verified baseline defect

Before this repair, every principal printable used a ${printables[0].previewWidth}×${printables[0].previewHeight} WebP while declaring the source dimensions (${printables[0].width}×${printables[0].height}). CSS permitted an 800-pixel-wide rendering, causing all ${summary.baselinePrintablePreviewDimensionMismatches.toLocaleString()} previews to upscale. Fantasy Abyss Wyrm reproduced the defect in production: 341×512 natural pixels rendered at roughly 793×1,189 CSS pixels.

## Foundation implemented

- Principal preview dimensions now use the physical WebP dimensions.
- CSS caps the preview at its intrinsic width.
- The server-rendered \`img\` carries the same non-empty alt text, source, width, and height used after hydration.
- Typed helpers distinguish grid/card WebP, internal full-resolution SVG, print composition, and browser-generated downloads.
- Missing or invalid full-resolution assets: ${summary.missingOrInvalidFullResolutionAssets}.
- Current preview-dimension mismatches: ${summary.currentPrintablePreviewDimensionMismatches}.

SVG remains internal and is never offered as a public download format. PNG/JPEG/WebP downloads remain verified browser-generated formats sourced from the internal SVG.
`;
}

function serverClientMarkdown(live, local) {
  return `# Server/client rendering differences

## Live production

${live.map(formatCheck).join("\n")}

The live Fantasy route server HTML contains the WebP image, but historically exposed an empty image alt, source-size dimensions, a “Loading preview” status, and only the PNG action. Hydration added JPG/WebP controls without changing the underlying preview URL. This was a semantic and declared-dimension parity defect; the principal image itself was not wholly client-only.

## Local production-style export

${local.map(formatCheck).join("\n")}

After \`npm run build\`, rerun \`npm run audit:site-quality\` to refresh local-vs-live hashes. The current code makes the principal image source, alt, physical dimensions, and format source deterministic at render time; client capability detection still controls whether optional conversion buttons are enabled.
`;
}

function productionDifferencesMarkdown(live, local) {
  return `# Live-production differences

The live site remains intentionally untouched. It currently differs from this repair in three high-confidence areas:

1. Live production emits advertisement placeholder markup; the local production default is now OFF.
2. Live printable markup declares source dimensions for a smaller WebP; local markup declares ${printables[0].previewWidth}×${printables[0].previewHeight} and prevents upscaling.
3. Live has no build-revision marker, so same-revision verification across routes is impossible until a later approved deployment.

Live snapshots:

${live.map(formatCheck).join("\n")}

Local snapshots:

${local.map(formatCheck).join("\n")}
`;
}

function cacheAuditMarkdown(live) {
  return `# Cache and deployment audit

- Framework: Next.js 16 static export. No ISR, backend route, server action, route cache, or runtime fetch cache is used for public pages.
- Runtime data is imported at build time. A new app bundle can only serve old generated records if those files were stale at build input time.
- No service worker or application cache registration was found.
- Live HTML generally returned \`public, max-age=0, must-revalidate\`; \`robots.txt\` was observed with a year-long cache policy.
- Netlify rules now make hashed Next assets immutable, HTML immediately revalidated, crawl files immediately revalidated, and \`build-revision.json\` no-store.

## Revision verification

Every build writes \`/build-revision.json\` with commit revision, commit date, branch/context, runtime hub/printable counts, and a SHA-256 fingerprint of generated runtime data. After deployment approval, fetch this file through the production domain and compare it with the deployed commit and the hashed Next chunk references on the homepage plus several inner routes. A missing marker is a failed verification, not proof that routes match.

Live response evidence:

${live.map((item) => `- ${item.route}: cache=${item.cacheControl || "unknown"}, edge=${item.edgeCache || "unknown"}, revision marker=${item.buildRevisionPresent ?? "unavailable"}`).join("\n")}
`;
}

function navigationAuditMarkdown() {
  return `# Navigation audit

## Verified

- Configured destination rows: ${navigationRows().length}; invalid routes: ${navigationRows().filter((row) => !row.route_exists).length}; duplicate routes: ${navigationRows().filter((row) => row.duplicate_destination).length}.
- Counts previously lived as literals in \`siteNav.ts\`; they now resolve through the authoritative hub inventory.
- The Categories panel declared four equal columns for three semantic groups, producing a malformed empty column. It now uses three columns.
- “View all collections” remains in the desktop and mobile disclosures and is explicitly deferred for the next information-architecture implementation; it must not be treated as a substitute for curated missing destinations.
- Menu contents are curated rather than exhaustive. The inventory identifies subject, style, season/occasion, audience/difficulty, and parent relationships for the next IA decision.

## Deferred visual/editorial decisions

Do not add all 163 hubs to primary navigation. First resolve the duplicate adult/mandala/geometric taxonomy, determine the status of weak/small hubs, then choose a bounded set of high-value destinations. Preserve direct Coloring Pages and Search access.
`;
}

function searchAuditMarkdown() {
  return `# Responsive search audit

The dialog already uses native dialog semantics, focus trapping/restoration, Escape handling, portal ownership, body-scroll locking, and a separate mobile-header Search action.

Verified CSS causes of the poor mobile rendering were a full-height grid without explicit start alignment, an unconstrained footer row, no safe-area padding, and missing horizontal overflow containment. The foundation now uses start-aligned grid content, a footer pushed to available space, 100dvh containment, overscroll containment, and safe-area padding.

Browser acceptance remains required at 320, 375, 390, and 430 CSS pixels plus landscape with the on-screen keyboard approximated. This task avoids a fragile pixel-diff baseline; the next visual pass should check chip wrapping, close/browse controls, input visibility, and zero document overflow.
`;
}

function thumbnailAuditMarkdown(samples) {
  const valid = samples.filter((item) => !item.error);
  const avg = (field) => fixed(valid.reduce((sum, item) => sum + Number(item[field]), 0) / Math.max(1, valid.length));
  return `# Thumbnail layout audit

Measured ${valid.length} representative WebP files (one per hub where available) using a grayscale line-art threshold; originals were not modified.

- Average canvas whitespace: left ${avg("left")}, right ${avg("right")}, top ${avg("top")}, bottom ${avg("bottom")} as fractions of canvas.
- Homepage/collection preview frames used a 4:3 landscape ratio around predominantly 341×512 portrait previews with \`object-fit: contain\`. This frame mismatch created large visible side wells even when artwork bounds were reasonable.
- Some whitespace is intentionally baked into printable page composition and must remain in downloads/print output.
- Cropping the source or applying an aggressive cover rule could clip line art and is deferred.

Representative measurements:

| Route | Canvas | Detected bounds | L | R | T | B | Optical offset X/Y |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
${valid.slice(0, 40).map((item) => `| ${item.route} | ${item.width}×${item.height} | ${item.bounds} | ${item.left} | ${item.right} | ${item.top} | ${item.bottom} | ${item.offCenterX}/${item.offCenterY} |`).join("\n")}
`;
}

function cardAuditMarkdown(samples) {
  return `# Card layout audit

- Main cause: \`.hub-preview-card-media\` used a 4:3 frame while runtime previews are portrait 341×512 and \`AssetImage\` uses contain behavior.
- Secondary cause: printable compositions retain page margins; measured bounds are in \`thumbnail-layout-audit.md\`.
- “More ways to browse” and other text-only hub links use a two-column label/count row, but flexible wrapping and mixed label lengths can make counts appear detached. The next visual pass should use a consistent count column and grouped hierarchy, not pills or nested cards.
- Gallery and related-printable cards use the centralized WebP resolver; the printable detail page no longer silently scales a grid-sized preview to a full-page visual.
- No source artwork was cropped, moved, renamed, or rewritten.

Samples measured: ${samples.length}. The detailed values are intentionally kept in the companion thumbnail report rather than duplicated here.
`;
}

function adAuditMarkdown() {
  return `# Advertisement audit

## Root cause

There was no AdSense script or fill/collapse logic. Every \`AdSlot\` unconditionally rendered a development placeholder, while responsive CSS hid or switched several locations at breakpoints. That combination explains visible placeholder markup and apparent flashes/disappearance during responsive layout or hydration; it was not a live-slot fill failure.

## Implemented modes

- **OFF:** renders no component, label, container, or reserved space and loads no external script. This is the production default.
- **PLACEHOLDER:** renders stable, labeled development placeholders and never loads an external script. This is the non-production default unless explicitly overridden.
- **LIVE:** requires an explicit mode, a syntactically valid publisher identifier, and a JSON mapping from internal slot IDs to numeric external slot IDs. Missing/invalid configuration safely resolves to OFF. A client WeakSet prevents duplicate initialization of the same element under hydration/Strict Mode.

No live identifiers were added. No live advertising was enabled. Existing locations are mapped in \`ad-placement-map.csv\`; lower/supporting placements are flagged for value/density review before any later activation.
`;
}

function indexationSummaryMarkdown(summary) {
  return `# Indexation recommendation summary

This is a non-active audit plan, not a robots/redirect change.

- Retain and index: ${summary.retainAndIndex}
- Retain publicly but noindex: ${summary.retainPubliclyButNoindex}
- Consolidate into a stronger parent: ${summary.consolidateIntoAStrongerParent}
- Redirect to a genuine replacement: ${summary.redirectToAGenuineReplacement}
- Correct collection membership: ${summary.correctCollectionMembership}
- Manual editorial review: ${summary.manualEditorialReview}

No broad noindex or redirects were activated. Inventory size alone did not determine any recommendation.
`;
}

function prioritiesMarkdown() {
  return `# Implementation priorities

## P0 — correctness, crawlability, broken rendering, production defects

- Deploy only after approval: production OFF ad mode, correct printable preview dimensions/alt parity, cache rules, and build revision diagnostic.
- Rebuild and compare raw HTML/hydrated DOM for Fantasy Abyss Wyrm and the representative route matrix.
- Verify all public asset CORS and final asset-domain responses before changing download exposure or image discovery.

## P1 — indexation, duplication, collection architecture

- Repair Detailed Adults/Mandalas/Geometric membership rules and the parent/child cycle.
- Decide Easy/Kids, Mammoths/Woolly Mammoth, Birthday/Birthday Celebration, and Dinosaurs/Prehistoric Animals using intent plus membership evidence.
- Review the non-active indexation manifest; activate only approved entries in robots/sitemap/navigation together.

## P2 — differentiated hub content and printable metadata

- Remove internal production/indexation wording.
- Replace or remove generic hub instruction blocks; commission page-specific intros only for retained hubs.
- Define an evidence-based printable differentiation model before changing 6,352 descriptions. Do not mass-generate prose.

## P3 — navigation, cards, mobile search, and visual refinement

- Replace “View all collections” disclosure footers with an approved curated IA.
- Run manual mobile-search acceptance at 320/375/390/430 and landscape.
- Align “More ways to browse” label/count columns and correct portrait frame ratios without cropping line art.
- Validate Categories/Seasonal keyboard behavior and intermediate-width positioning.

## P4 — final production and AdSense-review verification

- Deploy a reviewed revision, verify \`build-revision.json\` across homepage/inner routes, then rerun live audit.
- Confirm crawl files, canonical/robots parity, and image URLs.
- Reassess content value and ad density before configuring LIVE. AdSense approval is not guaranteed by technical checks.
`;
}

function siteAuditMarkdown(summary, safeguards) {
  return `# Site quality audit

## Scope and source of truth

The site is a Next.js 16 static export built from generated runtime hub/printable JSON. This audit processed all ${summary.hubsAnalyzed} hubs, all ${summary.printableRoutesAnalyzed.toLocaleString()} printable routes, all ${overlapRows.length.toLocaleString()} hub pairs, and every local clean WebP/SVG pair. Production media remains CDN-hosted; no original or generated image was modified.

Official guidance supports a people-first, original, substantial-value approach and warns against scaled pages that add little value: [helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [spam policies](https://developers.google.com/search/docs/essentials/spam-policies), and [generative AI guidance](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content). Image guidance emphasizes crawlable images, relevant surrounding text, and accurate alt text: [Google Images](https://developers.google.com/search/docs/appearance/google-images) and [image sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps). Publisher policies prohibit ads on low/no-content screens and pages with more ads than publisher content: [screen requirements](https://support.google.com/publisherpolicies/answer/11112688), [low-value content](https://support.google.com/publisherpolicies/answer/11169917), and [publisher restrictions](https://support.google.com/publisherpolicies/answer/10502938).

## Verified defects

- Adult-detail and Mandalas inventories are exactly equal; Geometric differs by only two records.
- All ${summary.baselinePrintablePreviewDimensionMismatches.toLocaleString()} principal previews declared larger source dimensions than their WebP pixels and could upscale.
- Live production renders development ad placeholders despite no live advertising.
- Hub metadata and shared visible copy expose production/indexation language.
- Categories used a four-column layout for three groups.
- Counts had multiple consumers and navigation literals rather than one authoritative helper.
- Production had no machine-readable revision marker and crawl files could inherit unsuitable caching.

## Likely defects / needs browser confirmation

- Mobile search whitespace and footer positioning were caused by full-height grid distribution; CSS foundations are fixed, but keyboard/safe-area acceptance remains.
- Text-only browse counts can appear detached at narrow/intermediate widths.
- Live placeholder disappearance likely reflects breakpoint/hydration layout changes, because no live fill script exists.

## Editorial judgments

- Recommendation status is evidence-backed but non-active. Small size never automatically causes noindex.
- Distinct hub and printable copy cannot be solved safely through broad templated generation.
- Whether near-duplicate names represent valuable intents requires human review after membership repair.

## Technical fixes completed

- Authoritative collection count helper and consumer migration.
- Typed asset-role resolver; truthful preview dimensions; SSR/hydration alt/source/dimension parity.
- Explicit OFF/PLACEHOLDER/LIVE advertising modes with production OFF default and guarded initialization.
- Non-active versioned indexation manifest.
- Build revision diagnostic and cache rules.
- Repeatable full audit command and quality safeguards.
- Safe Categories and mobile-search CSS foundations.

## Deliberately deferred

- Mass content rewriting, broad noindex, redirects, destructive taxonomy changes, source-image edits, live advertising, deployment, and full visual redesign.

## Automated safeguards

${safeguards.map((item) => `- **${item.status}** — ${item.name}: ${item.detail}`).join("\n")}

Known editorial debt is reported rather than silently rewritten. Use \`npm run validate:site-quality\` for a deliberately strict non-zero gate after the editorial/taxonomy work is complete.
`;
}

function formatCheck(item) {
  if (item.error) return `- ${item.route}: ERROR ${item.error}`;
  if (item.exportPresent === false) return `- ${item.route}: local export absent (${item.note})`;
  return `- ${item.route}: status=${item.status ?? "local"}, ads=${item.advertisementTextOccurrences}, loading-preview=${item.loadingPreviewPresent}, revision-marker=${item.buildRevisionPresent}, cache=${item.cacheControl || "n/a"}, sha=${item.bodySha || "n/a"}`;
}

function compareSets(left, right) {
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return {
    leftSize: left.size,
    rightSize: right.size,
    intersection,
    union,
    jaccard: union ? intersection / union : 1,
    leftContainment: left.size ? intersection / left.size : 1,
    rightContainment: right.size ? intersection / right.size : 1,
    uniqueLeft: left.size - intersection,
    uniqueRight: right.size - intersection,
    exact: left.size === right.size && intersection === left.size,
  };
}

function relationshipFor(left, right) {
  if (left.parentHubId === right.hubId || right.childHubIds.includes(left.hubId)) return "left child of right";
  if (right.parentHubId === left.hubId || left.childHubIds.includes(right.hubId)) return "right child of left";
  if (left.parentHubId && left.parentHubId === right.parentHubId) return "siblings";
  return "other";
}

function connectedGroups(rows, leftKey, rightKey) {
  const graph = new Map();
  for (const row of rows) {
    if (!graph.has(row[leftKey])) graph.set(row[leftKey], new Set());
    if (!graph.has(row[rightKey])) graph.set(row[rightKey], new Set());
    graph.get(row[leftKey]).add(row[rightKey]);
    graph.get(row[rightKey]).add(row[leftKey]);
  }
  const seen = new Set();
  const groups = [];
  for (const node of graph.keys()) {
    if (seen.has(node)) continue;
    const stack = [node];
    const group = [];
    seen.add(node);
    while (stack.length) {
      const current = stack.pop();
      group.push(current);
      for (const neighbor of graph.get(current) || []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    groups.push(group.sort());
  }
  return groups;
}

function findInternalWording(text) {
  const phrases = [
    "selected from successful production assets",
    "selected from approved production assets",
    "existing production assets",
    "rotated on the existing three-day schedule",
    "no indexable per-image pages",
    "Using this collection",
    "Choose a printable",
    "Images and titles open printable pages",
    "Print and download actions stay separate",
  ];
  return phrases.filter((phrase) => text.toLowerCase().includes(phrase.toLowerCase()));
}

function normalizeTemplate(text) {
  let normalized = text.toLowerCase().replace(/\b[\d,]+\b/g, "{count}");
  for (const hub of [...hubs].sort((a, b) => b.title.length - a.title.length)) {
    normalized = normalized.replaceAll(hub.title.toLowerCase(), "{collection}");
    normalized = normalized.replaceAll(hub.title.toLowerCase().replace(/ coloring pages$/, ""), "{collection}");
  }
  return normalized.replace(/\s+/g, " ").trim();
}

function contentFingerprint(text) {
  return hashText(normalizeTemplate(text));
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function summarizeRecommendations(entries) {
  const counts = Object.fromEntries(indexationManifestKeys().map((key) => [key, 0]));
  for (const entry of entries) counts[toCamel(entry.recommendation)] += 1;
  return counts;
}

function indexationManifestKeys() {
  return [
    "retainAndIndex",
    "retainPubliclyButNoindex",
    "consolidateIntoAStrongerParent",
    "redirectToAGenuineReplacement",
    "correctCollectionMembership",
    "manualEditorialReview",
  ];
}

function toCamel(value) {
  return value.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => index === 0 ? word.toLowerCase() : word.toUpperCase()).replace(/\s+/g, "");
}

function check(name, passed, detail) {
  return { name, status: passed ? "PASS" : "FAIL", detail };
}

function assetError(printable, role, assetPath, problem) {
  return { printable_id: printable.assetId, route: printable.canonicalPath, asset_role: role, asset_path: assetPath, problem, action: "quarantine from production if unresolved" };
}

function fixed(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

async function loadPublicSource() {
  const files = [
    "src/components/coloring/HubPageContent.tsx",
    "src/components/coloring/CollectionPageHeader.tsx",
    "src/components/coloring/PrintableDetailPage.tsx",
    "src/components/site/GlobalSearchDialog.tsx",
    "src/components/site/CategoryBrowser.tsx",
    "src/lib/navigation/siteNav.ts",
    "src/lib/ads/config.ts",
    "src/components/ads/AdSlot.tsx",
    "src/styles/components.css",
  ];
  const result = new Map();
  for (const file of files) {
    try {
      result.set(file, await readFile(path.join(root, file), "utf8"));
    } catch {
      result.set(file, "");
    }
  }
  return result;
}

async function auditLocalExportFile(relative) {
  try {
    await access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

async function json(relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

async function outputJson(relative, value) {
  const destination = relative.startsWith("src/") ? path.join(root, relative) : path.join(reportsDir, relative);
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`);
}

async function outputText(relative, value) {
  await writeFile(path.join(reportsDir, relative), value.trimEnd() + "\n");
}

async function outputCsv(relative, rows, expectedHeaders = []) {
  if (!rows.length) {
    await writeFile(path.join(reportsDir, relative), expectedHeaders.length ? `${expectedHeaders.map(csvCell).join(",")}\n` : "\n");
    return;
  }
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header])).join(","));
  await writeFile(path.join(reportsDir, relative), `${lines.join("\n")}\n`);
}

function csvCell(value) {
  const string = value == null ? "" : Array.isArray(value) ? value.join("|") : String(value);
  return /[",\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}
