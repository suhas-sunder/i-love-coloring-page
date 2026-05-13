# Round 4O Download Format Decision

Decision: defer public JPG/JPEG/WebP controls.

- Implemented JPG/WebP now: false
- Deferred JPG/WebP: true
- SVG internal only: true
- Public formats now: PNG
- Requires CORS before UI exposure: true

Reason: No currently configured test asset source returned CORS headers that allow the app origin, so canvas export cannot be verified safely.
