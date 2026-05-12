# Round 5C SVG + WebP Manual Upload Guide

Upload this folder:

```text
pipeline/r2-upload-test-svg-webp/coloring-pages
```

Upload to the bucket root so keys start with:

```text
coloring-pages/svg/
coloring-pages/webp/
```

Do not upload `png/` or `thumbs/`. Do not upload the full library in this round.

Set the app asset base after manual upload:

```text
NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://YOUR-ASSET-DOMAIN.com/coloring-pages
```

Temporary `r2.dev` can be used for testing only. A custom asset domain remains the preferred production path.

Required content types:

- SVG: `image/svg+xml`
- WebP: `image/webp`

Required CORS methods: GET, HEAD
