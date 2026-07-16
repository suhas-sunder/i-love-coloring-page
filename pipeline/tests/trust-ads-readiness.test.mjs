import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const TRUST_ROUTES = ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"];
const TRUST_SOURCES = TRUST_ROUTES.map((route) => `app${route}/page.tsx`);
const identity = parseSiteIdentity();

test("trust-page content is factual and preserves six public routes", () => {
  const trustModel = readText("src/lib/trust/trustPages.ts");
  const source = TRUST_SOURCES.map(readText).join("\n");
  assert.equal((trustModel.match(/path:\s*"\/(?:about|contact|privacy|terms|affiliate-disclosure|editorial-policy)"/g) || []).length, 6);
  assert.equal((trustModel.match(/indexable:\s*true/g) || []).length, 6);
  assert.equal((trustModel.match(/footer:\s*true/g) || []).length, 6);
  assert.doesNotMatch(source, /Draft policy|Draft terms|Draft disclosure|requires legal review before launch|future round|under construction/i);
  assert.doesNotMatch(source, /\[email protected\]|contact details coming soon|successful production assets|source filename|assetId|stableId|pipeline/i);
  assert.doesNotMatch(source, /simple PNG|PNG-only|download PNG files|PNG print and download/i);

  const pages = TRUST_ROUTES.map((route) => readOutputHtml(route));
  assert.equal(pages.every((html) => (stripScripts(html).match(/<h1\b/g) || []).length === 1), true);
  const titles = pages.map((html) => decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || ""));
  const descriptions = pages.map((html) => decodeHtml(extractMeta(html, "description")));
  assert.equal(new Set(titles).size, 6);
  assert.equal(new Set(descriptions).size, 6);
  TRUST_ROUTES.forEach((route, index) => assert.equal(extractCanonical(pages[index]), `${identity.canonicalSiteUrl}${route}`));

  const footer = readText("src/components/site/SiteFooter.tsx");
  assert.match(footer, /footerPolicyLinks/);
});

test("site identity is centralized and server-safe", () => {
  const source = readText("src/config/siteIdentity.ts");
  const siteConfig = readText("src/lib/site/siteConfig.ts");
  assert.match(source, /import "server-only"/);
  assert.equal(identity.siteName, "I Love Coloring Page");
  assert.equal(identity.canonicalSiteUrl, "https://www.ilovecoloringpage.com");
  assert.equal(identity.publicContactEmail, "admin@ilovecoloringpage.com");
  assert.equal(identity.publicOperatorName, null);
  assert.equal(identity.publicBusinessName, null);
  assert.equal(identity.publicMailingAddress, null);
  assert.equal(identity.governingRegion, null);
  assert.equal(identity.policyLastUpdatedDate, "2026-07-15");
  assert.equal(identity.policyLastUpdatedLabel, "July 15, 2026");
  assert.equal(Object.values(identity.features).every((active) => active === false), true);
  assert.equal(Object.values(identity.readiness).every((ready) => ready === false), true);
  assert.match(siteConfig, /import \{ siteIdentity \}/);
  assert.doesNotMatch(siteConfig, /NEXT_PUBLIC_CONTACT_EMAIL|NEXT_PUBLIC_SITE_OWNER_NAME|NEXT_PUBLIC_SITE_JURISDICTION|ownerName|jurisdiction/);

  for (const file of listTree("app", "src").filter((file) => /\.(?:ts|tsx)$/.test(file))) {
    const text = readText(file);
    if (/^[\s\S]{0,80}"use client"/.test(text)) assert.doesNotMatch(text, /siteIdentity|siteConfig/);
  }
});

test("contact safety uses only the verified public address", () => {
  const contact = readText("app/contact/page.tsx");
  const trustSource = TRUST_SOURCES.map(readText).join("\n");
  assert.match(contact, /mailto:\$\{contactEmail\}/);
  for (const phrase of ["Broken page or image reports", "Print or download problems", "Accessibility feedback", "Copyright or ownership concerns", "Privacy questions", "Partnership or affiliate inquiries"]) {
    assert.match(contact, new RegExp(escapeRegExp(phrase)));
  }
  assert.match(contact, /Please do not send passwords, financial information, health information, identity documents, or other sensitive personal information/);
  assert.match(contact, /page URL, a concise explanation/);
  assert.doesNotMatch(contact, /<form|<input|<textarea|type="file"|newsletter|birth date|age field|DMCA agent|respond within|remove within/i);
  assert.doesNotMatch(trustSource, /contact@ilovecoloringpage\.com|\[email protected\]|example\.com/i);
  const emails = [...trustSource.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase());
  assert.equal(emails.every((email) => email === identity.publicContactEmail), true);
  assert.equal(existsSync(path.join(ROOT, "app/api")), false);
});

