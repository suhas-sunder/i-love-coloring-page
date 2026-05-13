import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_JSON = [
  "pipeline/manifests/round-4x-project-context-check.json",
  "pipeline/manifests/round-4x-working-tree-audit.json",
  "pipeline/manifests/round-4x-trust-legal-requirements.json",
  "pipeline/manifests/round-4x-trust-page-plan.json",
  "pipeline/manifests/round-4x-trust-page-metadata.json",
  "pipeline/manifests/round-4x-sitemap-robots-results.json",
  "pipeline/manifests/round-4x-adsense-readiness-review.json",
  "pipeline/manifests/round-4x-browser-qa-results.json",
  "pipeline/manifests/round-4x-trust-page-implementation-results.json",
  "pipeline/manifests/round-4x-legal-review-flags.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/round-4x-project-context-check.md",
  "pipeline/reports/round-4x-working-tree-audit.md",
  "pipeline/reports/round-4x-trust-legal-research.md",
  "pipeline/reports/round-4x-trust-page-plan.md",
  "pipeline/reports/round-4x-trust-page-metadata.md",
  "pipeline/reports/round-4x-sitemap-robots-report.md",
  "pipeline/reports/round-4x-adsense-readiness-review.md",
  "pipeline/reports/round-4x-browser-qa-report.md",
  "pipeline/reports/round-4x-trust-page-implementation-report.md",
  "pipeline/reports/round-4x-legal-review-flags.md",
  "pipeline/reports/round-4x-next-phase-plan.md",
];

const TRUST_ROUTES = [
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/affiliate-disclosure",
  "/editorial-policy",
];

const TRUST_PAGE_FILES = [
  "app/about/page.tsx",
  "app/contact/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/affiliate-disclosure/page.tsx",
  "app/editorial-policy/page.tsx",
];

