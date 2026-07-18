import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("homepage layout follows the approved image-first section order", async () => {
  const source = await readText("app/page.tsx");
  assertOrder(source, [
    "<header className=\"home-hero\"",
    "placement=\"post-header-banner\"",
    "data-page-section=\"primary-collections\"",
    "data-page-section=\"fresh-printables\"",
    "data-page-section=\"additional-discovery\"",
    "data-page-section=\"related-browse\"",
    "placement=\"related-banner\"",
  ]);
  assert.match(source, /<h1[^>]*>I Love Coloring Page<\/h1>/);
  assert.match(source, /Browse all coloring pages/);
  assert.match(source, /href="#primary-collections"/);
  assert.match(source, /fallbackItems=\{featuredItems\}[\s\S]*candidateItems=\{featuredRotationCandidates\}/);
  assert.match(source, /getFeaturedRotationCandidateItems\(rootHub, 64\)/);

  const primary = parseStringArray(source, "PRIMARY_COLLECTION_SLUGS");
  const discovery = parseStringArray(source, "DISCOVERY_COLLECTION_SLUGS");
  assert.equal(primary.length, 6);
  assert.equal(discovery.length, 6);
  assert.deepEqual(primary.filter((slug) => discovery.includes(slug)), []);

  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  assert.match(imageCard, /href=\{itemHref\}/);
  assert.match(imageCard, /prefetch=\{false\}/);
});

test("main gallery layout keeps controls next to the canonical gallery", async () => {
  const source = await readText("app/coloring-pages/page.tsx");
  assertOrder(source, [
    "<CollectionPageHeader",
    "placement=\"post-header-banner\"",
    "data-page-section=\"gallery\"",
    "<GallerySearch",
    "data-page-section=\"supporting-browse\"",
    "placement=\"related-banner\"",
  ]);
  assert.match(source, /title="Printable Coloring Pages"/);
  assert.match(source, /rootHub\.editorial\.introduction/);
  assert.equal((source.match(/<SupportingInformation/g) || []).length, 0);
  assert.equal(existsSync(path.join(ROOT, "app/coloring-pages/page/[page]/page.tsx")), false, "no new main-gallery pagination route was invented");

  const search = await readText("src/components/coloring/GallerySearch.tsx");
  assert.match(search, /type="search"/);
  assert.match(search, />Clear all</);
  assert.match(search, /setQuery\(""\)[\s\S]*setActiveFilterIds\(\[\]\)/);
  assert.match(search, /isStaticPageView && pagination \? <Pagination/);
  assert.doesNotMatch(search, /PageAdSlot|AdSlot|Advertisement/);
});

test("hub page-one layout has one related region and bounded featured printables", async () => {
  const source = await readText("src/components/coloring/HubPageContent.tsx");
  assertOrder(source, [
    "<CollectionPageHeader",
    "placement=\"post-header-banner\"",
    "data-page-section=\"featured-printables\"",
    "<GallerySearch",
    "data-page-section=\"collection-scope\"",
    "data-page-section=\"narrower-browse\"",
    "data-page-section=\"related-collections\"",
    "placement=\"related-banner\"",
  ]);
  assert.match(source, /getGeneratedFeaturedItems\(hub\)\.slice\(0, 8\)/);
  assert.match(source, /collectionCount >= 12 && featuredItems\.length >= 4/);
  assert.equal((source.match(/title="Related Collections"/g) || []).length, 1);
  assert.match(source, /getChildHubs\(hub, 8\)/);
  assert.match(source, /related\.route !== hub\.route/);
  assert.match(source, /related\.route !== "\/coloring-pages"/);
});

