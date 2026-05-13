# Round 3C Next.js Data Contract

Generated: 2026-05-09

## Files To Consume

- `pipeline/manifests/round-3c-production-gallery-data.json`
- `pipeline/manifests/round-3c-production-category-data.json`
- `pipeline/manifests/round-3c-production-assets.json`

## Category List Shape

```json
{
  "category": "string",
  "categorySlug": "string",
  "categoryTitle": "string",
  "categoryDescriptionCandidate": "string",
  "imageCount": "number",
  "assetIds": "string[]",
  "sampleAssetIds": "string[]",
  "likelyPublicHubCandidate": "boolean"
}
```

## Gallery Item Shape

```json
{
  "assetId": "string",
  "sourceRelativePath": "string internal traceability field",
  "assetPaths": {
    "svg": "string",
    "pngPreview": "string",
    "thumbnail": "string"
  },
  "altTextCandidate": "string",
  "titleCandidate": "string",
  "downloadAvailable": "boolean",
  "printAvailable": "boolean",
  "indexablePerImageRoute": "false",
  "warningFlags": "string[] internal field"
}
```

## SEO Hub/Page Fields

```json
{
  "route": "/coloring-pages/[categorySlug]",
  "title": "categoryTitle + coloring pages",
  "description": "categoryDescriptionCandidate",
  "noPerImageRoutes": true
}
```

## Rules

- Category and gallery pages may be indexable.
- Individual image pages must not be indexable pages.
- The website should consume metadata/data files instead of importing thousands of image files directly into React components.
- Warning fields are internal review metadata.
