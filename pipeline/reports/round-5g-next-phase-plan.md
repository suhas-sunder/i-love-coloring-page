# Round 5G Next Phase Plan

## Recommendation For Round 5H

Round 5H should prepare an owner-review implementation for JPG/JPEG/WebP download controls, keeping SVG hidden and preserving PNG as the conservative public default until the owner accepts the UI.

## Current Gate State

- Browser conversion ready: true
- JPG/JPEG/WebP controls ready for owner approval: true
- SVG + WebP test passed: true
- Full upload deferred: true

## Required Before Retesting Or Enabling Controls

- Keep `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` pointed at the uploaded 30-record SVG + WebP test bundle public base ending in `/coloring-pages`.
- Configure SVG CORS on the R2/custom-domain asset route before retesting browser canvas conversion.
- Use a custom asset domain for production readiness; r2.dev is only a temporary test route.
- Confirm SVG is served as `image/svg+xml` and WebP is served as `image/webp`.
- Confirm SVG responses include CORS headers that allow the local preview origin and final production origin.
- Rerun `node pipeline/scripts/round-5g-verify-svg-webp-public-cors.mjs --public-base-url https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring-pages --origin http://localhost:3005`.

## Still Deferred

- Full library upload.
- JPG/JPEG/WebP visible download controls.
- Live AdSense.
- Image sitemap.
- Open Graph image generation.
- Per-image pages.
