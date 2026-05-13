# Round 4C Visual QA Checklist

Generated: 2026-05-10

## Routes To Check

Primary routes:

- `/`
- `/coloring-pages`

Representative hub routes:

- `/coloring-pages/plushies`
- `/coloring-pages/animals`
- `/coloring-pages/mandalas`
- `/coloring-pages/anime-girls`
- `/coloring-pages/chibi`
- `/coloring-pages/fantasy`
- `/coloring-pages/christmas`
- `/coloring-pages/halloween`
- `/coloring-pages/dinosaurs`
- `/coloring-pages/prehistoric-animals`
- `/coloring-pages/plants`
- `/coloring-pages/indoor-plants`

## Desktop Checklist

- Header is minimal, readable, and aligned.
- Footer uses the dark public-gallery footer and remains readable.
- H1 is clear and uses ink by default.
- Body text is readable and stays within a comfortable measure.
- Section spacing feels breathable, with desktop section padding in the 64px to 96px range.
- Page gutter and max width keep content between 1200px and 1280px on wide screens.
- Hero preview images or placeholders reserve stable space.
- Hub links feel like editorial navigation, not generic bordered cards.
- Gallery uses a stable grid rhythm, not masonry.
- Large hubs show paginated or limited page results, not thousands of cards.
- Buttons use only approved variants: primary, secondary, ghost, subtle, disabled.
- Button hover states are visible.
- Keyboard `:focus-visible` treatment is visible on links, buttons, chips, pagination, and gallery actions.
- No gradients are visible.
- No nested cards are visible.
- No decorative outlines or resting-state borders on layout surfaces are visible.
- No shadows are visible outside buttons.

## Mobile Checklist

- Header stacks cleanly without text overlap.
- Hero title, intro, facts, and preview grid fit without horizontal scrolling.
- Mobile section padding stays in the 32px to 48px range.
- Hub links and related hub links stack cleanly.
- Gallery cards become one column with stable image canvases.
- Buttons and download actions wrap without overflow.
- Pagination stacks with real anchors where previous or next pages exist.
- Breadcrumb text wraps cleanly on hub pages.
- Footer content stacks cleanly.
- Focus-visible treatment remains visible on mobile-sized viewport testing.

## Asset States

When local proxy or CDN asset source is disabled:

- Image placeholders look intentional and do not expose local filesystem paths.
- Placeholder text is readable and contained.
- Gallery actions show an appropriate disabled state when no asset URL is available.

When local proxy is enabled:

- Thumbnail or PNG preview assets render inside the reserved image canvas.
- Images use `object-fit: contain` and are not cropped.
- Download SVG, Download PNG, and Print actions appear only when URLs resolve.
- Image loading does not cause major layout shift.

## Route-Specific Notes

`/`:

- Must be a usable entry into the public library, not a marketing-only homepage.
- Must show real major hub entry points.

`/coloring-pages`:

- Must include a polished hero, concise H1, direct SVG and PNG explanation, featured hubs, subject/style/seasonal browsing, and a limited preview grid.
- Must not become a giant asset dump or spammy SEO block.

Hub pages:

- Must include breadcrumb, clear H1, concise intro, asset count, featured previews when available, paginated gallery, related hubs, and concise utility copy only when useful.
- Must not create or link to indexable per-image pages.
