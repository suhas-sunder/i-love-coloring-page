# Round 5F R2 CORS And Content-Type Update

- Public base type: r2.dev
- SVG CORS passed: false
- SVG internal only: true
- WebP public gallery preview: true
- Expected SVG content type: image/svg+xml
- Expected WebP content type: image/webp
- Verification command: `node pipeline/scripts/round-5f-verify-svg-webp-public-urls.mjs --public-base-url https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring-pages`

## Recommended CORS JSON

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3005",
      "http://127.0.0.1:3005"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "Content-Type",
      "Cache-Control",
      "Content-Length"
    ],
    "MaxAgeSeconds": 86400
  }
]
```

## Required Corrections

- Set Access-Control-Allow-Origin for the production origin and local preview origin, or use wildcard for public static assets.

## Do Not Expose

- SVG remains internal-only and must not be shown as a visible download option.
