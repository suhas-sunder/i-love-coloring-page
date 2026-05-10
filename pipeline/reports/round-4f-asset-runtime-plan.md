# Round 4F Asset Runtime Plan

Generated: 2026-05-10

## Production Behavior

Production media URLs resolve from `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` plus the generated relative paths in `src/generated/coloring/items.json`.

Examples:

- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/svg/{category}/{file}.svg`
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/png/{category}/{file}.png`
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/thumbs/{category}/{file}-thumb.png`

## Unavailable Media State

If `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` is unset:

- image previews show the existing clean placeholder state
- PNG and SVG download links are not rendered
- print actions are not rendered
- no local filesystem paths are exposed

## Local Preview

Use the same asset base URL contract locally. For a no-backend local preview, serve `pipeline/production/full/assets/` with a separate static file server and set `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` to that local origin.

## Production Constraint

The public gallery must not depend on `app/api/coloring-assets`. That route was removed in Round 4F.
