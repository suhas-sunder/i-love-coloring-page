# Round 4I Next Phase Plan

Generated: 2026-05-10

## Round 4J Recommendation

Round 4J should manually upload the prepared full bundle or explicitly approve a scripted upload, then verify a representative public URL sample from `pipeline/manifests/round-4i-full-r2-url-verification-plan.json`.

Do not begin image sitemap, Open Graph image, or JSON-LD image work until the full uploaded media set is verified against public URLs and cache behavior is confirmed.

Production should use a custom asset domain with:

```bash
NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://YOUR-ASSET-DOMAIN.com/coloring-pages
```

Generated filenames were preserved in this round. Any naming cleanup should be a separate future round.
