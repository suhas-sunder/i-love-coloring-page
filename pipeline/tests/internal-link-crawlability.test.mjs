import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  analyzeInternalLinkGraph,
  normalizeInternalHref,
  parseHtmlDocument,
  tokenizeHtml,
} from "../lib/internal-link-graph.mjs";

const SITE = "https://www.ilovecoloringpage.com";

test("HTML parser extracts only real anchors and preserves constrained evidence", () => {
  const html = `<!doctype html>
    <html><head>
      <link rel="canonical" href="${SITE}/coloring-pages/animals">
      <script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Home","item":"${SITE}"}]}</script>
      <script>window.fixture = '<a href="/not-a-real-edge">No</a>';</script>
    </head><body>
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a
          aria-label="Return home"
          href="/"
        ><span>Home</span></a>
        <span aria-current="page">Animals</span>
      </nav>
      <section class="gallery-section"><div class="gallery-grid">
        <a href="../printables/animals/example-1234567890"><img alt="Example printable"></a>
      </div></section>
    </body></html>`;

  const first = parseHtmlDocument(html, "/coloring-pages/animals");
  const second = parseHtmlDocument(html, "/coloring-pages/animals");
  assert.deepEqual(first, second);
  assert.equal(first.canonical, `${SITE}/coloring-pages/animals`);
  assert.equal(first.canonicalLinks.length, 1);
  assert.equal(first.anchors.length, 2);
  assert.deepEqual(first.anchors.map((entry) => entry.href), ["/", "../printables/animals/example-1234567890"]);
  assert.deepEqual(first.anchors.map((entry) => entry.region), ["breadcrumb", "gallery-card"]);
  assert.equal(first.anchors[1].accessibleName, "Example printable");
  assert.equal(first.structuredBreadcrumbs.length, 1);
  assert.equal(first.breadcrumbs.at(-1).label, "Animals");

  const duplicate = parseHtmlDocument('<a href="/coloring-pages">Image</a><a href="/coloring-pages">Title</a>', "/");
  assert.equal(duplicate.anchors.length, 2);
  assert.equal(new Set(duplicate.anchors.map((entry) => normalizeInternalHref(entry.href, "/", SITE).target)).size, 1);
});

test("tokenizer tolerates comments, multiline attributes, and malformed trailing markup", () => {
  const html = `<!-- <a href="/ignored">Ignored</a> -->
    <a data-label='one'
       href='/coloring-pages/flowers'>Flowers</a>
    <a href="/unterminated>`;
  const tokens = tokenizeHtml(html);
  assert.equal(tokens.filter((entry) => entry.name === "a" && !entry.closing).length, 1);
  assert.doesNotThrow(() => parseHtmlDocument(html, "/"));
  assert.equal(parseHtmlDocument(html, "/").anchors[0].href, "/coloring-pages/flowers");
});

test("href normalization handles canonical, relative, encoded, query, hash, asset, and external classes", () => {
  assert.deepEqual(pick(normalizeInternalHref("/coloring-pages/animals/", "/", SITE)), {
    kind: "internal-route", target: "/coloring-pages/animals", hasQuery: false, hasHash: false, hadTrailingSlash: true,
  });
  assert.deepEqual(pick(normalizeInternalHref("animals/page/2#gallery", "/coloring-pages/flowers", SITE)), {
    kind: "internal-route", target: "/coloring-pages/animals/page/2", hasQuery: false, hasHash: true, hadTrailingSlash: false,
  });
  assert.equal(normalizeInternalHref("/coloring-pages/%66lowers", "/", SITE).target, "/coloring-pages/flowers");
  assert.equal(normalizeInternalHref("/coloring-pages?query=cat", "/", SITE).hasQuery, true);
  assert.equal(normalizeInternalHref("/icon.svg", "/", SITE).kind, "static-file");
  assert.equal(normalizeInternalHref("mailto:admin@ilovecoloringpage.com", "/", SITE).kind, "contact");
  assert.equal(normalizeInternalHref("https://example.com/page", "/", SITE).kind, "external");
  assert.equal(normalizeInternalHref("http://www.ilovecoloringpage.com/coloring-pages", "/", SITE).noncanonicalOrigin, true);
});

test("active crawlability contracts expose the deployment marker and synchronized hub breadcrumb root", async () => {
  const [shell, jsonLd, runner, packageSource] = await Promise.all([
    readFile("src/components/site/PublicPageShell.tsx", "utf8"),
    readFile("src/lib/seo/pageJsonLd.ts", "utf8"),
    readFile("pipeline/scripts/validate-internal-link-crawlability.mjs", "utf8"),
    readFile("package.json", "utf8"),
  ]);
  assert.match(shell, /data-link-graph-version="static-crawl-v1"/);
  assert.match(jsonLd, /\{ name: "Home", path: "\/" \}/);
  assert.match(runner, /analyzeInternalLinkGraph/);
  assert.match(packageSource, /validate:internal-links/);
  assert.doesNotMatch(runner, /https?:\/\/www\.ilovecoloringpage\.com\//);
});

test("full graph analysis fails clearly when the production export prerequisite is absent", () => {
  assert.throws(
    () => analyzeInternalLinkGraph({ rootDir: process.cwd(), outDir: path.join(process.cwd(), "__missing-static-export__") }),
    /production output was not found.*Run the production build first/,
  );
});

function pick(value) {
  return {
    kind: value.kind,
    target: value.target,
    hasQuery: value.hasQuery,
    hasHash: value.hasHash,
    hadTrailingSlash: value.hadTrailingSlash,
  };
}
