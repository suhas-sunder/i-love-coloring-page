# Round 5Q St Patricks Day Upload Plan

- Category: st-patricks-day
- Included records: 20
- SVG files: 20
- WebP files: 20
- Total files: 40
- Total bytes: 3747503
- Required confirm file count: 40
- Upload source: pipeline/r2-upload-optimized/coloring-pages
- Upload performed: false

Allowed prefixes:

- `coloring-pages/svg/st-patricks-day/`
- `coloring-pages/webp/st-patricks-day/`

Owner smoke upload command:

`node pipeline/scripts/round-5o-upload-clean-bundle-to-r2.mjs --execute --confirm-bucket i-love-coloring-page --confirm-prefix coloring-pages --confirm-category st-patricks-day --confirm-file-count 40 --category st-patricks-day --skip-existing`

Post-upload verification command:

`node pipeline/scripts/round-5o-verify-clean-upload-r2.mjs --category st-patricks-day --public-base-url https://assets.ilovecoloringpage.com/coloring-pages`
