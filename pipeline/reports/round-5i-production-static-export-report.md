# Round 5I Production Static Export Report

- Status: not_run
- Build command: npm run build
- Build exit code: null
- Static export works: false
- Localhost leakage present: null
- r2.dev leakage present: null
- Private R2 endpoint leakage present: null
- Source file path leakage present: null
- Old test prefix present: false
- Duplicate coloring-pages prefix present: false
- Download SVG labels or links present: false
- app/api route references present: false
- Live AdSense code present: false
- Bad canonical URLs present: null
- Bad sitemap URLs present: null

## Blockers

- Production-like static export was not run because production-like env validation failed.
- NEXT_PUBLIC_SITE_URL is not configured.
- NEXT_PUBLIC_SITE_URL is not a valid URL.
- NEXT_PUBLIC_SITE_URL must be HTTPS for production-like verification.
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL must be HTTPS.
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not be localhost or loopback.
