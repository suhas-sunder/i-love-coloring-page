# Round 4P Browser Ad QA Report

Status: completed

Local preview used:
- App: `http://localhost:3005`
- Media: `http://127.0.0.1:4175/coloring-pages`
- The historical enabled pass used a local placeholder switch that has since been removed.

Pages inspected:
- `/`
- `/coloring-pages`
- `/coloring-pages/animals`
- `/coloring-pages/geometric`
- `/coloring-pages/anime-girls`
- `/coloring-pages/mandalas`
- `/coloring-pages/chibi`
- `/coloring-pages/fantasy`
- `/coloring-pages/christmas`
- `/coloring-pages/halloween`
- `/coloring-pages/plushies`

Viewport coverage:
- In-app browser desktop viewport
- Wide desktop at 1600 x 1000
- Tablet at 820 x 1180
- Mobile at 390 x 844

Results:
- Placeholders were hidden when the env flag was off.
- Placeholders were visible when the env flag was on.
- Real media rendered with the local media server.
- Search and filters worked.
- More menu search worked.
- Mobile navigation source is present.
- Print remained available.
- Download PNG remained available.
- No visible SVG, JPG, JPEG, or WebP download option appeared.
- No app API route was needed.
- No ad appeared inside navigation, image cards, gallery grids, or Print/Download rows.
- The wide desktop rail appeared outside the main content column.
- Mobile did not show a top ad before the hero and artwork.
- No horizontal overflow, layout collapse, or obvious policy issue was found.

Screenshots were saved locally and are intentionally not committed:
- `pipeline/review/round-4p/screenshots/ad-placeholders-off/`
- `pipeline/review/round-4p/screenshots/ad-placeholders-on/`
- `pipeline/review/round-4p/screenshots/ad-placeholders-on/viewports/`

No visual micro-fix was required.
