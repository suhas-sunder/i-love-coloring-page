# Round 5C Next Phase Plan

Round 5D should use the 30-record SVG plus WebP test bundle for manual R2 upload and public URL verification.

Recommended Round 5D sequence:

- Upload only the 30-record SVG plus WebP test bundle.
- Verify `image/svg+xml` and `image/webp` content types.
- Verify CORS on SVG from the local preview origin and final site origin when known.
- Build the static app with the public test asset base.
- Confirm selected WebP gallery previews render from the public asset base.
- Confirm SVG-to-canvas conversion works against public SVG URLs before exposing JPG/JPEG/WebP controls.

Keep full media upload, image sitemap, Open Graph images, live AdSense, and backend routes out of scope until public assets are final.
