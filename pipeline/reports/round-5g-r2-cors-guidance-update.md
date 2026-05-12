# Round 5G R2 CORS Guidance Update

- Public base type: r2.dev
- Origin-aware checks passed: true
- SVG CORS passed: true
- SVG internal only: true
- WebP public gallery preview: true
- r2.dev temporary only: true
- Custom domain preferred: true
- Expected SVG content type: image/svg+xml
- Expected WebP content type: image/webp
- Cache purge may be needed: false
- Verification command: `node pipeline/scripts/round-5g-verify-svg-webp-public-cors.mjs --public-base-url https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring-pages --origin http://localhost:3005`

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

- None

## Do Not Expose

- SVG remains internal-only and must not be shown as a visible download option.
