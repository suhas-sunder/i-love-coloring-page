# Test results

Audit date: 2026-07-18

## Passing checks

- `npm run typecheck`
- `npm run test:site-quality-foundations` — 8/8
- `npm run test:advertisements` — 5/5
- `npm run test:discovery-ux` — 11/11
- `npm run test:taxonomy-promotion` — 8/8
- `npm run test:printables` — 11/11
- `npm run test:canonical` — 8/8
- `npm run test:printable-titles` — 9/9
- `npm run test:crawl` — 8/8
- `npm run test:image-sitemap` — 4/4
- `npm run test:search-data` — 6/6
- `npx next build` — 6,979 static outputs
- `npm run validate:payload`
- `npm run validate:static-routes`
- `npm run validate:accessibility`
- `npm run validate:export-safety`
- `npm run validate:image-sitemap`
- `npm run validate:crawl`
- `npm run validate:page-layout`
- `npm run audit:site-quality`

The repository has no configured formatter or lint command. TypeScript type checking is the configured static-analysis check.

## Intentional non-zero quality gate

`npm run validate:site-quality` reports seven passing safeguards and two failures:

1. Three near-identical introduction templates affect the 163 public hubs.
2. Forbidden internal/production wording occurs 134 times.

These are reported editorial debts. The audit does not silently rewrite thousands of pages.

## Production build post-step blocker

The Next.js production build itself completes successfully. The composite `npm run build` exits after the build because `build-trust-ads-readiness.mjs` correctly retains nine owner, legal, age-treatment, and advertising-account blockers. The gate was not weakened. The locally supplied untracked `public/ads.txt` is detected but was not modified or staged by this task.

## Historical aggregate suite

The current aggregate `npm test` result is 281 tests: 226 pass and 55 fail. The failures are concentrated in historical phase-snapshot tests whose frozen source-string expectations conflict with the current requirements, including permanent production placeholders, older download-format decisions, prior navigation literals, and superseded component-shape checks. Current behavior is covered by the focused passing tests above. The legacy tests were neither deleted nor weakened; reconciling and retiring contradictory phase snapshots is a separate test-maintenance task.

## Browser coverage

Production-export and hydrated-browser checks passed at the available 1280×720 viewport. The connected browser did not expose viewport emulation, so 320, 375, 390, and 430 CSS-pixel widths and landscape keyboard behavior remain explicit manual acceptance items. See `reports/browser-qa.md`.
