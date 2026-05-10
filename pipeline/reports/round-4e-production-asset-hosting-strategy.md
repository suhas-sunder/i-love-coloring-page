# Round 4E Production Asset Hosting Strategy

Generated: 2026-05-10

## Recommendation

Use object storage behind a CDN for generated coloring media.

Do not commit thousands of generated media files to the app repo. Do not use the Next.js API route as the production media server for this asset set. Do not use `public/` as the long-term strategy unless a later prompt approves a temporary experiment.

## Comparison

| Strategy | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Object storage + CDN | Small repo, strong caching, portable deployment, clean public URLs | Requires upload/sync step and URL verification | Recommended |
| Copy assets into `public/` | Simple paths | Bloats repo and build context, mixes generated media with source | Not recommended |
| Next.js API route | Useful local proxy | Adds runtime file-serving load and weaker production caching | Development only |
| VPS filesystem | Direct control | Coupled deploys, manual backup and cache work | Not recommended as default |

## Cache And Versioning

- Prefer a versioned CDN base URL or object prefix for each released asset set.
- Use immutable caching only when files are never replaced at the same URL.
- If files may be replaced in place, use the conservative cache policy from the Round 4E cache manifest.

## Backup And Rebuild

- The source images remain immutable and ignored.
- Production assets can be regenerated from the approved manifests and production export scripts.
- The publish manifest records hashes and sizes for upload verification.

## Future SEO Impact

JSON-LD, Open Graph image decisions, and any image sitemap should wait until the CDN base URL is stable and representative public URLs are verified.
