# Round 4F Netlify Deployment Plan

Generated: 2026-05-10

## Deployment Mode

- Hosting target: Netlify
- Mode: static export
- Build command: `npm run build`
- Publish directory: `out`
- Netlify Functions required: no

## Required Environment Variables

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_COLORING_ASSET_BASE_URL`

`NEXT_PUBLIC_COLORING_ASSET_BASE_URL` should point at the CDN or object-storage base URL that contains `svg/`, `png/`, and `thumbs/`.

## Preview With Media

Set `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` before running the build. For local media without a backend, serve `pipeline/production/full/assets/` with a separate static file server and use that local URL as the asset base URL.

## Preview Without Media

If no asset base URL is configured, the gallery still builds and renders placeholders. Download and print actions stay unavailable because there are no public media URLs.

## Production Launch Blockers

- Generated media still needs to be uploaded to object storage or a CDN.
- Public SVG, PNG preview, and thumbnail URLs need spot checks.
- Cache headers and content types need verification at the public asset origin.
- SEO JSON-LD, Open Graph image, and image sitemap work should wait until public media URLs are stable.
