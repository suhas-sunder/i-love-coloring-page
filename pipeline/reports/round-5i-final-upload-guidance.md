# Round 5I Final Upload Guidance

- Final SVG plus WebP model confirmed: false
- PNG/thumbs can remain excluded: true
- SVG internal only: true
- Full upload still final stage: true
- Explicit approval required before full upload: true
- Image sitemap deferred: true
- Open Graph images deferred: true
- Live AdSense deferred: true

## Object Key Pattern

coloring-pages/{svg|webp}/{category-or-group}/{deterministic-filename-with-hash}.{svg|webp}

## Custom Asset Domain Pattern

https://assets.ilovecoloringpage.com/coloring-pages

## Required Content Types

- SVG: image/svg+xml
- WebP: image/webp

## Required CORS

- Origins: http://localhost:3005, http://127.0.0.1:3005
- Methods: GET, HEAD
- Credentials required: false

## Cache Recommendation

- Cache-Control: public, max-age=31536000, immutable
- ETag or Last-Modified recommended: true
- Purge needed after header change: true

## Full Upload Checklist

- Confirm Round 5I custom-domain URL checks pass for all 60 test URLs.
- Confirm SVG CORS passes with Origin headers for local preview and the production site origin.
- Confirm WebP gallery rendering and browser SVG-to-canvas export pass on the custom asset domain.
- Upload only SVG and WebP folders under coloring-pages/ after explicit approval.
- Do not include png/ or thumbs/ in new upload bundles unless a later blocker justifies it.
- Do not expose SVG as a user-facing download.
- Do not add image sitemap, Open Graph image generation, live ads, backend routes, or app/api.

## Verification Commands After Full Upload

- `node pipeline/scripts/round-5i-verify-custom-domain-assets.mjs`
- `node pipeline/scripts/round-5i-browser-custom-domain-qa-runner.cjs --app-url http://127.0.0.1:3005`
- `node --test pipeline/tests/round-5i-custom-asset-domain.test.mjs`
- `npm run build`
