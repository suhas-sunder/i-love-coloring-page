# Round 5C R2 CORS and Content-Type Guide

- Cloudflare R2 CORS docs: https://developers.cloudflare.com/r2/buckets/cors/
- SVG content type: `image/svg+xml`
- WebP content type: `image/webp`
- SVG CORS: required for internal SVG-to-canvas conversion and future online coloring reads
- WebP CORS: not required for normal image display, but recommended if future canvas flows use WebP
- Allowed origins: http://localhost:3005, http://127.0.0.1:3005, final production site origin
- Allowed methods: GET, HEAD
- Allowed headers: Origin, Range
- Exposed headers: Content-Type, Content-Length, Cache-Control, ETag
- Max age seconds: 3600

Example policy:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3005",
      "http://127.0.0.1:3005",
      "https://YOUR-SITE-DOMAIN.com"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Origin",
      "Range"
    ],
    "ExposeHeaders": [
      "Content-Type",
      "Content-Length",
      "Cache-Control",
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```
