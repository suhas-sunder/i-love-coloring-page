# Round 4F Next Phase Plan

Generated: 2026-05-10

## Recommendation For Round 4G

Run a CDN/object-storage dry-run planning pass using `pipeline/manifests/round-4e-asset-publish-manifest.json`, but do not upload real assets unless the next prompt explicitly approves the provider and target.

## Before Public Launch

- Choose the production asset host.
- Upload or sync generated media to the chosen public asset origin.
- Set `NEXT_PUBLIC_COLORING_ASSET_BASE_URL`.
- Verify representative SVG, PNG preview, and thumbnail URLs.
- Verify static Netlify output with real media URLs.
- Confirm cache headers and content types from the public asset origin.

## Backend Deferral

Keep backend work deferred until the product needs accounts, saved projects, user uploads, payments, moderation, server-side image processing, or email/account workflows.

## SEO Work Still Deferred

Do not start JSON-LD, Open Graph image, or image sitemap work until stable public media URLs are verified.