test("privacy accuracy distinguishes current and conditional practices", () => {
  const source = readText("app/privacy/page.tsx");
  const normalized = source.replace(/\s+/g, " ");
  for (const phrase of [
    "static printable gallery",
    "Search and filters run in the browser",
    "Hosting and technical logs",
    "inert layout placeholders",
    "No site analytics tool is currently documented as active",
    "If advertising is enabled later",
    "These are conditional future practices",
    "Children and families",
    "Applicable rights depend on the visitor's location and circumstances",
    "Material feature changes should trigger another privacy review",
  ]) assert.match(normalized, new RegExp(escapeRegExp(phrase), "i"));
  assert.match(source, /siteIdentity\.policyLastUpdatedLabel/);
  assert.doesNotMatch(source, /COPPA compliant|COPPA does not apply|not child-directed|general-audience printable gallery|GDPR compliant|no data collection|no logs exist|logs are anonymous|guaranteed response/i);
  assert.doesNotMatch(source, /Google advertising cookies are currently|advertising cookies are currently active/i);
});

test("terms accuracy preserves print and download limits", () => {
  const source = readText("app/terms/page.tsx");
  const normalized = source.replace(/\s+/g, " ");
  assert.match(normalized, /personal, home, classroom, library, and casual craft use/);
  assert.match(normalized, /PNG, JPG, and WebP/);
  assert.match(normalized, /Print and download are separate actions/);
  for (const restriction of ["resell", "bulk-redistribute", "repackage", "competing printable library"]) assert.match(normalized, new RegExp(restriction, "i"));
  for (const section of ["Acceptance and site purpose", "Intellectual property and removal concerns", "External and affiliate links", "No warranties", "Limitations", "Changes to the site or terms", "Contact"]) assert.match(normalized, new RegExp(escapeRegExp(section)));
  assert.doesNotMatch(source, /governed by the laws|exclusive jurisdiction|arbitration|limited liability company|corporation|street address|minimum age|commercial use is permitted|therapy/i);
  assert.doesNotMatch(source, /draft|legal advice|legal review/i);
});

