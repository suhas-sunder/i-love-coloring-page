import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_JSON = [
  "pipeline/manifests/round-4y-project-context-check.json",
  "pipeline/manifests/round-4y-launch-config-audit.json",
  "pipeline/manifests/round-4y-site-config-results.json",
  "pipeline/manifests/round-4y-public-asset-domain-validation.json",
  "pipeline/manifests/round-4y-public-site-url-validation.json",
  "pipeline/manifests/round-4y-static-production-build-check.json",
  "pipeline/manifests/round-4y-adsense-readiness-review.json",
  "pipeline/manifests/round-4y-browser-qa-results.json",
  "pipeline/manifests/round-4y-launch-readiness-gate.json",
];

const TRUST_ROUTES = [
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/affiliate-disclosure",
  "/editorial-policy",
];

test("Round 4Y manifests parse and readiness gate is conservative", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const gate = await readJson("pipeline/manifests/round-4y-launch-readiness-gate.json");
  assert.equal(typeof gate.public_site_url_ready, "boolean");
  assert.equal(typeof gate.public_asset_domain_ready, "boolean");
  assert.equal(typeof gate.contact_method_ready, "boolean");
  assert.equal(gate.trust_pages_ready, true);
  assert.equal(gate.adsense_ready_to_apply, false);
  assert.equal(gate.ready_for_live_ads_round, false);
  assert.ok(Array.isArray(gate.blockers));
  assert.ok(Array.isArray(gate.owner_action_items));
});

test("site config exists and .env.example documents public launch variables", async () => {
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const envExample = await readText(".env.example");

  for (const key of [
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_COLORING_ASSET_BASE_URL",
    "NEXT_PUBLIC_CONTACT_EMAIL",
    "NEXT_PUBLIC_SITE_NAME",
    "NEXT_PUBLIC_SITE_OWNER_NAME",
    "NEXT_PUBLIC_SITE_JURISDICTION",
  ]) {
    assert.match(siteConfig + envExample, new RegExp(key));
  }

  assert.match(siteConfig, /isPublicContactConfigured/);
  assert.match(siteConfig, /isProductionSiteUrlConfigured/);
  assert.match(siteConfig, /isProductionAssetUrlConfigured/);
  assert.match(envExample, /public if set/i);
  assert.match(envExample, /final public asset domain plus/i);
  assert.match(envExample, /r2\.dev is temporary/i);
  assert.match(envExample, /owner\/legal review/i);
  assert.doesNotMatch(envExample, /support@example\.com|123 Main|555-/i);
});

test("trust pages use config-aware public contact and domain handling without fake details", async () => {
  const contact = await readText("app/contact/page.tsx");
  const privacy = await readText("app/privacy/page.tsx");
  const terms = await readText("app/terms/page.tsx");
  const affiliate = await readText("app/affiliate-disclosure/page.tsx");
  const editorial = await readText("app/editorial-policy/page.tsx");
  const about = await readText("app/about/page.tsx");

  assert.doesNotMatch(contact, /NEXT_PUBLIC_SITE_CONTACT_EMAIL/);
  assert.match(contact, /siteConfig\.contactEmail/);

  for (const [name, text] of Object.entries({ contact, privacy, terms, affiliate, editorial, about })) {
    assert.doesNotMatch(text, /support@example\.com|123 Main|555-|fake address|fake phone/i, name);
    assert.doesNotMatch(text, /Download SVG|SVG download|downloadSvg\b/i, name);
    assert.doesNotMatch(text, /linear-gradient|box-shadow|border:|outline:/i, name);
  }

  assert.match(privacy, /Google/i);
  assert.match(privacy, /cookies/i);
  assert.match(privacy, /siteConfig\.contactEmail/);
  assert.match(terms, /siteConfig\.contactEmail/);
  assert.match(affiliate, /siteConfig\.contactEmail/);
});

test("footer, sitemap, and static export boundaries remain launch-safe", async () => {
  const footer = await readText("src/components/site/SiteFooter.tsx");
  const sitemapSource = await readText("app/sitemap.ts");
  const trustPagesSource = await readText("src/lib/trust/trustPages.ts");
  const robotsSource = await readText("app/robots.ts");
  const nextConfig = await readText("next.config.mjs");
  const sitemapResults = await readJson("pipeline/manifests/round-4y-public-site-url-validation.json");

  for (const route of TRUST_ROUTES) {
    assert.match(footer + sitemapSource + trustPagesSource, new RegExp(route.replace("/", "\\/")));
  }

  assert.match(nextConfig, /output:\s*"export"/);
  assert.doesNotMatch(sitemapSource + robotsSource, /\/coloring-pages\/[^"']+\/[^"']+#[^"']+/i);
  assert.equal(sitemapResults.no_per_image_routes, true);
  assert.equal(sitemapResults.no_phase2_hub_routes, true);
  assert.equal(sitemapResults.no_image_sitemap, true);
});

test("public data and source do not expose forbidden ad, API, media, or download behavior", async () => {
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const publicSource = await readProjectText(["app", "src/components", "src/lib", "src/generated/coloring"]);
  const generatedPublicData = await readProjectText(["src/generated/coloring"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const renameStatus = await gitStatus();

  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|coloring-pages)[\\/]/i.test(file)), false);
  assert.doesNotMatch(publicSource, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(publicSource, /Download SVG|SVG download|downloadSvg\b|assetUrls\.svg|pngUrl\s*\|\|\s*svgUrl/i);
  assert.match(publicSource, /internalSvgUrl|convertInternalSvgToBlob/);
  assert.doesNotMatch(generatedPublicData, /https?:\/\/[^"'\s]*s3[^"'\s]*amazonaws|r2\.cloudflarestorage\.com|coloring\/test-v1/i);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.equal(renameStatus.split(/\r?\n/).some((line) => /^R/.test(line.trim())), false);
});

test("AdSense readiness is false when contact, public site, asset domain, or legal review is incomplete", async () => {
  const readiness = await readJson("pipeline/manifests/round-4y-adsense-readiness-review.json");
  const gate = await readJson("pipeline/manifests/round-4y-launch-readiness-gate.json");

  assert.equal(readiness.live_ad_code_absent, true);
  assert.equal(readiness.trust_pages_present, true);
  assert.equal(readiness.adsense_ready_to_apply, false);

  if (!gate.contact_method_ready || !gate.public_site_url_ready || !gate.public_asset_domain_ready || gate.legal_review_flags.length > 0) {
    assert.equal(gate.adsense_ready_to_apply, false);
    assert.ok(gate.blockers.length > 0);
  }
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
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", relativePath], { cwd: REPO_ROOT });
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
  return filePath.replace(/\\/g, "/");
}
