# Round 4P Ad Placeholder Inventory

- Placeholder components: src/components/ads/AdSlot.tsx, src/components/ads/AdRail.tsx
- Config files: src/lib/ads/config.ts, src/lib/ads/types.ts
- Current code slot definitions: 7
- Round 4M planned slot count: 8
- Hidden by default: true
- Historical local placeholder switch: removed
- Label text: Advertisement
- Live ad code present: false
- Publisher or client IDs present: false
- Hidden in print styles: true
- Desktop side rail behavior: visible only at the wide desktop media query when placeholders are enabled, non-sticky, outside the page column
- Tablet behavior: inline placeholders appear only when enabled; side rail stays hidden
- Mobile behavior: inline placeholders appear only when enabled; no mobile top ad; side rail stays hidden

Route placements:
- /: global-desktop-rail, home-after-hero, home-lower-content
- /coloring-pages: global-desktop-rail, coloring-pages-after-featured, coloring-pages-lower-content
- /coloring-pages/[hubSlug]: global-desktop-rail, hub-after-gallery, hub-lower-content

Forbidden surface checks:
- Inside navigation: false
- Inside gallery grid: false
- Inside image cards: false
- Near Print/Download controls: false
- Mimics image or content cards: false

Note: Round 4M planned a wide-hub-rail slot, while the current code reuses global-desktop-rail as the wide rail on every page. Round 4P does not add or move slots.
