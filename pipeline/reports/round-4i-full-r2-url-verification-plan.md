# Round 4I Full R2 URL Verification Plan

Generated: 2026-05-10

## Purpose

After the full manual upload, verify public URLs only. No R2 credentials are required. The plan includes 100 representative SVG, PNG preview, and thumbnail trios, for 300 URLs.

## Sample URL Patterns

- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/svg/animals-playing-cards/animals-armadillo-1a6eaccdef.svg` (image/svg+xml)
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/png/animals-playing-cards/animals-armadillo-1a6eaccdef.png` (image/png)
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/thumbs/animals-playing-cards/animals-armadillo-1a6eaccdef-thumb.png` (image/png)
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/svg/anime-girls/anime-girl-ankylosaurus-hoodie-plushie-c819919e77.svg` (image/svg+xml)
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/png/anime-girls/anime-girl-ankylosaurus-hoodie-plushie-c819919e77.png` (image/png)
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/thumbs/anime-girls/anime-girl-ankylosaurus-hoodie-plushie-c819919e77-thumb.png` (image/png)
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/svg/animals-playing-cards/animals-armadillos-wildlife-f2912c1ad5.svg` (image/svg+xml)
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/png/animals-playing-cards/animals-armadillos-wildlife-f2912c1ad5.png` (image/png)
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/thumbs/animals-playing-cards/animals-armadillos-wildlife-f2912c1ad5-thumb.png` (image/png)
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/svg/mandala-geometry-patterns/chatgpt-image-oct-14-2025-11-38-05-pm-ea62e476c5.svg` (image/svg+xml)
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/png/mandala-geometry-patterns/chatgpt-image-oct-14-2025-11-38-05-pm-ea62e476c5.png` (image/png)
- `${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/thumbs/mandala-geometry-patterns/chatgpt-image-oct-14-2025-11-38-05-pm-ea62e476c5-thumb.png` (image/png)

## Expected Results

- HTTP status: 200
- SVG content type: `image/svg+xml`
- PNG content type: `image/png`
- Recommended cache header: `public, max-age=31536000, immutable`
- No private endpoint redirects
- No repeated upload prefix

Run:

```powershell
node pipeline\scripts\round-4i-verify-full-r2-urls.mjs --live
```

Before upload, run without `--live` to record a safe `not_run` result.
