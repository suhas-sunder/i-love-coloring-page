# Round 5I Custom Domain CORS Report

- Status: not_run
- Origins checked: http://localhost:3005, http://127.0.0.1:3005
- Origin request count: 0
- GET OK count: 0
- HEAD OK count: 0
- CORS OK count: 0
- SVG CORS passed: false
- Browser CORS failure expected: true

## Blockers

- Custom-domain SVG CORS verification was not run because production-like env validation failed.
- NEXT_PUBLIC_SITE_URL is not configured.
- NEXT_PUBLIC_SITE_URL is not a valid URL.
- NEXT_PUBLIC_SITE_URL must be HTTPS for production-like verification.
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL must be HTTPS.
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not be localhost or loopback.

## Required Fix

- Configure NEXT_PUBLIC_SITE_URL and NEXT_PUBLIC_COLORING_ASSET_BASE_URL with final HTTPS custom domains, then rerun Round 5I.
