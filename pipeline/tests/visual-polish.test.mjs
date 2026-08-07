import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(file, "utf8");

test("sitewide visual-polish marker and approved token-only layout contracts remain present", async () => {
  const [shell, css] = await Promise.all([
    read("src/components/site/PublicPageShell.tsx"),
    read("src/styles/components.css"),
  ]);

  assert.match(shell, /data-visual-polish-version="professional-sweep-v1"/);
  assert.match(css, /\.related-link\s*\{[^}]*display:\s*flex;[^}]*column-gap:\s*var\(--space-8\);[^}]*row-gap:\s*var\(--space-4\);/s);
  assert.match(css, /\.related-list\s*\{[^}]*gap:\s*var\(--space-12\) var\(--space-32\);/s);
  assert.match(css, /\.hub-preview-card-body\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*row-gap:\s*var\(--space-4\);/s);
  assert.match(css, /\.html-sitemap-link\s*\{[^}]*display:\s*flex;[^}]*column-gap:\s*var\(--space-8\);/s);
  assert.match(css, /\.printable-print-action \.button\s*\{[^}]*background:\s*var\(--color-paper\);/s);
  assert.match(css, /\.printable-facts div\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:\s*hidden/s);
});

test("related-collection inventory and canonical links remain data-owned", async () => {
  const source = await read("src/components/coloring/PrintableDetailPage.tsx");
  assert.match(source, /getRelatedPrintableHubs\(printable, 6\)/);
  assert.match(source, /relatedHubs\.map/);
  assert.match(source, /href=\{hub\.route\}/);
  assert.match(source, /className="related-link-label"/);
  assert.match(source, /className="related-link-count"/);
  assert.doesNotMatch(source, /slice\(0,\s*[1-5]\)/);
});

test("visual polish stays in the existing centralized stylesheet", async () => {
  const shell = await read("src/components/site/PublicPageShell.tsx");
  assert.doesNotMatch(shell, /style=\{\{|<style|styled\./);
});
