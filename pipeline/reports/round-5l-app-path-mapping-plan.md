# Round 5L App Path Mapping Plan

- App runtime paths changed: false
- Clean upload bundle exists: false
- Safe to switch runtime now: false
- Final map records: 6557
- Image sitemap deferred: true
- Open Graph images deferred: true

## Current State

- Current app runtime paths continue to use the existing generated item data.
- Round 5L does not change app pages, asset resolver, download behavior, print behavior, metadata, or generated runtime asset paths.
- The clean object-key map is a future upload source of truth only.

## Migration Steps

1. Generate clean key map.
2. Generate clean SVG plus WebP upload bundle from existing local media without renaming source files.
3. Upload clean bundle after explicit approval.
4. Verify clean public URLs, content types, CORS, and cache headers.
5. Switch app generated data to clean public keys only after files exist in R2.
6. Rebuild static site.
7. Run browser QA for WebP gallery rendering, SVG conversion, Print, and PNG/JPG/WebP downloads.
8. Then consider image sitemap and Open Graph images.

## Blockers

- Do not point the app at clean keys until the matching clean files exist on the custom asset domain.
