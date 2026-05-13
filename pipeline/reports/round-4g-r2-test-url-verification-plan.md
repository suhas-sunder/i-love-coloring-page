# Round 4G R2 Test URL Verification Plan

Generated: 2026-05-10

## Purpose

After manual upload, verify public URLs only. No credentials are required. The verifier checks status, content type, cache headers when present, and redirects away from private endpoints.

## Sample URLs

- https://assets.example.com/coloring/test-v1/png/anime-girls/anime-girl-summoning-jutsu-cute-dinosaur-plushies-e958c58eca.png (image/png)
- https://assets.example.com/coloring/test-v1/png/anime-girls/anime-girl-summoning-jutsu-cute-dragon-plushies-3f2c634dbf.png (image/png)
- https://assets.example.com/coloring/test-v1/png/chibi/chibi-enchanted-forest-fairy-dancing-in-flower-ring-c4cb5961c2.png (image/png)
- https://assets.example.com/coloring/test-v1/png/chibi/chibi-flowers-crocus-kawaii-908b17edf5.png (image/png)
- https://assets.example.com/coloring/test-v1/png/chibi/chibi-flowers-delphinium-fairy-e2952ac2c0.png (image/png)
- https://assets.example.com/coloring/test-v1/png/chibi/chibi-flowers-tulip-garden-68470e6363.png (image/png)
- https://assets.example.com/coloring/test-v1/png/chibi/chibi-holiday-halloween-tombstone-with-wilted-flowers-coloring-page-dbdec0dd78.png (image/png)
- https://assets.example.com/coloring/test-v1/png/chibi/chibi-holiday-halloween-trick-or-treat-dog-in-cute-costume-coloring-page-79fa5d8c2d.png (image/png)
- https://assets.example.com/coloring/test-v1/png/holiday/holiday-christmas-plushie-prehistoric-triceratops-family-b942c6ee0e.png (image/png)
- https://assets.example.com/coloring/test-v1/png/holiday/holiday-christmas-prehistoric-kawaii-triceratops-9689527143.png (image/png)
- https://assets.example.com/coloring/test-v1/png/indoor-plants/indoor-plants-spider-plant-24e5529d0b.png (image/png)
- https://assets.example.com/coloring/test-v1/png/mandala-geometry-patterns/mandala-geometry-patterns-plushie-cute-baby-dragon-fe1a69ef1f.png (image/png)

## Expected Headers

- SVG: `image/svg+xml`
- PNG preview: `image/png`
- Thumbnail: `image/png`
- Recommended cache: `public, max-age=31536000, immutable`

The verifier writes `pipeline/manifests/round-4g-r2-test-url-verification-results.json`. Before upload, the default dry run records `not_run` and does not fail validation.
