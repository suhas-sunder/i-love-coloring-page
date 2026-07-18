# Test results

Audit date: 2026-07-18

## Passing current checks

- `npm run typecheck`
- `npm run validate:site-quality` — 9/9 safeguards
- `npm run test:hub-architecture` — 8/8
- `npm run test:taxonomy-promotion` — 8/8
- `npm run test:navigation` and full discovery-UX suite — 11/11
- `npm run test:page-structure` — 7/7
- `npm run test:site-quality-foundations` — 8/8
- `npm run test:crawl` — 8/8
- `npm run test:canonical` — 8/8
- `npm run test:image-sitemap` — 4/4
- affected foundation, printable-title, and static-search tests — 23/23
- `npm run validate:payload`
- `npm run validate:static-routes`
- `npm run validate:accessibility`
- `npm run validate:export-safety`
- `npm run validate:image-sitemap`
- `npm run validate:crawl`
- `npm run validate:page-layout`
- `npm run audit:site-quality`
- Next.js production compilation and static generation — 6,920 static pages

The repository has no configured formatter or lint command. TypeScript type checking is the configured static-analysis check.

## Content-quality gate

All nine site-quality safeguards pass:

- zero duplicate indexable introductions
- zero near-template introduction failures
- zero forbidden internal wording occurrences
- one Related Collections module maximum
- zero count mismatches
- noindex routes excluded from the sitemap
- zero invalid navigation destinations
- zero redirected routes in navigation
- zero exact duplicate indexable inventories

## Production build post-step blocker

The Next.js production build and export complete successfully. The composite `npm run build` exits after export because `build-trust-ads-readiness.mjs` correctly retains nine owner, legal, age-treatment, and advertising-account blockers. The gate was not weakened. The locally supplied untracked `public/ads.txt` was not modified or staged.

## Historical aggregate suite

The current aggregate `npm test` result is 281 tests: 224 pass and 57 fail. Those failures are historical phase snapshots asserting mutually superseded UI, advertisement-placeholder, download-control, and component-source shapes. They are not used to claim current collection correctness.

Tests affected by this task were modernized to assert behavior:

- public route preservation is separate from sitemap eligibility
- navigation-search collections follow active indexability
- graph, membership, count, canonical, robots, sitemap, related-module, and navigation behavior is checked directly

Four separate trust/advertising-readiness assertions also remain red against the preserved ad-mode system. They are outside this task; the nine-item readiness gate remains the authoritative blocker.

## Browser coverage

Hydrated Chromium checks passed for the representative route matrix at desktop plus 320, 375, 390, and 430 CSS-pixel widths and 720×320 landscape. Console warnings/errors were zero. See `reports/browser-qa.md`.
