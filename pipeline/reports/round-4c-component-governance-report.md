# Round 4C Component Governance Report

Generated: 2026-05-10

## Governed Components

Round 4C governs these public gallery components:

- `Button`
- `HubHero`
- `HubCard`
- `ImageCard`
- `GalleryGrid`
- `FilterChips`
- `Pagination`
- `RelatedHubs`
- `AssetImage`

## Button Family

Approved variants:

- `primary`
- `secondary`
- `ghost`
- `subtle`
- `disabled`

Buttons and button-like anchors must use native interactive elements, `cursor: pointer`, consistent spacing, consistent radius, clear hover states, and visible `:focus-visible` states. Disabled controls must not look interactive.

## Gallery Items

Image tiles should not look like generic SaaS cards. A single preview canvas is allowed, followed by clear text and actions below. Do not place a card inside another card. Gallery actions must use the governed button family rather than one-off mini button styles.

## Hub Navigation

Hub promos should feel like editorial navigation. They may use open space, text hierarchy, counts, and hover movement. They should not become a wall of bordered boxes.

## Related Hubs

Related hubs should behave as curated next steps. Use lightweight editorial rows or open-grid links rather than another boxed card wall.

## Filters And Chips

Filter chips should be simple, readable, and restrained. They need hover and focus-visible states, but they should not rely on decorative borders or bright competing accents.

## Asset Media

`AssetImage` must continue to use `resolveColoringAssetUrl`. Placeholders must look intentional and must not expose local filesystem paths. Layout should reserve media dimensions to avoid layout shift.

## Page Additions

Any future public page must document:

- page type
- indexability status
- metadata strategy
- component variants used
- whether it belongs to the public gallery shell or a separate future workspace shell
