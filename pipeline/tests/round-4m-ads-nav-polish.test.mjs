import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND4M_MANIFEST_FILES,
  ROUND4M_REPORT_FILES,
  ROUND4M_RUN_ID,
  runRound4MAdsNavPolish,
} from "../scripts/round-4m-build-ads-nav-polish.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ALLOWED_PRODUCTION_BRANCHES = new Set(["version-4", "version-1", "ver-5-deployed-may-13-2026"]);

test("Round 4M generated artifacts parse and confirm the requested project context", async () => {
  const result = await runRound4MAdsNavPolish({ repoRoot: REPO_ROOT });
  assert.equal(result.runId, ROUND4M_RUN_ID);

  for (const relativePath of ROUND4M_MANIFEST_FILES) {
    const raw = await readText(relativePath);
    const parsed = JSON.parse(raw);
    assert.ok(parsed, relativePath);
    assert.doesNotMatch(raw, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  for (const reportPath of ROUND4M_REPORT_FILES) {
    const text = await readText(reportPath);
    assert.match(text, /Round 4M/i, reportPath);
    assert.doesNotMatch(text, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, reportPath);
  }

  const context = await readJson("pipeline/manifests/round-4m-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.ok(ALLOWED_PRODUCTION_BRANCHES.has(context.summary.branch), `unexpected branch ${context.summary.branch}`);
  assert.equal(context.summary.round4lCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
});

test("AdSense placement rules are documented from official Google sources only", async () => {
  const rules = await readJson("pipeline/manifests/round-4m-adsense-placement-rules.json");
  const report = await readText("pipeline/reports/round-4m-adsense-placement-research.md");

  assert.equal(rules.runId, ROUND4M_RUN_ID);
  assert.ok(rules.sources.length >= 2);
  for (const source of rules.sources) {
    assert.match(source.url, /^https:\/\/support\.google\.com\/adsense\//, source.url);
  }

  assert.deepEqual(rules.allowedLabels, ["Advertisement", "Sponsored Links"]);
  assert.ok(rules.forbiddenLabels.includes("Recommended"));
  assert.ok(rules.forbiddenPlacements.some((rule) => /navigation/i.test(rule)));
  assert.ok(rules.interactionSeparationRules.some((rule) => /Print\/Download/i.test(rule)));
  assert.ok(rules.mobileRules.some((rule) => /accidental clicks/i.test(rule)));
  assert.ok(rules.stickyRules.some((rule) => /overlap/i.test(rule)));
  assert.match(report, /support\.google\.com\/adsense\/answer\/1346295/);
  assert.match(report, /Advertisement/);
  assert.match(report, /Sponsored Links/);
});

test("ad placeholder implementation is static, permanent, and never live ad code", async () => {
  const config = await readText("src/lib/ads/config.ts");
  const types = await readText("src/lib/ads/types.ts");
  const slot = await readText("src/components/ads/AdSlot.tsx");
  const rail = await readText("src/components/ads/AdRail.tsx");
  const css = await readText("src/styles/components.css");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const galleryGrid = await readText("src/components/coloring/GalleryGrid.tsx");
  const implementation = await readJson("pipeline/manifests/round-4m-ad-placeholder-implementation.json");

  assert.match(types, /AdSlotId/);
  assert.match(slot, /Advertisement/);
  assert.doesNotMatch(`${config}\n${slot}\n${rail}`, /NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS|showAdPlaceholders|return null/);
  assert.doesNotMatch(`${config}\n${slot}\n${rail}`, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(`${imageCard}\n${galleryGrid}`, /AdSlot|Advertisement|ad-slot/i);
  assert.match(css, /@media print[\s\S]*\.ad-slot/);
  assert.equal(implementation.summary.liveAdCodeAdded, false);
});

test("ad slots are mapped away from navigation, image grids, and card actions", async () => {
  const slotMap = await readJson("pipeline/manifests/round-4m-ad-slot-map.json");

  assert.equal(slotMap.runId, ROUND4M_RUN_ID);
  assert.ok(slotMap.slots.length >= 8);
  assert.equal(slotMap.summary.liveAdCodeAdded, false);
  assert.equal(slotMap.summary.desktopRailsSticky, false);

  for (const slot of slotMap.slots) {
    assert.equal(slot.label, "Advertisement", slot.slotId);
    assert.notEqual(slot.placement, "navigation", slot.slotId);
    assert.notEqual(slot.placement, "gallery-grid-item", slot.slotId);
    assert.equal(slot.nearPrintDownloadControls, false, slot.slotId);
    assert.equal(slot.liveAdCode, false, slot.slotId);
  }

  assert.ok(slotMap.forbiddenPlacements.includes("Inside gallery grids as fake cards"));
  assert.ok(slotMap.mobileBehavior.includes("No mobile top banner by default"));
});

test("site navigation uses existing static routes and stays out of ad surfaces", async () => {
  const siteNav = await readText("src/lib/navigation/siteNav.ts");
  const header = await readText("src/components/site/SiteHeader.tsx");
  const footer = await readText("src/components/site/SiteFooter.tsx");
  const layout = await readText("app/layout.tsx");
  const navUpdate = await readJson("pipeline/manifests/round-4m-navigation-update.json");
  const routes = await readJson("src/generated/coloring/routes.json");
  const routePaths = new Set(routes.routes.map((route) => route.path));

  assert.match(siteNav, /siteNavLinks/);
  assert.match(header, /Main navigation/);
  assert.match(header, /Mobile browse navigation/);
  assert.match(footer, /footerNavLinks/);
  assert.match(layout, /<SiteHeader \/>/);
  assert.match(layout, /<SiteFooter \/>/);
  assert.doesNotMatch(`${siteNav}\n${header}\n${footer}`, /AdSlot|Advertisement|ad-slot/i);

  for (const link of navUpdate.links) {
    if (link.href.includes("#")) {
      assert.ok(routePaths.has(link.href.split("#")[0]), link.href);
    } else {
      assert.ok(routePaths.has(link.href) || link.href === "/", link.href);
    }
    assert.equal(link.routeExists, true, link.href);
  }
});

test("visual polish guardrails and static architecture remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const packageJson = await readJson("package.json");
  const routes = await readJson("src/generated/coloring/routes.json");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const sourceText = await readProjectText([
    "app",
    "src",
    "pipeline/manifests/round-4m-ad-slot-map.json",
    "pipeline/manifests/round-4m-ad-placeholder-implementation.json",
  ]);
  const css = await readProjectText(["src/styles"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(routes.routes.length, 65);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);
  assert.doesNotMatch(sourceText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client|publisher id/i);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|conic-gradient/i);
  assert.doesNotMatch(css, /#f8eecf|#a86b00|soft-yellow|creative-yellow|yellow-surface/i);
  assert.match(css, /:focus-visible/);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), ["next", "react", "react-dom"]);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }

  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else results.push(path.relative(REPO_ROOT, entryPath));
    }
  }

  await walk(root);
  return results;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const root = path.join(REPO_ROOT, relativeRoot);
    const rootStat = await stat(root);
    if (rootStat.isFile()) {
      chunks.push(await readText(relativeRoot));
      continue;
    }
    const files = await listFilesIfExists(root);
    for (const file of files) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}
