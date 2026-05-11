# Round 5A R2 CORS Configuration Guide

- Official Cloudflare R2 CORS docs: https://developers.cloudflare.com/r2/buckets/cors/
- Official Cloudflare R2 CORS API reference: https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/cors/
- Allowed origins: http://localhost:3005, http://127.0.0.1:3005
- Allowed methods: GET, HEAD
- Allowed headers: Origin, Range
- Expose headers: Content-Type, Content-Length, Cache-Control, ETag
- Max age seconds: 3600
- Access-Control-Allow-Origin must be returned for browser requests from the local preview origin and final production origin.
- SVG and PNG both need CORS because canvas export must stay origin-clean.
- No credentials are needed for public static image reads.
- Full asset upload remains final-stage.
- Example policy:
```json
- [
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
