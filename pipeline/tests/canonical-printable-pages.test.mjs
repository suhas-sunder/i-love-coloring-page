import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const printables = await readJson("src/generated/coloring/runtime-printables.json");
const routeManifest = await readJson("pipeline/manifests/runtime-printable-route-manifest.json");
const routeIndex = await readJson("src/generated/coloring/runtime-printable-route-index.json");
const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");

test("canonical static parameters contain exactly one frozen route per runtime printable", async () => {
  assert.equal(routeManifest.routes.length, 6352);
  assert.equal(routeManifest.routes.length, printables.records.length);
  assert.equal(new Set(routeManifest.routes.map((route) => `${route.primaryCategorySlug}/${route.slugAndId}`)).size, 6352);
  assert.equal(routeManifest.routes.some((route) => deferred.records.some((entry) => entry.assetId === route.assetId)), false);
  const routeSource = await readText("app/printables/[primaryCategory]/[slugAndId]/page.tsx");
  assert.match(routeSource, /dynamicParams = false/);
  assert.match(routeSource, /routeManifestJson/);
  assert.match(routeSource, /primaryCategory: route\.primaryCategorySlug/);
  assert.match(routeSource, /slugAndId: route\.slugAndId/);
  assert.equal((routeSource.match(/notFound\(\)/g) || []).length >= 2, true);
});

test("terminal stable-ID parsing and exact canonical matching reject all mismatches", async () => {
  const helper = await readText("src/lib/coloring/printables.ts");
  assert.match(helper, /\^\(\.\+\)-\(\[a-f0-9\]\{10\}\)\$/);
  for (const record of printables.records) {
    const match = /^(.+)-([a-f0-9]{10})$/.exec(record.slugAndId);
    assert.ok(match, record.assetId);
    assert.equal(match[1], record.canonicalSlug);
    assert.equal(match[2], record.stableId);
    assert.equal(routeIndex.index[record.stableId] >= 0, true);
  }
  for (const invalid of ["", "alligator", "alligator-123", "alligator-123456789", "alligator-12345678901", "alligator-zzzzzzzzzz", "-4feec8505a"]) {
    assert.equal(/^(.+)-([a-f0-9]{10})$/.test(invalid), false, invalid);
  }
  assert.match(helper, /printable\.primaryCategorySlug !== primaryCategory/);
  assert.match(helper, /printable\.slugAndId !== slugAndId/);
  assert.match(helper, /printable\.canonicalSlug !== parsed\.slug/);
});

test("all metadata inputs are unique, bounded, public, canonical, and WebP-only", async () => {
  const titles = [];
  const descriptions = [];
  const canonicals = [];
  for (const record of printables.records) {
    const title = record.metadataTitle;
    const description = `Print ${record.displayTitle} or download this coloring page as PNG, JPG, or WebP.`;
    const canonical = `https://www.ilovecoloringpage.com${record.canonicalPath}`;
    const image = `https://assets.ilovecoloringpage.com/coloring-pages/${record.webpPath}`;
    assert.ok(title.length <= 128, record.assetId);
    assert.ok(description.length <= 210, record.assetId);
    assert.doesNotMatch(`${title}\n${description}\n${canonical}\n${image}`, /localhost|r2\.dev|cloudflarestorage|amazonaws|\.svg|[A-Za-z]:\\/i);
    assert.match(image, /\/webp\/.+\.webp$/);
    titles.push(title); descriptions.push(description); canonicals.push(canonical);
  }
  assert.equal(new Set(titles).size, titles.length);
  assert.equal(new Set(descriptions).size, descriptions.length);
  assert.equal(new Set(canonicals).size, canonicals.length);
  const source = await readText("src/lib/coloring/printableMetadata.ts");
  assert.match(source, /title: \{ absolute: title \}/);
  assert.match(source, /robots: \{ index: true, follow: true \}/);
  assert.match(source, /getPrintableTitleModel\(printable\)/);
  const titleSource = await readText("src/lib/coloring/printableTitles.ts");
  assert.match(titleSource, /Print \$\{displayTitle\} or download this coloring page as PNG, JPG, or WebP\./);
});