test("affiliate accuracy matches inactive implementation", () => {
  const source = readText("app/affiliate-disclosure/page.tsx");
  const normalized = source.replace(/\s+/g, " ");
  const active = readActiveRuntimeSource();
  assert.match(normalized, /No affiliate links are currently active/);
  assert.match(normalized, /does not earn commissions from ordinary.*printable-page links, Print actions, or download actions/);
  assert.match(normalized, /will be disclosed clearly near the relevant content/);
  assert.match(normalized, /updated before affiliate monetization begins/);
  assert.doesNotMatch(source, /Amazon|qualifying purchases|at no additional cost|future round/i);
  assert.doesNotMatch(active, /[?&](?:aff(?:iliate)?_?id|tag|ref)=[^\s"'&]+/i);
});

test("editorial-policy accuracy matches deterministic title behavior", () => {
  const source = readText("app/editorial-policy/page.tsx");
  const normalized = source.replace(/\s+/g, " ");
  assert.match(normalized, /reviewed base titles and use deterministic quality rules/);
  assert.match(normalized, /stable Design N labels/);
  assert.match(normalized, /Correcting visible wording does not silently create a new printable-page address/);
  assert.match(normalized, /classifications of pages currently available/);
  assert.match(normalized, /Uncertain wording is held for.*editorial review/);
  assert.doesNotMatch(source, /assetId|stableId|hash|pipeline|source filename|local path|prompt|model|storage|every image|original artwork|legally cleared|suitable for every age|educational review|therapeutic/i);
});

test("network integrations contain only required runtime flows", () => {
  const active = readActiveRuntimeSource();
  const output = readStaticRuntimeText();
  const combined = `${active}\n${output}`;
  for (const pattern of [
    /adsbygoogle|pagead2\.googlesyndication|google_ad_client|data-ad-client\s*=|<script[^>]+doubleclick/i,
    /ca-pub-[0-9]{10,}/i,
    /googletagmanager|google-analytics|\bgtag\s*\(|plausible\.io|matomo|mixpanel|segment\.com|hotjar|clarity\.ms/i,
    /__tcfapi|cookiebot|onetrust|consentmanager|fundingchoices|quantcast.*choice/i,
  ]) assert.doesNotMatch(combined, pattern);
  assert.doesNotMatch(active, /document\.cookie|cookies\s*\(|set-cookie/i);
  assert.match(active, /fetch\("\/search-data\/navigation\.json"/);
  assert.match(active, /fetch\(searchDataPath/);

  const hosts = new Set();
  for (const html of [readOutputHtml("/"), readOutputHtml("/coloring-pages"), readOutputHtml("/coloring-pages/animals")]) {
    for (const match of html.matchAll(/<(?:img|script)\b[^>]*src="(https?:\/\/[^"#]+)"/gi)) hosts.add(new URL(decodeHtml(match[1])).hostname);
  }
  assert.deepEqual([...hosts].sort(), ["assets.ilovecoloringpage.com"]);
});

test("age-treatment readiness records review without a legal classification", () => {
  const source = readText("pipeline/scripts/build-trust-ads-readiness.mjs");
  const allowed = ["Owner/legal review required", "Clearly general informational page", "Explicit child-oriented labeling", "Mixed or ambiguous audience", "Not applicable"];
  for (const classification of allowed.slice(0, 4)) assert.match(source, new RegExp(escapeRegExp(classification)));
  assert.match(source, /\/coloring-pages\/for-kids/);
  assert.match(source, /\/coloring-pages\/easy/);
  assert.match(source, /chibi, cute, kawaii, and plushies collections/);
  assert.match(source, /\/coloring-pages\/detailed-for-adults/);
  assert.doesNotMatch(source, /COPPA compliant|COPPA exempt|Legally child-directed|Legally general audience/);
});

test("AdSense placement readiness preserves slots and accepted visible density", () => {
  const config = readText("src/lib/ads/config.ts");
  const css = readText("src/styles/components.css");
  const forbidden = [
    "src/components/site/SiteHeader.tsx",
    "src/components/site/MobileNav.tsx",
    "src/components/site/GlobalSearchDialog.tsx",
    "src/components/coloring/GallerySearch.tsx",
    "src/components/coloring/GalleryFilters.tsx",
    "src/components/coloring/PrintablePreviewDialog.tsx",
    "src/components/coloring/PrintableDetailActions.tsx",
  ].map(readText).join("\n");
  assert.match(config, /trust: condensedLayout\(\{ "top-banner": "trust-header-banner" \}\)/);
  assert.match(config, /"html-sitemap": condensedLayout\(\{ "top-banner": "sitemap-header-banner" \}\)/);
  assert.match(config, /"not-found": \{ mode: "none", sideRailsAllowed: false, slots: \{\} \}/);
  assert.match(css, /data-ad-layout="full"[\s\S]*ad-slot-top-banner[\s\S]*display: none/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*data-ad-layout="full"[\s\S]*ad-slot-top-banner[\s\S]*display: grid/);
  assert.match(css, /@media \(min-width: 1536px\)[\s\S]*\.ad-rail[\s\S]*display: block/);
  assert.doesNotMatch(forbidden, /PageAdSlot|<AdSlot|<AdRail|data-ad-placeholder|>Advertisement</);
  assert.deepEqual([
    logicalSlots("/"),
    logicalSlots("/coloring-pages"),
    logicalSlots("/coloring-pages/animals"),
    logicalSlots("/coloring-pages/animals/page/2"),
    logicalSlots("/privacy"),
    logicalSlots("/sitemap"),
  ], [6, 6, 6, 3, 1, 1]);
  assert.equal((readFileSync(path.join(OUT, "404.html"), "utf8").match(/data-ad-slot="/g) || []).length, 0);
});

test("AdSense account readiness contains no live credentials or tooling", () => {
  const combined = `${readActiveRuntimeSource()}\n${readStaticRuntimeText()}`;
  for (const pattern of [
    /ca-pub-[0-9]{10,}/i,
    /data-ad-slot=["'][0-9]{5,}["']/i,
    /google-adsense-account|google-site-verification/i,
    /adsbygoogle|pagead2\.googlesyndication|google_ad_client/i,
    /__tcfapi|cookiebot|onetrust|consentmanager|fundingchoices/i,
    /ad_storage|analytics_storage/i,
  ]) assert.doesNotMatch(combined, pattern);
  assert.equal(existsSync(path.join(ROOT, "ads.txt")), false);
  assert.equal(existsSync(path.join(ROOT, "public/ads.txt")), false);
  assert.equal(existsSync(path.join(OUT, "ads.txt")), false);
  assert.equal(identity.readiness.verifiedPublisherIdExists, false);
  assert.equal(identity.readiness.cmpDecisionExists, false);
  assert.equal(identity.readiness.ageTreatmentDecisionExists, false);
});

test("trust-report determinism and artifact safety", () => {
  const command = ["pipeline/scripts/build-trust-ads-readiness.mjs"];
  execFileSync(process.execPath, command, { cwd: ROOT, stdio: "pipe" });
  const firstManifest = readText("pipeline/manifests/trust-ads-readiness.json");
  const firstReport = readText("pipeline/reports/trust-ads-readiness.md");
  execFileSync(process.execPath, command, { cwd: ROOT, stdio: "pipe" });
  const secondManifest = readText("pipeline/manifests/trust-ads-readiness.json");
  const secondReport = readText("pipeline/reports/trust-ads-readiness.md");
  assert.equal(sha256(firstManifest), sha256(secondManifest));
  assert.equal(sha256(firstReport), sha256(secondReport));
  const combined = `${secondManifest}\n${secondReport}`;
  assert.doesNotMatch(combined, /generatedAt|T\d{2}:\d{2}:\d{2}|[A-Za-z]:\\|file:\/\/|\/Users\/|browser profile|screenshots?\//i);
  assert.doesNotMatch(combined, /ca-pub-[0-9]|pub-0{6,}|AKIA[0-9A-Z]{12,}|BEGIN (?:RSA |EC )?PRIVATE KEY/i);
  const emails = [...combined.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase());
  assert.equal(emails.every((email) => email === identity.publicContactEmail), true);
  assert.equal(listTree("out").some((file) => /trust-ads-readiness/i.test(file)), false);
});

function parseSiteIdentity() {
  const source = readText("src/config/siteIdentity.ts");
  const match = source.match(/Object\.freeze\((\{[\s\S]*\})\);\s*$/);
  assert.ok(match);
  return JSON.parse(match[1]);
}

function logicalSlots(route) {
  return (readOutputHtml(route).match(/data-ad-slot="/g) || []).length;
}

function readActiveRuntimeSource() {
  return listTree("app", "src")
    .filter((file) => /\.(?:ts|tsx|js|jsx|css)$/.test(file) && !file.startsWith("src/generated/"))
    .map(readText)
    .join("\n");
}

function readStaticRuntimeText() {
  return listTree("out")
    .filter((file) => file.endsWith(".js") || file.endsWith(".css") || /^(?:out\/)?(?:robots\.txt|sitemap\.xml|image-sitemap\.xml)$/.test(file))
    .map(readText)
    .join("\n");
}

function listTree(...relativeRoots) {
  const files = [];
  for (const relativeRoot of relativeRoots) walk(path.join(ROOT, relativeRoot));
  return files;
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files.push(path.relative(ROOT, absolute).replaceAll("\\", "/"));
    }
  }
}

function readOutputHtml(route) {
  const relative = route === "/" ? "index.html" : `${route.slice(1)}.html`;
  return readFileSync(path.join(OUT, relative), "utf8");
}

function extractMeta(html, name) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]).find((tag) => new RegExp(`name="${name}"`, "i").test(tag))?.match(/content="([^"]*)"/i)?.[1] || "";
}

function extractCanonical(html) {
  return decodeHtml([...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]).find((tag) => /rel="canonical"/i.test(tag))?.match(/href="([^"]*)"/i)?.[1] || "");
}

function stripScripts(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
}

function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'");
}

function readText(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
