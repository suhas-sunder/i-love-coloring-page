# Round 5E Next Phase Plan

## Recommendation For Round 5F

Round 5F should configure NEXT_PUBLIC_COLORING_ASSET_BASE_URL for the uploaded 30-record test bundle and rerun public URL, CORS, and browser conversion verification.

## Required Before Retesting

- Set `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` to the uploaded 30-record SVG + WebP test bundle public base ending in `/coloring-pages`.
- Use a custom asset domain for production readiness, or r2.dev only as a temporary test route.
- Confirm SVG is served as `image/svg+xml` and WebP is served as `image/webp`.
- Confirm SVG responses include CORS headers that allow the local preview origin and final production origin.
- Rerun `node pipeline/scripts/round-5e-verify-svg-webp-public-urls.mjs --public-base-url https://YOUR-ASSET-DOMAIN.com/coloring-pages`.

## Still Deferred

- Full library upload.
- JPG/JPEG/WebP visible download controls.
- Live AdSense.
- Image sitemap.
- Open Graph image generation.
- Per-image pages.
