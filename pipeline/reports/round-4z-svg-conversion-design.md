# Round 4Z SVG Conversion Design

- Internal SVG source: The gallery resolver keeps the SVG URL as internal action data and passes it to the browser conversion helper without rendering a public SVG download link.
- Canvas conversion: The browser loads the SVG with crossOrigin=anonymous, draws it to a white canvas at a print-safe long edge, and exports PNG, JPEG, or WebP blobs through toBlob.
- Print flow: Print opens a blank window synchronously, prepares the high-quality PNG from SVG, writes a print document using the generated blob URL, and falls back to the PNG preview with a visible status message if conversion fails.
- Error handling: Conversion returns structured failure reasons for missing assets, browser API gaps, image loading failures, tainted canvases, unsupported MIME types, and popup blockers.
- CORS: Canvas export only works when the final asset host allows the app origin for GET and HEAD on SVG and PNG media.
