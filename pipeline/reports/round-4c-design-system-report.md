# Round 4C Design System Report

Generated: 2026-05-10

## Locked System

Round 4C locks the public gallery visual foundation as "Indigo Paper." The system is light, calm, image-first, editorial, and structured. It is intended for public coloring-page browsing only.

The future online coloring workspace may eventually use a separate darker, more focused shell. That workspace is not part of Round 4C and must not alter the public gallery shell.

## Color Tokens

The approved tokens are:

- canvas: `#FBFAF7`
- surface: `#F2EEE8`
- surfaceStrong: `#E8E1D6`
- ink: `#1B1F3B`
- text: `#39415B`
- textMuted: `#626779`
- primary: `#4F46E5`
- secondary: `#B94728`
- accent: `#0B7A61`
- success: `#18794E`
- warning: `#8A5500`
- danger: `#B42318`
- info: `#155EEF`
- focus: `#1B1F3B`
- buttonTextOnColor: `#FFFFFF`

Neutral colors carry the interface. Primary handles main CTAs, selected states, important links, and active chips. Secondary and accent are used with restraint. Headings use ink by default.

## Typography

Figtree is the primary UI, body, nav, and button font. Fraunces is available as a sparing editorial accent. Both fonts must be loaded through `next/font/google`; runtime font links and Google CSS imports are not allowed.

The locked type scale is documented in `pipeline/manifests/round-4c-typography.json` and implemented through CSS custom properties.

## Spacing And Radii

The spacing system uses a 4px base with these primary steps:

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128`

The radius scale is:

- sm: `10px`
- md: `14px`
- lg: `20px`
- xl: `28px`
- pill: `999px`

## Layout Rules

- Mobile page gutters should stay between 20px and 24px.
- Desktop content max width should stay between 1200px and 1280px.
- Paragraphs should stay readable at 60ch to 72ch.
- Mobile section padding should stay between 32px and 48px.
- Desktop section padding should stay between 64px and 96px.
- Gallery grids should use stable rhythm and pagination or limited rendering for large hubs.

## Visual Restrictions

The following are forbidden in the public gallery shell:

- gradients
- decorative outlines
- resting-state borders on layout surfaces
- shadows outside buttons
- glassmorphism
- noisy backgrounds
- random decorative blobs
- nested cards
- unnecessary background colors

Visible `:focus-visible` treatment is mandatory and is the only outline or ring exception.
