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
  assert.equal(identity.publicOperatorDisplayName, "I Love Coloring Page");
  assert.equal(identity.publicOperatorDisplayBasis, "site-name-only");
  assert.equal(identity.publicContactEmail, "admin@ilovecoloringpage.com");
  assert.equal(identity.publicOperatorName, null);
  assert.equal(identity.publicBusinessName, null);
  assert.equal(identity.publicMailingAddress, null);
  assert.equal(identity.publicMailingAddressDecision, "omit");
  assert.equal(identity.governingRegion, null);
  assert.equal(identity.policyLastUpdatedDate, "2026-08-04");
  assert.equal(identity.policyLastUpdatedLabel, "August 4, 2026");
  assert.equal(identity.features.liveAdvertisingActive, true);
  assert.equal(identity.features.analyticsActive, false);
  assert.equal(identity.features.affiliateLinksActive, false);
  assert.equal(identity.features.accountsActive, false);
  assert.equal(identity.features.formsActive, false);
  assert.equal(identity.readiness.operatorIdentityDecisionExists, true);
  assert.equal(identity.readiness.mailingAddressDecisionExists, true);
  assert.equal(identity.readiness.trademarkPolicyDecisionExists, true);
  assert.equal(identity.readiness.trademarkQualifiedReviewComplete, false);
  assert.equal(identity.readiness.privacyPolicyQualifiedReviewComplete, false);
  assert.equal(identity.readiness.termsPolicyQualifiedReviewComplete, false);
  assert.equal(identity.ownerDecisions.artworkRightsBasis, "created-and-published-by-site");
  assert.equal(identity.ownerDecisions.publicUseLicense, "personal-family-classroom-homeschool-nonprofit-educational");
  assert.equal(identity.readiness.verifiedPublisherIdExists, true);
  assert.equal(identity.readiness.cmpDecisionExists, false);
  assert.equal(identity.readiness.ageTreatmentDecisionExists, false);
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
  for (const phrase of [
    "The exact page URL",
    "Identification of the material at issue",
    "The requester's name and contact information",
    "A clear explanation of the claimed right or factual concern",
    "Supporting information sufficient to evaluate the request",
    "The requested correction or removal",
  ]) assert.match(contact.replace(/&apos;/g, "'"), new RegExp(escapeRegExp(phrase)));
  assert.match(contact, /may review, restrict, correct, or remove material after evaluating the request/);
  assert.match(contact, /not presented as a statutory notice procedure, designated-agent process, or legal determination/);
  assert.doesNotMatch(contact, /<form|<input|<textarea|type="file"|newsletter|birth date|age field|DMCA agent|respond within|remove within/i);
  assert.doesNotMatch(trustSource, /contact@ilovecoloringpage\.com|\[email protected\]|example\.com/i);
  const emails = [...trustSource.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase());
  assert.equal(emails.every((email) => email === identity.publicContactEmail), true);
  assert.equal(existsSync(path.join(ROOT, "app/api")), false);
});

test("privacy accuracy describes advertising, analytics status, and regional gating", () => {
  const source = readText("app/privacy/page.tsx");
  const normalized = source.replace(/&apos;/g, "'").replace(/\s+/g, " ");
  for (const phrase of [
    "static printable gallery",
    "Search and filters run in the browser",
    "Hosting and technical logs",
    "No account is required",
    "Google display advertising",
    "Google AdSense display advertising",
    "Google and approved advertising partners",
    "advertising cookies and related technologies",
    "Personalized advertising may be used only where it is enabled",
    "Google Ads Settings",
    "YourAdChoices",
    "Regional advertising controls",
    "does not guess a visitor's region from language, locale, or time zone",
    "Eligible production content pages use the configured AdSense units automatically",
    "EEA, the UK, and Switzerland",
    "PostHog is not currently active",
    "Cloudflare Browser Insights or Real User Monitoring is not included in repository source",
    "production check on August 2, 2026 still found",
    "Children and families",
    "Applicable rights depend on the visitor's location and circumstances",
    "Material feature changes should trigger another privacy review",
    "does not establish a legal or advertising classification for the entire site",
  ]) assert.match(normalized, new RegExp(escapeRegExp(phrase), "i"));
  assert.match(source, /siteIdentity\.policyLastUpdatedLabel/);
  assert.doesNotMatch(source, /COPPA compliant|COPPA does not apply|not child-directed|general-audience printable gallery|GDPR compliant|no data collection|no logs exist|logs are anonymous|guaranteed response/i);
  assert.doesNotMatch(source, /PostHog is active|PostHog analytics is currently active|global privacy banner|locale-based region|timezone-based region/i);
});

