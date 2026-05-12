# Round 5J Production Env Validation

- NEXT_PUBLIC_SITE_URL configured: false
- NEXT_PUBLIC_SITE_URL value: missing
- NEXT_PUBLIC_SITE_URL source: missing
- NEXT_PUBLIC_SITE_URL matches expected: false
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL configured: true
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL value: http://127.0.0.1:4175/coloring-pages
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL source: .env.local
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL matches expected: false
- NEXT_PUBLIC_CONTACT_EMAIL configured: false
- NEXT_PUBLIC_CONTACT_EMAIL value: missing
- NEXT_PUBLIC_CONTACT_EMAIL source: missing
- NEXT_PUBLIC_CONTACT_EMAIL matches expected: false
- Asset base is HTTPS: false
- Asset base includes /coloring-pages: true
- Asset base not r2.dev: true
- Asset base not private R2 endpoint: true
- No public env credentials: true
- Production env ready: false

## Blockers

- NEXT_PUBLIC_SITE_URL is not configured in process env, .env, or .env.local.
- NEXT_PUBLIC_SITE_URL does not match https://www.ilovecoloringpage.com.
- NEXT_PUBLIC_SITE_URL is not a valid URL.
- NEXT_PUBLIC_SITE_URL must be HTTPS.
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL does not match https://assets.ilovecoloringpage.com/coloring-pages.
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL must be HTTPS.
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not be localhost or loopback.
- NEXT_PUBLIC_CONTACT_EMAIL is not configured in process env, .env, or .env.local.
- NEXT_PUBLIC_CONTACT_EMAIL does not match admin@ilovecoloringpage.com.
