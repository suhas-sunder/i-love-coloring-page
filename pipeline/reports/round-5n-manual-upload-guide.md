# Round 5N Manual Upload Guide

Upload this local folder:

`pipeline/r2-upload-clean/coloring-pages`

Upload it to the bucket root so final object keys start with:

- `coloring-pages/svg/`
- `coloring-pages/webp/`

Do not upload the parent `pipeline/r2-upload-clean` folder. Avoid `coloring-pages/coloring-pages`. Do not upload `png/`, `thumbs/`, or deferred manual-review items.

Expected counts:

- Records: 6352
- Deferred records: 205
- SVG files: 6352
- WebP files: 6352
- Total files: 12704
- Total bytes: 2089425709

Content types:

- SVG: `image/svg+xml`
- WebP: `image/webp`

Cache-Control: `public, max-age=31536000, immutable`

CORS: Allow GET/HEAD from https://www.ilovecoloringpage.com, http://localhost:3005, http://127.0.0.1:3005, or use an intentional wildcard for public static assets.

After upload, run:

`node pipeline/scripts/round-5k-verify-custom-domain-assets.mjs --public-base-url https://assets.ilovecoloringpage.com/coloring-pages`

Do not switch runtime app paths until verification passes.
