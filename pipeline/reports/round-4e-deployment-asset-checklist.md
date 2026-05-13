# Round 4E Deployment Asset Checklist

Generated: 2026-05-10

## Generate Assets

```powershell
node pipeline\scripts\round-3c-production-export.mjs --batch-size 250 --resume
node pipeline\scripts\round-4b-build-next-gallery-data.mjs
node pipeline\scripts\round-4e-build-asset-publish-manifest.mjs
```

## Upload Later

- Use `pipeline/manifests/round-4e-asset-publish-manifest.json` as the upload input.
- Upload only files with `status: ready`.
- Preserve each `cdnRelativePath` under the configured bucket or CDN prefix.
- Do not upload quarantined assets.
- Do not copy production assets into `public/`.

## Configure App

- Set `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` to the public CDN or object-storage base URL.
- Prefer a versioned base URL or prefix for immutable caching.
- Keep `NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY=0` in production.
- Keep `COLORING_ENABLE_LOCAL_ASSET_PROXY=0` in production.

## Verify

- Confirm total publish files: 19671.
- Confirm total publish bytes: 3148598669.
- Spot check SVG, PNG preview, and thumbnail public URLs.
- Run the local proxy preview only with the explicit development toggles.
- Confirm `public/` does not contain copied production asset folders.
- Confirm generated client data has no Windows paths, source image paths, or local production paths.
- Test Download PNG, Download SVG, and Print with a configured asset base URL.

## Before SEO Image Work

- Verify stable public media URLs.
- Confirm content types and cache headers from the public origin.
- Decide Open Graph image policy.
- Decide whether an image sitemap is useful and safe.
