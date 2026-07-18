#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..", "..");
export const EDITORIAL_PATH = "src/config/hub-editorial-content.json";
export const RUNTIME_HUBS_PATH = "src/generated/coloring/runtime-hubs.json";
const OUTPUTS = {
  seoPages: "src/generated/coloring/runtime-seo-pages.json",
  hubSeo: "src/generated/coloring/runtime-hub-seo-content.json",
  social: "src/generated/coloring/runtime-social-metadata.json",
};
const FORBIDDEN = /production assets|asset rotation|three-day schedule|no indexable per-image pages|images and titles open printable pages|print and download actions stay separate|using this collection|choose a printable|index-promoted|legacy inventory|audience assignments/i;

export async function applyRuntimePublicContentQuality({ repoRoot = DEFAULT_ROOT, write = true } = {}) {
  const editorial = await readJson(repoRoot, EDITORIAL_PATH);
  const hubs = await readJson(repoRoot, RUNTIME_HUBS_PATH);
  const seoPages = await readJson(repoRoot, OUTPUTS.seoPages);
  const hubSeo = await readJson(repoRoot, OUTPUTS.hubSeo);
  const social = await readJson(repoRoot, OUTPUTS.social);
  const output = applyPublicContentQuality(hubs, editorial);
  const derived = {
    seoPages: updateSeoPages(seoPages, output),
    hubSeo: buildHubSeoManifest(hubSeo, output),
    social: updateSocialMetadata(social, output),
  };
  if (write) {
    await Promise.all([
      writeJson(repoRoot, RUNTIME_HUBS_PATH, output),
      ...Object.entries(derived).map(([key, value]) => writeJson(repoRoot, OUTPUTS[key], value)),
    ]);
  }
  return output;
}

export function applyPublicContentQuality(source, editorialManifest) {
  const output = structuredClone(source);
  const records = editorialManifest.hubs;
  for (const hub of output.hubs) {
    const editorial = records[hub.hubId];
    if (!editorial) throw new Error(`Missing explicit editorial content: ${hub.hubId}`);
    hub.contentTier = editorial.tier;
    hub.editorial = structuredClone(editorial);
    hub.intro = editorial.introduction;
    hub.metaTitle = hub.route === "/coloring-pages" ? "Printable Coloring Pages" : collectionPageTitle(hub.title);
    hub.metaDescription = editorial.introduction;
    if (hub.h1 !== hub.title) throw new Error(`Hub H1/title mismatch: ${hub.hubId}`);
    if (hub.assetCount !== new Set(hub.assetIds).size) throw new Error(`Hub asset count mismatch: ${hub.hubId}`);
  }
  const indexable = output.hubs.filter((hub) => hub.indexable);
  const normalizedIntros = indexable.map((hub) => normalize(hub.intro));
  if (new Set(normalizedIntros).size !== normalizedIntros.length) throw new Error("Duplicate editorial introductions remain");
  if (output.hubs.some((hub) => FORBIDDEN.test(JSON.stringify(hub.editorial)))) throw new Error("Internal wording remains in hub editorial content");
  output.summary = {
    ...output.summary,
    publicContentQualityVersion: 2,
    editorialSource: EDITORIAL_PATH,
    explicitEditorialRecordCount: output.hubs.length,
    indexableEditorialRecordCount: indexable.length,
    duplicateIndexableIntroductionCount: 0,
    internalIntroWordingCount: 0,
    contentTierCounts: Object.fromEntries(["A", "B", "C", "D"].map((tier) => [tier, output.hubs.filter((hub) => hub.contentTier === tier).length])),
  };
  return output;
}

function updateSeoPages(source, hubsManifest) {
  const hubByRoute = new Map(hubsManifest.hubs.map((hub) => [hub.route, hub]));
  const homeDescription = buildHomeDescription(hubsManifest);
  return {
    ...source,
    runId: "runtime-seo-pages-editorial-v2",
    pages: source.pages.map((page) => {
      const hub = hubByRoute.get(page.path);
      if (!hub && page.path !== "/") return page;
      if (!hub) return {
        ...page,
        metaDescription: homeDescription,
        shortIntro: homeDescription,
        content: null,
      };
      return {
        ...page,
        pageTitle: hub.title,
        metaTitle: hub.metaTitle,
        metaDescription: hub.metaDescription,
        h1: hub.h1,
        shortIntro: hub.intro,
        noIndex: !hub.indexable,
        sitemap: hub.sitemap,
        content: null,
      };
    }),
  };
}

function buildHubSeoManifest(source, hubsManifest) {
  return {
    generatedAt: source.generatedAt,
    phase: "explicit-hub-editorial-v2",
    runId: "runtime-hub-seo-editorial-v2",
    source: EDITORIAL_PATH,
    hubs: hubsManifest.hubs.map((hub) => ({
      pageType: "hubPage",
      hubId: hub.hubId,
      slug: hub.slug,
      route: hub.route,
      canonicalPath: hub.route,
      title: hub.title,
      pageTitle: hub.title,
      metaTitle: hub.metaTitle,
      metaDescription: hub.metaDescription,
      shortIntro: hub.intro,
      contentTier: hub.contentTier,
      editorial: hub.editorial,
      indexable: hub.indexable,
      sitemap: hub.sitemap,
    })),
  };
}

function updateSocialMetadata(source, hubsManifest) {
  const hubByRoute = new Map(hubsManifest.hubs.map((hub) => [hub.route, hub]));
  const homeDescription = buildHomeDescription(hubsManifest);
  return {
    ...source,
    runId: "runtime-social-metadata-editorial-v2",
    pages: source.pages.map((page) => {
      const hub = hubByRoute.get(page.path);
      if (!hub && page.path !== "/") return page;
      if (!hub) return {
        ...page,
        description: homeDescription,
        openGraph: { ...page.openGraph, description: homeDescription },
        twitter: { ...page.twitter, description: homeDescription },
        pinterest: { ...page.pinterest, description: homeDescription },
      };
      return {
        ...page,
        title: hub.metaTitle,
        description: hub.metaDescription,
        openGraph: { ...page.openGraph, title: hub.metaTitle, description: hub.metaDescription, urlPath: hub.route },
        twitter: { ...page.twitter, title: hub.metaTitle, description: hub.metaDescription },
        pinterest: { ...page.pinterest, description: hub.metaDescription },
      };
    }),
  };
}

function buildHomeDescription(hubsManifest) {
  const rootHub = hubsManifest.hubs.find((hub) => hub.route === "/coloring-pages");
  if (!rootHub) throw new Error("Missing root coloring-pages hub for homepage metadata");
  return `Browse ${rootHub.assetCount.toLocaleString("en-US")} printable coloring pages with real previews, collection browsing, search, and print controls.`;
}

function collectionPageTitle(title) {
  const value = title.trim();
  return /\bColoring Pages\b/i.test(value) ? value : `${value} Coloring Pages`;
}

function normalize(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

async function readJson(repoRoot, relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function writeJson(repoRoot, relativePath, value) {
  await writeFile(path.join(repoRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

if (path.resolve(process.argv[1] || "") === SCRIPT_PATH) {
  applyRuntimePublicContentQuality()
    .then((output) => console.log(JSON.stringify(output.summary, null, 2)))
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
