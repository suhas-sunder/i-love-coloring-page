# Round 4O Browser Download Format Research

Sources reviewed:
- MDN, Use cross-origin images in a canvas: https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image
- MDN, HTMLImageElement.crossOrigin: https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/crossOrigin
- MDN, HTMLCanvasElement.toBlob: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- Cloudflare R2, Configure CORS: https://developers.cloudflare.com/r2/buckets/cors/

Findings:
- Canvas export from a cross-origin PNG requires the asset host to allow the app origin with CORS headers.
- Browser image loading must set `crossOrigin = "anonymous"` before assigning the PNG URL.
- `HTMLCanvasElement.toBlob()` always has PNG as the baseline export, while JPEG and WebP support depends on the browser.
- `toBlob()` can return null or throw when the canvas is not origin-clean.
- Cloudflare R2 custom domains return CORS response headers only when a bucket CORS policy is configured and the request includes a valid Origin header.
- SVG remains internal only and is not a public download input or output in this round.
