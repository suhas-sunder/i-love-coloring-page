# Round 4I Full R2 Manual Upload Guide

Generated: 2026-05-10

## What To Upload

Upload:

```text
pipeline/r2-upload/coloring-pages
```

The final R2 object keys must begin with:

```text
coloring-pages/
```

Recommended layout: upload the local `coloring-pages` folder to the object-key root so the bucket contains `coloring-pages/svg`, `coloring-pages/png`, and `coloring-pages/thumbs`.

If your upload UI is already positioned inside a `coloring-pages` destination prefix, upload only the contents of the local `coloring-pages` folder. This avoids a repeated parent prefix.

## Environment Value

```bash
NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://YOUR-ASSET-DOMAIN.com/coloring-pages
```

Use a custom asset domain for production. The temporary r2.dev route is not the production recommendation.

## Preview After Upload

```powershell
$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='https://YOUR-ASSET-DOMAIN.com/coloring-pages'; npm run build; npx serve out -l 3005
```

Open the representative pages below and verify previews, PNG downloads, SVG downloads, and print behavior.

- `/coloring-pages` - appears early in this generated hub gallery
- `/coloring-pages/animals` - appears early in this generated hub gallery
- `/coloring-pages/anime-girls` - appears early in this generated hub gallery
- `/coloring-pages/beetles` - appears early in this generated hub gallery
- `/coloring-pages/birds` - appears early in this generated hub gallery
- `/coloring-pages/birthday` - appears early in this generated hub gallery
- `/coloring-pages/bridges` - appears early in this generated hub gallery
- `/coloring-pages/buildings` - appears early in this generated hub gallery
- `/coloring-pages/butterflies` - appears early in this generated hub gallery
- `/coloring-pages/cars` - appears early in this generated hub gallery
- `/coloring-pages/cats` - appears early in this generated hub gallery
- `/coloring-pages/chibi` - appears early in this generated hub gallery
- `/coloring-pages/chibi-flowers` - appears early in this generated hub gallery
- `/coloring-pages/christmas` - appears early in this generated hub gallery
- `/coloring-pages/crabs` - appears early in this generated hub gallery
- `/coloring-pages/cute` - appears early in this generated hub gallery
- `/coloring-pages/detailed-for-adults` - appears early in this generated hub gallery
- `/coloring-pages/dinosaurs` - appears early in this generated hub gallery
