# Round 4I Full R2 Bundle Report

Generated: 2026-05-10

## Scope

Round 4I prepares the complete Cloudflare R2 upload folder after the 30-record Round 4H public URL test passed. It does not upload files, does not rename generated media, and does not copy production media into `public/`.

## Bundle

- Local folder: `pipeline/r2-upload/coloring-pages`
- Upload prefix: `coloring-pages`
- Image records: 6557
- Media files: 19671
- SVG files: 6557
- PNG preview files: 6557
- Thumbnail files: 6557
- Total bytes represented: 3148598669
- Requested mode: hardlink
- Linked files: 19671
- Copied files: 0
- Failed files: 0

## Folder Structure

```text
pipeline/r2-upload/coloring-pages/
  svg/
  png/
  thumbs/
```

## Object Keys

- `coloring-pages/svg/animals/animals-alligator-4feec8505a.svg` (image/svg+xml)
- `coloring-pages/png/animals/animals-alligator-4feec8505a.png` (image/png)
- `coloring-pages/thumbs/animals/animals-alligator-4feec8505a-thumb.png` (image/png)
- `coloring-pages/svg/animals/animals-antelopes-49a5eb802f.svg` (image/svg+xml)
- `coloring-pages/png/animals/animals-antelopes-49a5eb802f.png` (image/png)
- `coloring-pages/thumbs/animals/animals-antelopes-49a5eb802f-thumb.png` (image/png)

Public URL pattern:

```text
https://YOUR-ASSET-DOMAIN.com/coloring-pages/{svg|png|thumbs}/<category>/<filename>
```

Set `NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://YOUR-ASSET-DOMAIN.com/coloring-pages` after manual upload to a production custom asset domain. The temporary r2.dev route remains acceptable only for testing.
