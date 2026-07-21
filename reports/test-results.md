# Test results

## Final refinement verification — 2026-07-21

- `npm run typecheck` — passed.
- `npm test` — passed: 146 tests, 0 failures.
- `npm run build` — passed: 6,920 static routes generated.
- `npm run validate:refinement` — passed.
- `npm run validate:static-routes`, `validate:accessibility`, `validate:export-safety`, `validate:image-sitemap`, `validate:crawl`, `validate:page-layout`, and `validate:payload` — passed.
- `npm run verify:production-readiness` — intentionally non-zero: technical checks passed, but 9 owner/legal/account/deployment gates remain. This is a release block, not a test regression.

Audit date: 2026-07-18

## Passing current checks

- `npm test` — 143/143 current behavioral tests passed.
- `npm run typecheck` — passed.
- `npm run build` — passed; 6,920 static pages generated, including all 6,352 canonical printable routes.
- `npm run audit:site-quality` — 163 hubs and 6,352 printables analyzed; 9/9 safeguards passed.
- `npm run validate:payload` — passed.
- `npm run validate:static-routes` — seven representative canonical routes and eight invalid-route cases passed.
- `npm run validate:accessibility` — four representative printable routes plus dialog/focus/source checks passed.
- `npm run validate:export-safety` — 69,558 exported files scanned with zero findings.
- `npm run validate:image-sitemap` — passed.
- `npm run validate:crawl` — passed: 6,520 regular sitemap URLs, 6,352 image pairs, 362 indexable pagination routes, and zero mismatches.
- `npm run validate:page-layout` — nine page families passed with advertising OFF and zero live units.
- Browser QA — desktop discovery, 390-pixel mobile search/menu, Easy/For Kids, Fantasy Abyss Wyrm, Privacy, and Terms passed with zero console warnings/errors.

The repository has no configured formatter or lint script. TypeScript is the configured static-analysis check.

## Content-quality results

- Former printable format template occurrences: 0.
- Provenance-backed concise summaries: 6,126.
- Structured-details-only routes: 226.
- Duplicate meta-description groups: 0.
- Duplicate summary groups across unrelated records: 0.
- Alt-text issues: 0.
- Unique related-printable sets: 5,928.
- Site-quality safeguards: 9/9 passed.

## Historical test modernization

The baseline ordinary suite had 57 failing phase-snapshot tests across 27 milestone files. They asserted superseded component source, permanent production placeholders, obsolete navigation, and PNG-only implementation stages. The files were retained for provenance; the 57 obsolete failures were mapped in `reports/historical-test-review.csv` and removed from the ordinary behavioral entry point without deleting or weakening current accessibility, crawl, asset, ad-mode, download, taxonomy, or navigation coverage.

## Production readiness

`npm run verify:production-readiness` exits 1 as designed with exactly nine owner/legal/account/external gates. The ordinary technical build passes. The locally supplied untracked `public/ads.txt`, `public/favicon.ico`, and `public/robots.txt` were not modified or staged.
