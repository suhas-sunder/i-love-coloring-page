# Main Merge Validation

Generated: 2026-05-15T02:00:32.6312843-04:00

## Merge

- Source branch: `ver-6-seo`
- Source commit: `aff947dfc98495c800165adc81de4e2e82759b95`
- Target branch: `main`
- Merge commit: `e98b9e1999bbff34960d3a3ba6f366540509a279`
- Merge result: passed with no conflicts

## Validation

- `ver-6-seo`: `npm test`, `npm run typecheck`, and `npm run build` passed.
- `main`: `npm test`, `npm run typecheck`, and `npm run build` passed after allowing historical QA branch checks to accept `main`.
- Lint: not configured in `package.json`.

## Static Export And SEO Assets

- Static export build passed with 627 generated static pages.
- `app/api`: absent.
- `/sitemap`: present in `out/sitemap.html`.
- `/sitemap.xml`: present with 171 loc entries and includes `/sitemap`.
- `/image-sitemap.xml`: present with 6,352 WebP image entries, 0 SVG image entries, and 0 PNG image entries.
- `/robots.txt`: present and references both `/sitemap.xml` and `/image-sitemap.xml`.
- OG images and JSON-LD remain covered by the accepted SEO branch validation and merged generated data.

## Download And Ad Boundaries

- SVG user-facing download remains absent.
- PNG/JPG/WebP download controls remain present.
- Live AdSense code, ad scripts, and ad client IDs remain absent.
- Live ads remain deferred.

## Protected Paths

- `images/`: unchanged.
- `ilovesvg/`: unchanged.
- Screenshots and PDF artifacts: not staged.
- `.env` files and secrets: not staged.

## Notes

The static output contains literal `localhost` and `r2.dev` strings only inside client-side URL safety guards that reject unsafe asset bases. They are not generated asset endpoints.

GSC submission remains manual after live deploy verification. Submit `/sitemap.xml` and `/image-sitemap.xml` only after `main` is deployed and live routing/sitemap verification passes.

## Blockers

None.
