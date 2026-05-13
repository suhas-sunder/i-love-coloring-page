# Round 4E Asset URL Contract

Generated: 2026-05-10

## Source Of Truth

- Production media stays outside the app repository under `pipeline/production/full/assets/` during development.
- The deployed app must use `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` for public media URLs.
- Components must not build media URLs by hand. They receive resolved URLs from the centralized resolver.

## URL Shape

- SVG: `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/svg/{category}/{file}.svg`
- PNG preview: `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/png/{category}/{file}.png`
- Thumbnail: `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/thumbs/{category}/{file}-thumb.png`

## Local Preview

- Local proxy URLs are allowed only when `NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY=1` and `COLORING_ENABLE_LOCAL_ASSET_PROXY=1`.
- The proxy remains disabled by default.
- The proxy serves only approved production asset roots and rejects traversal.

## Unavailable State

When neither CDN base URL nor local proxy is configured, the gallery renders intentional placeholders and does not expose broken download or print controls.