test("normal cards use canonical image and title links with a separate Print action", async () => {
  const card = await readText("src/components/coloring/ImageCard.tsx");
  const actions = await readText("src/components/coloring/PrintableCardActions.tsx");
  const gallery = await readText("src/components/coloring/GalleryGrid.tsx");
  const data = await readText("src/lib/coloring/data.ts");
  const appSource = await readProjectText([
    "app/page.tsx",
    "app/coloring-pages/page.tsx",
    "src/components/coloring/GalleryGrid.tsx",
    "src/components/coloring/GallerySearch.tsx",
    "src/components/coloring/HubPageContent.tsx",
    "src/components/coloring/RotatingFeaturedGrid.tsx",
    "src/lib/seo/pageJsonLd.ts",
  ]);
  assert.match(card, /<Link className="gallery-item-media-link" href=\{itemHref\}/);
  assert.match(card, /<Link className="item-title-link" href=\{itemHref\}/);
  assert.match(card, /<PrintableCardActions/);
  assert.match(actions, />\s*Print\s*<\/button>/);
  assert.match(gallery, /getPrintablePath\(item\)/);
  assert.match(data, /title: titleModel\.displayTitle/);
  assert.match(data, /altText: titleModel\.shortAccessibleTitle/);
  assert.doesNotMatch(gallery, /runtime-printables\.json|runtime-printable-route-index\.json/);
  assert.match(card, /prefetch=\{false\}/);
  assert.doesNotMatch(card, /href=\{assetUrls\.|<Link[\s\S]{0,120}<button/);
  assert.doesNotMatch(appSource, /#asset-|#image-/);
});

test("detail page preserves the approved section order and exposes no internal utility", async () => {
  const detail = await readText("src/components/coloring/PrintableDetailPage.tsx");
  const order = ["PrintableDetailActions", "Related printable pages", "Related Collections", "Printing this coloring page"].map((needle) => detail.indexOf(needle));
  assert.equal(order.every((value) => value >= 0), true);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(detail, /<Breadcrumbs[\s\S]*className="printable-breadcrumb"/);
  const breadcrumbs = await readText("src/components/site/Breadcrumbs.tsx");
  assert.match(breadcrumbs, /<nav className=\{classes\} aria-label="Breadcrumb">/);
  assert.match(breadcrumbs, /aria-current=\{isCurrent \? "page" : undefined\}/);
  assert.match(detail, /<GalleryGrid items=\{relatedItems\}[\s\S]*showPrintActions=\{false\}/);
  assert.match(detail, /getRelatedPrintables\(printable, 8\)/);
  assert.match(detail, /buildPrintableDescription\(printable\)/);
  assert.doesNotMatch(detail, /\{printable\.(?:stableId|slugAndId|canonicalSlug)\}|>SVG<|Download SVG/);
  assert.equal((detail.match(/Related Collections/g) || []).length, 1);
});

test("dialog semantics, focus, Escape, scroll locking, and stale-result guards are present", async () => {
  const dialog = await readText("src/components/coloring/PrintablePreviewDialog.tsx");
  const actions = await readText("src/components/coloring/PrintableCardActions.tsx");
  const modalHook = await readText("src/hooks/useModalDialog.ts");
  const overlayProvider = await readText("src/components/site/SiteInteractionProvider.tsx");
  assert.match(dialog, /role="dialog" aria-modal="true" aria-labelledby=\{titleId\}/);
  assert.match(dialog, /useModalDialog/);
  assert.match(modalHook, /event\.key === "Escape"/);
  assert.match(modalHook, /event\.key !== "Tab"/);
  assert.match(overlayProvider, /document\.body\.style\.overflow = "hidden"/);
  assert.match(dialog, /runIdRef\.current !== runId/);
  assert.match(actions, /restoreFocusAfterModalClose\(triggerRef\.current\)/);
  assert.match(modalHook, /requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*target\?\.isConnected[\s\S]*target\.focus\(\)/);
  assert.match(actions, /aria-haspopup="dialog"/);
});

test("printable JSON-LD is limited to WebPage, BreadcrumbList, and ImageObject", async () => {
  const source = await readText("src/lib/seo/printableJsonLd.ts");
  const hubJsonLd = await readText("src/lib/seo/pageJsonLd.ts");
  assert.match(source, /"@type": "WebPage"/);
  assert.match(source, /buildBreadcrumbListJsonLd/);
  assert.match(source, /buildImageObjectJsonLd/);
  assert.doesNotMatch(source, /Product|Offer|Review|AggregateRating|FAQPage|Question/);
  assert.match(hubJsonLd, /getPrintablePath\(item\)/);
  assert.doesNotMatch(hubJsonLd, /#asset-/);
});

test("canonical controls and image fallbacks retain accessible native semantics", async () => {
  const card = await readText("src/components/coloring/ImageCard.tsx");
  const image = await readText("src/components/coloring/AssetImage.tsx");
  const dialog = await readText("src/components/coloring/PrintablePreviewDialog.tsx");
  const actions = await readText("src/components/coloring/PrintableCardActions.tsx");
  const styles = await readText("src/styles/components.css");
  assert.match(card, /<Link className="gallery-item-media-link"/);
  assert.match(card, /<Link className="item-title-link"/);
  assert.doesNotMatch(card, /<Link[\s\S]{0,500}<button/);
  assert.match(actions, /<button[\s\S]*type="button"/);
  assert.match(actions, /aria-haspopup="dialog"/);
  assert.match(image, /onError=\{handleImageError\}/);
  assert.match(image, /<AssetPlaceholder/);
  assert.match(dialog, /useId\(\)/);
  assert.match(dialog, /aria-modal="true" aria-labelledby=\{titleId\}/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.printable-action-panel/);
});

function buildExpectedMetadataTitles(records) {
  const suffix = " | Free Printable";
  const subjectLimit = 72 - suffix.length;
  const designReserve = " — Design 9999".length;
  const groups = new Map();
  for (const record of records) {
    const collisionKey = truncateAtWord(naturalTitle(record), subjectLimit - designReserve).toLowerCase();
    const group = groups.get(collisionKey) || [];
    group.push(record);
    groups.set(collisionKey, group);
  }
  const titles = new Map();
  for (const group of groups.values()) {
    group.sort((left, right) => left.assetId.localeCompare(right.assetId));
    group.forEach((record, index) => {
      const qualifier = group.length > 1 ? ` — Design ${index + 1}` : "";
      const subject = `${truncateAtWord(naturalTitle(record), subjectLimit - qualifier.length)}${qualifier}`;
      titles.set(record.assetId, `${subject}${suffix}`);
    });
  }
  return titles;
}

function naturalTitle(record) {
  return /\bcoloring page$/i.test(record.publicTitle.trim()) ? record.publicTitle.trim() : `${record.publicTitle.trim()} Coloring Page`;
}

function truncateAtWord(value, maxLength) {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength + 1).slice(0, value.slice(0, maxLength + 1).lastIndexOf(" ")).trimEnd();
}

async function readJson(relativePath) { return JSON.parse(await readText(relativePath)); }
async function readText(relativePath) { return readFile(path.join(ROOT, relativePath), "utf8"); }
async function readProjectText(relativePaths) { return (await Promise.all(relativePaths.map(readText))).join("\n"); }