test("Round 4X JSON manifests and reports parse", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
    JSON.parse(raw);
  }

  for (const relativePath of REQUIRED_REPORTS) {
    const text = await readText(relativePath);
    assert.match(text, /\S/, relativePath);
    assert.doesNotMatch(text, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  const context = await readJson("pipeline/manifests/round-4x-project-context-check.json");
  assert.equal(context.summary.correctRepo, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round4wCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
  assert.equal(context.summary.adWellsVisibleByDefault, true);
  assert.equal(context.summary.liveAdCodeExists, false);

  const workingTree = await readJson("pipeline/manifests/round-4x-working-tree-audit.json");
  assert.equal(workingTree.summary.preImplementationDriftDetected, true);
  assert.equal(workingTree.summary.preImplementationDriftResolved, true);
  assert.equal(workingTree.summary.unrelatedDriftCommitted, false);
});

test("trust and policy pages exist with draft-safe metadata and content", async () => {
  for (const pageFile of TRUST_PAGE_FILES) {
    const text = await readText(pageFile);
    assert.match(text, /export const metadata/i, `${pageFile} metadata missing`);
    assert.match(text, /alternates:\s*{[\s\S]*canonical/i, `${pageFile} canonical missing`);
    assert.doesNotMatch(text, /online coloring is available|Download SVG|SVG download|Download JPG|Download JPEG|Download WebP/i, pageFile);
    assert.doesNotMatch(text, /123 Main|555-|fake address|fake phone|support@example\.com/i, pageFile);
    assert.doesNotMatch(text, /linear-gradient|box-shadow|border:|outline:/i, pageFile);
  }

  const about = await readText("app/about/page.tsx");
  const contact = await readText("app/contact/page.tsx");
  const privacy = await readText("app/privacy/page.tsx");
  const terms = await readText("app/terms/page.tsx");
  const affiliate = await readText("app/affiliate-disclosure/page.tsx");
  const editorial = await readText("app/editorial-policy/page.tsx");

  assert.match(about, /printable coloring page library/i);
  assert.match(about, /PNG/i);
  assert.match(contact, /Contact details coming soon|NEXT_PUBLIC_SITE_CONTACT_EMAIL/i);
  assert.match(contact, /copyright concern/i);
  assert.match(privacy, /Draft/i);
  assert.match(privacy, /Google/i);
  assert.match(privacy, /cookies/i);
  assert.match(privacy, /personalized advertising/i);
  assert.match(privacy, /Ads Settings/i);
  assert.match(privacy, /aboutads\.info/i);
  assert.match(privacy, /children/i);
  assert.match(terms, /Draft/i);
  assert.match(terms, /personal/i);
  assert.match(terms, /classroom/i);
  assert.match(terms, /resale|redistribution/i);
  assert.match(affiliate, /affiliate/i);
  assert.match(affiliate, /commission/i);
  assert.match(editorial, /collections are organized/i);
  assert.match(editorial, /report/i);
});

test("footer links and sitemap expose trust pages without route bloat", async () => {
  const footer = await readText("src/components/site/SiteFooter.tsx");
  const siteNav = await readText("src/lib/navigation/siteNav.ts");
  const sitemapSource = await readText("app/sitemap.ts");
  const trustPagesSource = await readText("src/lib/trust/trustPages.ts");
  const sitemapResults = await readJson("pipeline/manifests/round-4x-sitemap-robots-results.json");

  for (const route of TRUST_ROUTES) {
    assert.match(`${footer}\n${siteNav}\n${trustPagesSource}`, new RegExp(route.replace("/", "\\/")));
    assert.match(`${sitemapSource}\n${trustPagesSource}`, new RegExp(route.replace("/", "\\/")));
    assert.ok(sitemapResults.routes.includedTrustPages.includes(route), `${route} missing from sitemap manifest`);
  }

  assert.equal(sitemapResults.summary.trustPagesIncluded, true);
  assert.equal(sitemapResults.summary.noPerImageRoutes, true);
  assert.equal(sitemapResults.summary.noPhase2HubRoutes, true);
  assert.equal(sitemapResults.summary.noImageSitemap, true);
  assert.doesNotMatch(`${footer}\n${siteNav}`, /AdSlot|AdRail|data-ad-placeholder|Advertisement/i);
  assert.doesNotMatch(siteNav, /label:\s*["']Coloring Pages["']/);
});

test("AdSense readiness and legal review flags remain conservative", async () => {
  const readiness = await readJson("pipeline/manifests/round-4x-adsense-readiness-review.json");
  const legalFlags = await readJson("pipeline/manifests/round-4x-legal-review-flags.json");
  const implementation = await readJson("pipeline/manifests/round-4x-trust-page-implementation-results.json");

  assert.equal(readiness.summary.uniqueContentPresent, true);
  assert.equal(readiness.summary.trustPagesPresent, true);
  assert.equal(readiness.summary.privacyPagePresent, true);
  assert.equal(readiness.summary.termsPresent, true);
  assert.equal(readiness.summary.affiliateDisclosurePresent, true);
  assert.equal(readiness.summary.liveAdCodeAbsent, true);
  assert.equal(readiness.summary.noSvgPublicDownload, true);
  assert.equal(readiness.summary.readyToApplyForAdSenseNow, false);
  assert.ok(readiness.blockers.includes("Owner must provide a real contact path before launch and AdSense review."));
  assert.ok(readiness.blockers.includes("Owner/legal review is required before policy pages are treated as final."));
  assert.ok(readiness.blockers.includes("Public asset-domain verification is still separate from this round."));

  assert.equal(legalFlags.summary.policyPagesAreDrafts, true);
  assert.equal(legalFlags.summary.ownerReviewRequired, true);
  assert.equal(legalFlags.summary.legalReviewRecommended, true);
  assert.equal(implementation.summary.pagesCreated.length, TRUST_ROUTES.length);
  assert.equal(implementation.summary.pagesDeferred.length, 0);
});

test("browser QA confirms trust pages render and Round 4U gallery behavior remains stable", async () => {
  const qa = await readJson("pipeline/manifests/round-4x-browser-qa-results.json");

  assert.equal(qa.summary.status, "passed");
  assert.equal(qa.summary.trustPagesRender, true);
  assert.equal(qa.summary.footerLinksWork, true);
  assert.equal(qa.summary.navStillWorks, true);
  assert.equal(qa.summary.moreMenuStillWorks, true);
  assert.equal(qa.summary.mobileNavStillWorks, true);
  assert.equal(qa.summary.adDensityMatchesRound4UPolicy, true);
  assert.equal(qa.summary.noHorizontalOverflow, true);
  assert.equal(qa.summary.realMediaRenders, true);
  assert.equal(qa.summary.pngOnlyDownloadsRemain, true);
  assert.equal(qa.summary.noLiveAdCode, true);
  assert.equal(qa.summary.appApiRouteAdded, false);
  assert.ok(qa.screenshots.length >= 8);
});

test("static export, no API routes, PNG-only downloads, and protected media boundaries remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const publicSource = await readProjectText(["app", "src/components", "src/lib", "src/generated/coloring"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const renameStatus = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|coloring-pages)[\\/]/i.test(file)), false);
  assert.match(imageCard, /Print/);
  assert.match(imageCard, /Download PNG/);
  assert.doesNotMatch(publicSource, /Download SVG|SVG download|Download JPG|Download JPEG|Download WebP|assetUrls\.svg|pngUrl\s*\|\|\s*svgUrl/i);
  assert.doesNotMatch(publicSource, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.equal(renameStatus.split(/\r?\n/).some((line) => /^R/.test(line.trim())), false);
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
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else {
        results.push(path.relative(REPO_ROOT, absolute));
      }
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const root = path.join(REPO_ROOT, relativeRoot);
    try {
      const rootStat = await stat(root);
      if (rootStat.isFile()) {
        chunks.push(await readText(relativeRoot));
        continue;
      }

      const files = await listFilesIfExists(root);
      for (const file of files) {
        if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
        if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
        chunks.push(await readText(file));
      }
    } catch {
      continue;
    }
  }
  return chunks.join("\n");
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatus() {
  const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}
