# Round 4B Asset Hosting Plan

Generated: 2026-05-10

## Current State

- Generated assets remain under `pipeline/production/full/` and stay ignored/local.
- The Next.js app uses generated metadata and an asset resolver instead of copying media into `public/`.
- Client data stores asset subpaths only, not local source image paths or Windows filesystem paths.

## Resolver Behavior

- CDN/object storage base URL: `NEXT_PUBLIC_COLORING_ASSET_BASE_URL`
- Local proxy server toggle: `COLORING_ENABLE_LOCAL_ASSET_PROXY`
- Client proxy URL toggle: `NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY`
- If no base URL or proxy is configured, image cards render a clean placeholder and hide download/print actions.
- The local proxy rejects path traversal and serves only approved production asset folders.

## Options

| Option | Pros | Cons | Fit |
| --- | --- | --- | --- |
| Copy to `public/` | Simple static hosting | Bloats repo/build context with thousands of media files | Not recommended now |
| CDN/object storage | Small repo, cacheable, production-friendly | Requires upload and URL mapping step | Recommended |
| Server route proxy | Useful for local review and controlled internal serving | Adds runtime file-serving surface | Local development only |

## Recommended Next Step

Upload `pipeline/production/full/assets/` to object storage or a CDN path, then set `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` to that public base URL. Keep the local proxy for development review only.
