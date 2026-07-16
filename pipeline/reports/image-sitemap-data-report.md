# Canonical Printable Image Sitemap Data

Each runtime printable uses its frozen canonicalPath as the HTML page location and its centralized runtime WebP path as the sole image location.

| Metric | Value |
| --- | --- |
| Runtime printables | 6352 |
| Frozen printable routes | 6352 |
| Deferred records excluded | 205 |
| Canonical page/image pairs | 6352 |
| Unique page URLs | 6352 |
| Unique WebP URLs | 6352 |
| Invalid entries | 0 |

## Generator contract

- Inputs: `src/generated/coloring/runtime-printables.json`, `pipeline/manifests/runtime-printable-route-manifest.json`, `src/generated/coloring/runtime-deferred-items.json`
- Outputs: `pipeline/manifests/image-sitemap-data.json`, `pipeline/reports/image-sitemap-data-report.md`, `public/image-sitemap.xml`
- Ordering: canonicalPath ascending, then assetId ascending
- Image title source: runtime-printables.records.displayTitle

SVG, PNG, thumbnails, deferred records, hub page locations, local URLs, private storage endpoints, and r2.dev URLs are excluded.
