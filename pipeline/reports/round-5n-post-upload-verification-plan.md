# Round 5N Post-Upload Verification Plan

- Included records: 6352
- Deferred manual-review records: 205
- Recommended URL verification sample size: 300
- App runtime switch deferred: true

Checks:

- Verify SVG HTTP 200 and image/svg+xml content type.
- Verify WebP HTTP 200 and image/webp content type.
- Verify CORS with https://www.ilovecoloringpage.com, http://localhost:3005, and http://127.0.0.1:3005.
- Verify Cache-Control and ETag or equivalent validation headers.
- Verify browser gallery rendering from custom asset domain.
- Verify SVG-to-canvas conversion, Print, and PNG/JPG/WebP downloads.
- Verify no broken images.
- Do not expect deferred manual-review records to resolve yet.
- Do not switch app runtime paths until all public checks pass.
