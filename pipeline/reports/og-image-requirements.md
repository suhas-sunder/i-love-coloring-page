# OG Image Requirements

Generated: 2026-05-14T03:37:23.355Z

- Dimensions: 1200 x 630
- Output format: JPG
- Metadata tags: og:title, og:description, og:url, og:type, og:image, og:image:width, og:image:height, og:image:alt, twitter:card, twitter:title, twitter:description, twitter:image
- Static generation required: true
- SVG social images excluded: true
- Per-image pages created: false

## Sources

- [Open Graph protocol](https://ogp.me/) - Use route title, type, URL, and image fields. Width, height, and alt text are structured image properties.
- [X Summary Card with Large Image](https://developer.x.com/cards/types/summary-large-image) - Use twitter:card summary_large_image and a route-specific image. SVG is not used for broad card compatibility.
- [Pinterest Rich Pins overview](https://developers.pinterest.com/docs/web-features/rich-pins-overview/) - Pinterest supports page metadata through Open Graph or Schema.org. This round uses Open Graph only and keeps JSON-LD deferred.
- [Next.js Metadata and OG images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) - Next metadata exports generate head tags at build time for prerendered static routes. Dynamic ImageResponse routes are avoided for static export.

## Decisions

- Generate 1200 x 630 JPG files to keep files broadly compatible and reasonably small.
- Use static files under public/og so the exported site can serve them without app/api or server runtime.
- Use WebP preview artwork as source material, but never reference SVG source URLs as social images.
- Create route-level OG images only: homepage, gallery landing, and public hub routes. No per-image social pages are created.
