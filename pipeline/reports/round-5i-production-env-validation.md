# Round 5I Production Env Validation

- NEXT_PUBLIC_SITE_URL configured: false
- Site URL: missing
- Site HTTPS: false
- Site not localhost: true
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL configured: true
- Asset base URL: http://127.0.0.1:4175/coloring-pages
- Asset base HTTPS: false
- Asset base includes /coloring-pages: true
- Asset base not r2.dev: true
- Asset base not private R2/S3 endpoint: true
- No public env credentials: true
- Production asset domain ready: false

## Blockers

- NEXT_PUBLIC_SITE_URL is not configured.
- NEXT_PUBLIC_SITE_URL is not a valid URL.
- NEXT_PUBLIC_SITE_URL must be HTTPS for production-like verification.
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL must be HTTPS.
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not be localhost or loopback.
