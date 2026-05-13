# Round 4G Next Phase Plan

Generated: 2026-05-10

## Before Full Upload

Verify the 30-record R2 test path first:

- R2 custom domain resolves public media URLs
- SVG, PNG preview, and thumbnail content types are correct
- cache headers match the selected policy
- Netlify/static build renders uploaded previews
- download and print controls use public CDN URLs
- no duplicate `coloring/test-v1` prefix exists
- no app API media route is needed

## Round 4H Recommendation

Round 4H should promote the verified R2 object-key pattern from the 30-record test bundle to a full upload plan, but only after explicit approval. It should generate the full upload manifest from `pipeline/manifests/round-4e-asset-publish-manifest.json`, preserve warning metadata, avoid quarantined assets, and run URL sampling before any SEO image sitemap, Open Graph image, or JSON-LD image work starts.
