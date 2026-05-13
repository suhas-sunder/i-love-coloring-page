# Round 5I Browser Custom Domain QA Report

- Status: not_run
- Pages inspected: 0
- WebP preview renders: false
- Non-uploaded items fall back gracefully: false
- No broken image icons: null
- Local media server required: false
- Internal SVG loads: false
- Browser canvas export passed: false
- PNG download works: false
- JPG download works: false
- WebP download works: false
- Print works: false
- Print uses generated output: false
- SVG download absent: true
- Ad density matches Round 4U: true
- Horizontal overflow detected: null
- app/api present: false
- Screenshots: 0


## Blockers

- Custom-domain env, URL, or SVG CORS checks are not ready, so browser QA was not run.
- NEXT_PUBLIC_SITE_URL is not configured.
- NEXT_PUBLIC_SITE_URL is not a valid URL.
- NEXT_PUBLIC_SITE_URL must be HTTPS for production-like verification.
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL must be HTTPS.
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not be localhost or loopback.
- Custom-domain URL verification was not run because production-like env validation failed.
- Custom-domain SVG CORS verification was not run because production-like env validation failed.
