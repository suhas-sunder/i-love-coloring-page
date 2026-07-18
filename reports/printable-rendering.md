# Printable rendering and asset audit

All 6,352 runtime printable records were joined to their clean WebP and SVG object keys and validated locally.

## Verified baseline defect

Before this repair, every principal printable used a 341×512 WebP while declaring the source dimensions (1024×1536). CSS permitted an 800-pixel-wide rendering, causing all 6,352 previews to upscale. Fantasy Abyss Wyrm reproduced the defect in production: 341×512 natural pixels rendered at roughly 793×1,189 CSS pixels.

## Foundation implemented

- Principal preview dimensions now use the physical WebP dimensions.
- CSS caps the preview at its intrinsic width.
- The server-rendered `img` carries the same non-empty alt text, source, width, and height used after hydration.
- Typed helpers distinguish grid/card WebP, internal full-resolution SVG, print composition, and browser-generated downloads.
- Missing or invalid full-resolution assets: 0.
- Current preview-dimension mismatches: 0.

SVG remains internal and is never offered as a public download format. PNG/JPEG/WebP downloads remain verified browser-generated formats sourced from the internal SVG.