test("terms accuracy records approved uses and restrictions without unsupported jurisdiction claims", () => {
  const source = readText("app/terms/page.tsx");
  const normalized = source.replace(/\s+/g, " ");
  assert.match(normalized, /Created and published by I Love Coloring Page/);
  for (const permission of ["personal use", "family and household use", "classroom use", "homeschool use", "nonprofit educational use"]) {
    assert.match(normalized, new RegExp(escapeRegExp(permission)));
  }
  for (const restriction of ["Sell, resell, redistribute, republish, re-upload, or sublicense", "paid products, memberships, books, courses, bundles, applications, or services", "other commercial exploitation"]) {
    assert.match(normalized, new RegExp(escapeRegExp(restriction)));
  }
  assert.match(normalized, /share or display your own completed colored artwork/);
  assert.match(normalized, /Download PDF saves the current one-page US Letter printable/);
  assert.match(normalized, /PNG and JPG are printable-page images; WebP is an artwork image/);
  assert.match(normalized, /Print and download are separate actions/);
  for (const section of ["Site purpose and current status", "Coloring pages and permitted use", "Uses that require written permission", "Intellectual property and removal concerns", "External and affiliate links", "Changes to the site or terms", "Contact"]) assert.match(normalized, new RegExp(escapeRegExp(section)));
  assert.doesNotMatch(source, /public-use license is under review|Final permitted-use terms remain under review|PNG is the server-rendered initial download option/i);
  assert.doesNotMatch(source, /governed by the laws|exclusive jurisdiction|arbitration|limited liability company|corporation|street address|minimum age|therapy/i);
  assert.match(source, /verified owner input.*appropriate review/s);
});

