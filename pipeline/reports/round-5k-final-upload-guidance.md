# Round 5K Final Upload Guidance

- Final SVG plus WebP model confirmed: true
- PNG/thumbs can remain excluded: true
- SVG internal only: true
- Full upload still final stage: true
- Explicit approval required before full upload: true
- Image sitemap deferred: true
- Open Graph images deferred: true
- Live AdSense deferred: true
- PNG not used as WebP substitute: true

## Object Key Pattern

coloring-pages/{svg|webp}/{category}/{deterministic-file-name-with-hash}.{svg|webp}

## Custom Asset Domain Pattern

https://assets.ilovecoloringpage.com/coloring-pages/{svg|webp}/{category}/{filename}

## Required Content Types

- SVG: image/svg+xml
- WebP: image/webp

## Required CORS

- Origins: http://localhost:3005, http://127.0.0.1:3005, https://www.ilovecoloringpage.com
- Optional origins: https://ilovecoloringpage.com
- Methods: GET, HEAD, OPTIONS
- Credentials required: false
- Note: SVG must allow anonymous cross-origin browser image loading so canvas export remains untainted.

## Cache Recommendation

- Cache-Control: public, max-age=31536000, immutable for hash-versioned SVG and WebP object keys
- ETag or Last-Modified recommended: true
- Purge needed after header change: false

## Current Evidence

- Custom-domain URL status: completed
- SVG URLs passed: true
- WebP URLs passed: true
- SVG CORS passed: true
- Cache headers acceptable: true
- Browser canvas export passed: true
- Print ready: true
- PNG download ready: true
- JPG download ready: true
- WebP download ready: true
- Browser QA status: completed

## Full Upload Checklist

- Confirm Round 5K URL, CORS, cache, static export, and browser QA pass on the custom domain.
- Upload only svg/ and webp/ folders under coloring-pages/ after explicit approval.
- Do not include png/ or thumbs/ in the new upload plan unless a later blocker reverses the SVG plus WebP model.
- Do not expose SVG as a user-facing download.
- Do not add image sitemap, Open Graph image generation, JSON-LD expansion, live ads, backend routes, or app/api.
- After full upload, rerun URL, CORS, static export, and browser QA checks against the same custom asset base.

## Verification Commands After Full Upload

- `node pipeline/scripts/round-5k-verify-custom-domain-assets.mjs --public-base-url https://assets.ilovecoloringpage.com/coloring-pages --site-url https://www.ilovecoloringpage.com --contact-email admin@ilovecoloringpage.com`
- `node pipeline/scripts/round-5k-browser-custom-domain-qa-runner.cjs --serve-out --app-url http://127.0.0.1:3005 --asset-base-url https://assets.ilovecoloringpage.com/coloring-pages`
- `node --test pipeline/tests/round-5k-custom-asset-domain.test.mjs`
- `npm run build`

No Round 5K upload guidance blockers remain for the 30-record SVG plus WebP test bundle.
