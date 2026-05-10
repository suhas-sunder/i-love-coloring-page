# Round 4C Current UI Audit

Generated: 2026-05-10

## Scope

This audit covers the public Next.js gallery shell and public gallery components as they existed at the start of Round 4C on `version-3`.

Reviewed files:

- `app/globals.css`
- `app/layout.tsx`
- `app/page.tsx`
- `app/coloring-pages/page.tsx`
- `app/coloring-pages/[hubSlug]/page.tsx`
- `src/components/coloring/AssetImage.tsx`
- `src/components/coloring/FilterChips.tsx`
- `src/components/coloring/GalleryGrid.tsx`
- `src/components/coloring/HubCard.tsx`
- `src/components/coloring/HubHero.tsx`
- `src/components/coloring/ImageCard.tsx`
- `src/components/coloring/Pagination.tsx`
- `src/components/coloring/RelatedHubs.tsx`
- `src/components/ui/Button.tsx`
- `src/lib/coloring/assets.ts`
- `src/lib/coloring/data.ts`
- `src/lib/coloring/types.ts`

## Findings

### Colors

The current palette is a cool blue system defined in `app/globals.css`: `#f7fbff`, `#ffffff`, `#eef7ff`, `#132033`, `#5b6a7f`, `#d9e6f2`, `#0e7490`, `#075985`, `#2f7d5b`, and `#d95f45`. It does not match the approved Indigo Paper palette. The naming also bakes visual tone into implementation names such as `--sky`, `--sky-strong`, `--leaf`, and `--coral`, which encourages future one-off styling drift.

### Typography

The root body uses `Arial, Helvetica, sans-serif`. There is no `next/font/google` setup, no Figtree primary font, and no Fraunces display option. Headings use large clamp values but are not governed by a reusable type scale. Component text sizes are scattered in selectors such as `.hero-copy p`, `.hero-stats span`, `.image-card-body h3`, `.mini-button`, and `.filter-chip`.

### Spacing

Spacing is functional but not tokenized. Values such as `42px`, `52px`, `36px`, `28px`, `18px`, `14px`, and `22px` appear directly in `app/globals.css`. These do not map cleanly to the locked 4px spacing system and make page rhythm harder to govern.

### Cards And Layout Surfaces

The current UI relies heavily on bordered, shadowed, rounded cards:

- `.hub-hero` is a large bordered and shadowed card with a gradient background.
- `.hub-card` uses border, background, box-shadow, hover border changes, and transform.
- `.image-card` uses border, background, and shadow.
- `.empty-state` is a bordered card.
- Hero previews are rendered as `.image-card` elements inside the hero surface, creating a nested-card feel.

This makes the site feel like a generic SaaS template rather than a curated image library.

### Buttons And Controls

Buttons are centralized by CSS class, but only `primary`, `secondary`, `ghost`, and disabled are available. The approved `subtle` variant is missing. The shared `Button.tsx` component is not used consistently by pages and gallery actions. Small action buttons use a separate `.mini-button` style instead of the governed button family.

### Gallery Density

The gallery uses a stable grid and existing pagination, which is correct. The visual density is still too card-heavy because each image has a bordered and shadowed container. The image itself should be the visual focus, with a clean preview canvas and text/actions below.

### Mobile Layout Risks

The existing mobile breakpoints collapse major grids correctly, but the header can become a stacked full-width button area. Large `h1.sky-heading` values can dominate small screens. Button and chip wrapping is functional, but the design does not yet reserve a clear mobile rhythm for editorial sections.

### Shadows, Borders, Outlines, Backgrounds

Current CSS uses:

- `linear-gradient` in `.hub-hero`
- large shadows in `--shadow`, `.hub-card`, and `.image-card`
- borders on the sticky header, hero, cards, section list rows, buttons, chips, image cards, and empty state
- backdrop blur on the header
- background colors on many surfaces

Round 4C rules prohibit gradients, decorative outlines, resting-state borders on layout surfaces, glassmorphism, noisy backgrounds, and shadows outside buttons.

### Focus Visibility

Several interactive styles include `:focus-visible`, but the current treatment often depends on the same hover transform or border color. The new system needs a visible and consistent `:focus-visible` outline for all interactive controls. Focus must not be hidden.

### Hardcoded Style Values

Most visual values are currently hardcoded in `app/globals.css`. There are no split token/base/component/layout style files. Component files mostly use classes, which is good, but the CSS class system is not governed by locked tokens.

### Template-Like Signals

The strongest template-like signals are:

- blue gradient hero panel
- all-purpose card grid for hubs
- card wrappers around image tiles
- large box shadows
- sticky translucent header with blur
- generic pill stats
- repeated section pattern with the same card rhythm
- typography that defaults to Arial rather than a curated editorial system

## Required Changes

- Replace the color system with Indigo Paper tokens.
- Configure Figtree and Fraunces with `next/font/google`.
- Split CSS into token, base, layout, and component layers.
- Remove gradients, glass effects, layout borders, and non-button shadows.
- Refactor hub and image cards so artwork and editorial hierarchy carry the design.
- Add governed button variants: `primary`, `secondary`, `ghost`, `subtle`, and disabled.
- Replace mini button drift with the central button family.
- Preserve the existing data flow, asset resolver, local proxy behavior, Phase 1 routes, sitemap behavior, and no per-image route policy.
