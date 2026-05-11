# Round 4Z Browser Conversion QA Report

- Base URL: http://127.0.0.1:3005
- Asset base URL: http://127.0.0.1:4176/coloring-pages
- Internal SVG loads with CORS server: true
- Canvas tainted with CORS server: false
- PNG blob export succeeded: true
- JPEG blob export succeeded: true
- WebP blob export succeeded: true
- Print flow uses generated output: true
- Fallback documented: true

Samples:
- animals-alligator: 1600x2400, image/png, image/jpeg, image/webp
- geometric-mandala: 1600x2400, image/png, image/jpeg, image/webp
- anime-girl: 1600x2400, image/png, image/jpeg, image/webp
- christmas: 1600x2400, image/png, image/jpeg, image/webp
- high-detail-mandala: 1600x2400, image/png, image/jpeg, image/webp

Print screenshot: pipeline/review/round-4z/screenshots/print/animals-print-flow.png