test("hub pagination uses the materially condensed template", async () => {
  const source = await readText("src/components/coloring/HubPageContent.tsx");
  const marker = source.indexOf('data-page-section="paginated-gallery"');
  const end = source.indexOf('<PageAdSlot pageFamily={pageFamily} placement="related-banner"', marker);
  assert.ok(marker >= 0 && end > marker, "pagination branch is identifiable");
  const branch = source.slice(marker, end);
  assert.match(source, /const pageFamily = isPageOne \? "hub" : "hub-pagination"/);
  assert.match(branch, /<PaginatedGalleryGrid items=\{pagedGallery\.items\}/);
  assert.match(branch, /<Pagination/);
  assert.match(branch, /data-page-section="return-to-collection"/);
  assert.doesNotMatch(branch, /GallerySearch|RotatingFeaturedGrid|SupportingInformation|RelatedHubs|supporting-square/);
  const heading = await readText("src/components/coloring/CollectionPageHeader.tsx");
  assert.match(heading, /page > 1 \? `\$\{title\}, Page \$\{page\}` : title/);
});

test("printable detail protects preview actions and aligns the standard placements", async () => {
  const source = await readText("src/components/coloring/PrintableDetailPage.tsx");
  assertOrder(source, [
    "<Breadcrumbs",
    "<header className=\"printable-heading\"",
    "placement=\"post-header-banner\"",
    "data-page-section=\"printable-main\"",
    "<PrintableDetailActions",
    "Related printable pages",
    "placement=\"related-banner\"",
    "Related Collections",
    "<SupportingInformation",
  ]);
  const mainStart = source.indexOf("<section className=\"printable-main\"");
  const mainEnd = source.indexOf("</section>", mainStart);
  assert.doesNotMatch(source.slice(mainStart, mainEnd), /PageAdSlot|AdSlot|Advertisement/);
  assert.match(source, /pageFamily="printable"[\s\S]*title="Printing this coloring page"/);
  assert.match(source, /<PrintableDetailActions item=\{item\} internalSvgUrl=\{assetSources\.fullResolutionArtwork\.url\} pngPreviewUrl=\{null\}/);
});

test("copy regression scan rejects outdated and internal page wording", async () => {
  const source = await readProjectText([
    "app/page.tsx",
    "app/coloring-pages/page.tsx",
    "src/components/coloring/HubPageContent.tsx",
    "src/components/coloring/HubHero.tsx",
    "src/components/coloring/PrintableDetailPage.tsx",
    "src/components/site/SiteFooter.tsx",
  ]);
  for (const forbidden of [
    /Preview\s*&\s*print/i,
    /Image previews open print controls/i,
    /Print from the gallery/i,
    /selected from successful production assets/i,
    /clean PNG downloads/i,
  ]) assert.doesNotMatch(source, forbidden);
  assert.match(source, /PNG, JPG, (?:and )?WebP/);
  assert.equal((await readText("src/components/coloring/HubPageContent.tsx")).match(/Related Collections/g)?.length, 1);
});

test("page accessibility source contract remains explicit", async () => {
  const breadcrumbs = await readText("src/components/site/Breadcrumbs.tsx");
  const header = await readText("src/components/coloring/CollectionPageHeader.tsx");
  const search = await readText("src/components/coloring/GallerySearch.tsx");
  const filters = await readText("src/components/coloring/GalleryFilters.tsx");
  const pagination = await readText("src/components/coloring/Pagination.tsx");
  const styles = await readProjectText(["src/styles/components.css", "src/styles/base.css"]);
  assert.match(breadcrumbs, /<nav[^>]+aria-label="Breadcrumb"/);
  assert.match(breadcrumbs, /aria-current=\{isCurrent \? "page" : undefined\}/);
  assert.match(header, /<h1 className="page-title page-title-wide">/);
  assert.match(search, /aria-label="Search this collection"/);
  assert.match(search, /aria-live="polite"/);
  assert.match(filters, /<fieldset className="gallery-filter-group"/);
  assert.match(filters, /type="checkbox"/);
  assert.match(pagination, /<nav className="pagination" aria-label="Gallery pagination">/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

function assertOrder(source, needles) {
  const positions = needles.map((needle) => source.indexOf(needle));
  positions.forEach((position, index) => assert.ok(position >= 0, `missing ${needles[index]}`));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
}

function parseStringArray(source, name) {
  const match = new RegExp(`const ${name} = \\[([^\\]]+)\\]`).exec(source);
  assert.ok(match, name);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function readProjectText(relativePaths) {
  return (await Promise.all(relativePaths.map(readText))).join("\n");
}
