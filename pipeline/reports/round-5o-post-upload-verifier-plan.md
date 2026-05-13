# Round 5O Post-Upload Verifier Plan

- Public base URL: https://assets.ilovecoloringpage.com/coloring-pages
- Full verification count: 12704
- Recommended sample size: 300
- Expected SVG content type: image/svg+xml
- Expected WebP content type: image/webp
- Expected cache control: public, max-age=31536000, immutable

Run after owner upload:

`node pipeline/scripts/round-5o-verify-clean-upload-r2.mjs --full --public-base-url https://assets.ilovecoloringpage.com/coloring-pages`
