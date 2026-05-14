import {
  RUN_ID,
  buildMarkdownTable,
  readJson,
  summarizeBoolean,
  writeJson,
  writeText,
} from "./image-sitemap-utils.mjs";

const DATA_MANIFEST = "pipeline/manifests/image-sitemap-data.json";
const SAMPLE_MANIFEST = "pipeline/manifests/image-sitemap-sampled-url-check-results.json";
const SAMPLE_REPORT = "pipeline/reports/image-sitemap-sampled-url-check-report.md";
const MIN_SAMPLE_COUNT = 200;
const SAMPLE_HUB_SLUGS = [
  "animals",
  "anime-girls",
  "chibi",
  "fantasy",
  "christmas",
  "geometric",
  "mandalas",
  "plushies",
  "long-tail",
  "t-rex",
  "dragons",
  "mushrooms",
  "sushi",
  "bakery",
  "wolves",
  "pumpkins",
  "st-patricks-day",
];

async function main() {
  const data = await readJson(DATA_MANIFEST);
  const sample = selectSample(data);
  const checked = await checkEntries(sample);
  const manifest = buildSampleManifest(data, sample, checked);
  await writeJson(SAMPLE_MANIFEST, manifest);
  await writeText(SAMPLE_REPORT, buildSampleReport(manifest));

  if (!manifest.summary.sampledUrlCheckPassed) {
    process.exitCode = 1;
  }
}

function selectSample(data) {
  const bySlug = new Map(data.pages.map((page) => [page.hubSlug, page.images]));
  const sample = [];
  const seen = new Set();

  for (const slug of SAMPLE_HUB_SLUGS) {
    const entries = slug === "long-tail" ? getLongTailSampleEntries(data) : bySlug.get(slug) || [];
    for (const entry of entries.slice(0, 12)) {
      if (seen.has(entry.assetId)) continue;
      sample.push(entry);
      seen.add(entry.assetId);
    }
  }

  for (const entry of data.imageEntries) {
    if (sample.length >= MIN_SAMPLE_COUNT) break;
    if (seen.has(entry.assetId)) continue;
    sample.push(entry);
    seen.add(entry.assetId);
  }

  return sample.slice(0, Math.max(MIN_SAMPLE_COUNT, sample.length));
}

function getLongTailSampleEntries(data) {
  const longTailSlugs = new Set(["t-rex", "dragons", "mushrooms", "sushi", "bakery", "wolves", "pumpkins", "velociraptors", "christmas-dogs"]);
  return data.pages.filter((page) => longTailSlugs.has(page.hubSlug)).flatMap((page) => page.images.slice(0, 4));
}

async function checkEntries(entries) {
  const results = [];
  const queue = [...entries];
  const workers = Array.from({ length: 10 }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      results.push(await checkEntry(entry));
    }
  });
  await Promise.all(workers);
  return results.sort((a, b) => a.assetId.localeCompare(b.assetId));
}

async function checkEntry(entry) {
  const routeKnown = entry.pageUrl.startsWith("https://www.ilovecoloringpage.com/coloring-pages");
  const bannedPatternAbsent = !/\/svg\/|\/png\/|\/thumbs\/|r2\.dev|localhost|coloring-pages\/coloring-pages/i.test(entry.imageUrl);
  const noDeferredRecord = entry.available === true && entry.validationStatus === "valid";
  const response = await fetchImage(entry.imageUrl);

  return {
    assetId: entry.assetId,
    hubSlug: entry.hubSlug,
    pageUrl: entry.pageUrl,
    imageUrl: entry.imageUrl,
    routeKnown,
    noDeferredRecord,
    noSvg: !/\/svg\//i.test(entry.imageUrl),
    noPng: !/\/png\//i.test(entry.imageUrl),
    noLocalUrl: !/localhost|127\.0\.0\.1/i.test(entry.imageUrl),
    noR2Dev: !/r2\.dev/i.test(entry.imageUrl),
    noDuplicatePrefix: !/coloring-pages\/coloring-pages/i.test(entry.imageUrl),
    bannedPatternAbsent,
    httpStatus: response.status,
    ok: response.ok,
    contentType: response.contentType,
    isWebp: /^image\/webp\b/i.test(response.contentType),
    error: response.error,
  };
}

async function fetchImage(url) {
  try {
    let response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "i-love-coloring-page-image-sitemap-check/1.0" },
    });
    if (!response.ok || !response.headers.get("content-type")) {
      response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "User-Agent": "i-love-coloring-page-image-sitemap-check/1.0",
          Range: "bytes=0-0",
        },
      });
    }
    return {
      status: response.status,
      ok: response.status === 200 || response.status === 206,
      contentType: response.headers.get("content-type") || "",
      error: "",
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      contentType: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildSampleManifest(data, sample, checked) {
  const failures = checked.filter((entry) => !entry.ok || !entry.isWebp || !entry.routeKnown || !entry.bannedPatternAbsent || !entry.noDeferredRecord);
  const coveredSlugs = [...new Set(sample.map((entry) => entry.hubSlug))].sort();
  const summary = {
    status: failures.length ? "failed" : "completed",
    sampledUrlCheckPassed: failures.length === 0 && checked.length >= MIN_SAMPLE_COUNT,
    recordsChecked: checked.length,
    minimumRequiredRecords: MIN_SAMPLE_COUNT,
    coveredHubSlugs: coveredSlugs,
    targetHubSlugsCovered: SAMPLE_HUB_SLUGS.filter((slug) => slug === "long-tail" || coveredSlugs.includes(slug)),
    pageRouteKnownOrLocal200: checked.every((entry) => entry.routeKnown),
    webpHttp200: checked.every((entry) => entry.ok),
    webpContentType: checked.every((entry) => entry.isWebp),
    noSvgUrls: checked.every((entry) => entry.noSvg),
    noPngUrls: checked.every((entry) => entry.noPng),
    noLocalUrls: checked.every((entry) => entry.noLocalUrl),
    noR2Dev: checked.every((entry) => entry.noR2Dev),
    noDuplicatePrefix: checked.every((entry) => entry.noDuplicatePrefix),
    noDeferredRecords: checked.every((entry) => entry.noDeferredRecord),
    failures: failures.length,
    sourceImageEntryCount: data.summary.imageEntryCount,
  };

  return {
    generatedAt: data.generatedAt,
    runId: `${RUN_ID}-sampled-url-check`,
    summary,
    results: checked,
    failures,
  };
}

function buildSampleReport(manifest) {
  const failureRows = manifest.failures.slice(0, 20).map((entry) => [entry.assetId, entry.httpStatus, entry.contentType, entry.error || ""]);
  return `# Image Sitemap Sampled URL Check Report

${buildMarkdownTable(
  ["Check", "Result"],
  Object.entries(manifest.summary).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? summarizeBoolean(value) : value]),
)}

${manifest.failures.length ? `## Failures\n\n${buildMarkdownTable(["Asset", "HTTP", "Content type", "Error"], failureRows)}\n` : "All sampled WebP image URL checks passed.\n"}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