test("affiliate accuracy matches inactive implementation", () => {
  const source = readText("app/affiliate-disclosure/page.tsx");
  const normalized = source.replace(/\s+/g, " ");
  const active = readActiveRuntimeSource();
  assert.match(normalized, /No affiliate links are currently active/);
  assert.match(normalized, /does not earn commissions from ordinary.*printable-page links, Print actions, or download actions/);
  assert.match(normalized, /will be disclosed clearly near the relevant content/);
  assert.match(normalized, /updated before affiliate monetization begins/);
  assert.match(normalized, /Google AdSense display advertising is separate from affiliate marketing/);
  assert.match(normalized, /A display ad is not an affiliate link/);
  assert.doesNotMatch(source, /Amazon|qualifying purchases|at no additional cost|future round/i);
  assert.doesNotMatch(active, /[?&](?:aff(?:iliate)?_?id|tag|ref)=[^\s"'&]+/i);
});

test("editorial-policy accuracy matches deterministic title behavior", () => {
  const source = readText("app/editorial-policy/page.tsx");
  const normalized = source.replace(/\s+/g, " ");
  assert.match(normalized, /reviewed base titles and use deterministic quality rules/);
  assert.match(normalized, /stable Design N labels/);
  assert.match(normalized, /Correcting visible wording does not silently create a new printable-page address/);
  assert.match(normalized, /explicit assignments/);
  assert.match(normalized, /display useful output facts and values with recorded support/);
  assert.match(normalized, /Uncertain wording is held for.*editorial review/);
  assert.match(normalized, /Created and published by I Love Coloring Page/);
  assert.match(normalized, /Uncertain metadata is withheld from public output until it is reviewed/);
  assert.match(normalized, /does not mean that all 6,352 printables received individual manual visual inspection/);
  assert.match(normalized, /handled case by case/);
  assert.match(normalized, /does not authorize a bulk title rewrite/);
  assert.doesNotMatch(source, /assetId|stableId|hash|pipeline|source filename|local path|prompt|AI model|language model|generation model|storage|every image|original artwork|legally cleared|suitable for every age|educational review|therapeutic/i);
});

test("network integrations contain configured AdSense but no Cloudflare RUM, PostHog, or other analytics source", () => {
  const active = readActiveRuntimeSource();
  const output = readStaticRuntimeText();
  const combined = `${active}\n${output}`;
  assert.equal((active.match(/ca-pub-4810616735714570/g) || []).length, 1);
  for (const slot of ["5574432869", "5115981872", "9929324856", "2489818539", "5382861174"]) assert.match(active, new RegExp(slot));
  for (const pattern of [
    /googletagmanager|google-analytics|\bgtag\s*\(|plausible\.io|matomo|mixpanel|segment\.com|hotjar|clarity\.ms|posthog-js|posthog\.init|NEXT_PUBLIC_POSTHOG/i,
    /static\.cloudflareinsights\.com|\/cdn-cgi\/rum|beacon\.min\.js/i,
    /__tcfapi|cookiebot|onetrust|consentmanager|fundingchoices|quantcast.*choice/i,
  ]) assert.doesNotMatch(combined, pattern);
  for (const route of ["/", "/coloring-pages", "/coloring-pages/animals"]) {
    const html = readOutputHtml(route);
    assert.match(html, /data-ad-mode="live"/);
    assert.match(html, /data-ad-client="ca-pub-4810616735714570"/);
    assert.doesNotMatch(html, /data-ad-placeholder="true"/);
  }
  assert.doesNotMatch(readOutputHtml("/privacy"), /data-ad-mode=|data-ad-client=|data-ad-placeholder=/i);
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
  assert.match(config, /trust: \{ mode: "none", sideRailsAllowed: false, slots: \{\} \}/);
  assert.match(config, /"html-sitemap": \{ mode: "none", sideRailsAllowed: false, slots: \{\} \}/);
  assert.match(config, /"not-found": \{ mode: "none", sideRailsAllowed: false, slots: \{\} \}/);
  assert.match(css, /\.public-page-shell \.ad-slot-post-header-banner,[\s\S]*display: none/);
  assert.doesNotMatch(css, /data-ad-layout="full"[^}]+ad-slot-top-banner[^}]+display: none/);
  assert.match(css, /@media \(min-width: 1536px\)[\s\S]*\.ad-rail[\s\S]*display: block/);
  assert.doesNotMatch(forbidden, /PageAdSlot|<AdSlot|<AdRail|data-ad-placeholder|>Advertisement</);
  assert.deepEqual([
    logicalSlots("/"),
    logicalSlots("/coloring-pages"),
    logicalSlots("/coloring-pages/animals"),
    logicalSlots("/coloring-pages/animals/page/2"),
    logicalSlots("/privacy"),
    logicalSlots("/sitemap"),
  ], [5, 5, 5, 3, 0, 0]);
  assert.equal((readFileSync(path.join(OUT, "404.html"), "utf8").match(/data-ad-slot="/g) || []).length, 0);
});

test("AdSense account readiness contains the confirmed public configuration and exact ads.txt", () => {
  const combined = `${readActiveRuntimeSource()}\n${readStaticRuntimeText()}`;
  assert.match(combined, /ca-pub-4810616735714570/);
  for (const slot of ["5574432869", "5115981872", "9929324856", "2489818539", "5382861174"]) assert.match(combined, new RegExp(slot));
  for (const pattern of [/google-adsense-account|google-site-verification/i, /__tcfapi|cookiebot|onetrust|consentmanager|fundingchoices/i, /ad_storage|analytics_storage/i]) assert.doesNotMatch(combined, pattern);
  for (const route of ["/", "/coloring-pages", "/coloring-pages/animals"]) {
    const html = readOutputHtml(route);
    assert.match(html, /data-ad-mode="live"/);
    assert.match(html, /data-ad-client="ca-pub-4810616735714570"/);
    assert.doesNotMatch(html, /data-ad-placeholder="true"/);
  }
  assert.doesNotMatch(readOutputHtml("/privacy"), /data-ad-mode=|data-ad-client=|data-ad-placeholder=/i);
  assert.equal(existsSync(path.join(ROOT, "ads.txt")), false);
  assert.equal(execFileSync("git", ["ls-files", "public/ads.txt"], { cwd: ROOT, encoding: "utf8" }).trim(), "public/ads.txt");
  assert.equal(readText("public/ads.txt").trim(), "google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0");
  assert.doesNotMatch(readText("public/ads.txt"), /ca-pub|\r|\n.+\n/);
  assert.equal(identity.readiness.verifiedPublisherIdExists, true);
  assert.equal(identity.readiness.cmpDecisionExists, false);
  assert.equal(identity.readiness.ageTreatmentDecisionExists, false);
});

test("trust-report determinism and artifact safety", () => {
  runTrustReadinessGenerator();
  const firstManifest = readText("pipeline/manifests/trust-ads-readiness.json");
  const firstReport = readText("pipeline/reports/trust-ads-readiness.md");
  runTrustReadinessGenerator();
  const secondManifest = readText("pipeline/manifests/trust-ads-readiness.json");
  const secondReport = readText("pipeline/reports/trust-ads-readiness.md");
  assert.equal(sha256(firstManifest), sha256(secondManifest));
  assert.equal(sha256(firstReport), sha256(secondReport));
  const readiness = JSON.parse(secondManifest);
  assert.equal(readiness.blockingIssues.length, 6);
  assert.equal(readiness.blockingIssues.some((gate) => gate.id === "owner.operator_identity"), false);
  assert.equal(readiness.blockingIssues.some((gate) => gate.id === "owner.mailing_address"), false);
  assert.equal(readiness.blockingIssues.some((gate) => gate.id === "legal.trademark_policy"), true);
  assert.equal(readiness.resolvedOwnerDecisions.publicOperatorDisplayBasis, "site-name-only");
  assert.equal(readiness.resolvedOwnerDecisions.mailingAddressDecision, "omit");
  assert.equal(readiness.resolvedOwnerDecisions.trademarkReferencePolicy, "case-by-case-review");
  assert.equal(readiness.blockingIssues.some((gate) => gate.id === "ads.account_configuration"), false);
  assert.equal(readiness.adsTxtStatus.present, true);
  assert.equal(readiness.adsTxtStatus.exactAuthorizedSellerRecord, true);
  assert.equal(readiness.liveAdvertisingStatus.active, true);
  assert.equal(readiness.accountReadiness.liveAdvertisingActive, true);
  const combined = `${secondManifest}\n${secondReport}`;
  assert.doesNotMatch(combined, /generatedAt|T\d{2}:\d{2}:\d{2}|[A-Za-z]:\\|file:\/\/|\/Users\/|browser profile|screenshots?\//i);
  assert.doesNotMatch(combined, /AKIA[0-9A-Z]{12,}|BEGIN (?:RSA |EC )?PRIVATE KEY/i);
  const emails = [...combined.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase());
  assert.equal(emails.every((email) => email === identity.publicContactEmail), true);
  assert.equal(listTree("out").some((file) => /trust-ads-readiness/i.test(file)), false);
});

function runTrustReadinessGenerator() {
  const command = ["pipeline/scripts/build-trust-ads-readiness.mjs"];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      execFileSync(process.execPath, command, { cwd: ROOT, stdio: "pipe" });
      return;
    } catch (error) {
      const diagnostic = [error?.stdout, error?.stderr]
        .filter(Boolean)
        .map((value) => value.toString())
        .join("")
        .trim();
      if (diagnostic || attempt === 3) throw error;
    }
  }
}

function parseSiteIdentity() {
  const source = readText("src/config/siteIdentity.ts");
  const match = source.match(/Object\.freeze\((\{[\s\S]*\})\);\s*$/);
  assert.ok(match);
  return JSON.parse(match[1]);
}

function logicalSlots(route) {
  return [...readOutputHtml(route).matchAll(/data-ad-slot="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((slotId) => !/^\d{10}$/.test(slotId))
    .length;
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
