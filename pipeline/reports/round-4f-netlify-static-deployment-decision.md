# Round 4F Netlify Static Deployment Decision

Generated: 2026-05-10

## Decision

Use static export for the current public gallery.

The current product stage is a printable gallery with generated data and CDN-hosted media. It does not need accounts, saves, uploads, payments, or server-side image work, so a production backend would add operational weight before it solves a product problem.

## Option A: Static Export

Selected.

- Builds static HTML, CSS, and JavaScript into `out/`.
- Requires every public gallery route to be generated at build time.
- Requires media to resolve through `NEXT_PUBLIC_COLORING_ASSET_BASE_URL`.
- Does not require Netlify Functions for the gallery.

## Option B: Netlify Next Adapter

Not selected for this round.

- It would deploy cleanly to Netlify.
- It can create functions when route handlers or dynamic behavior remain.
- The current route set can be made static, so the adapter is not needed for the public gallery.

## Asset Proxy Decision

The App Router local media proxy was removed. Local real-asset preview should use the same public base URL contract by pointing `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` at either a real CDN URL or a separate static file server serving `pipeline/production/full/assets/`.
