# Round 4N Browser Download Format Plan

Round 4N implements only the public download format that is already backed by generated media: PNG.

Deferred formats: JPG, JPEG, WebP.

Future browser-side conversion should use the PNG preview as the source image, draw it to a browser canvas, and only expose JPG/JPEG/WebP controls when conversion succeeds without CORS or browser-support failures. SVG is kept as internal infrastructure only and is not a public download format.
