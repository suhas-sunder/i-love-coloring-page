# Round 4O Next Phase Plan

Round 4P should configure and verify production asset-host CORS before exposing any browser-side JPG/JPEG/WebP options.

Recommended next steps:
1. Configure the Cloudflare R2 bucket or custom asset domain to allow GET/HEAD CORS requests from the production app origin and local preview origin.
2. Purge or refresh cached assets after changing the CORS policy.
3. Use the existing PNG-preview conversion utility to test real browser canvas export for JPG and WebP.
4. Add the compact Download menu only after JPG/WebP exports succeed in browser QA.

Keep SVG internal only. Do not add app/api routes or backend image conversion for this public gallery.
