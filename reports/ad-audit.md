# Advertisement audit

## Root cause

There was no AdSense script or fill/collapse logic. Every `AdSlot` unconditionally rendered a development placeholder, while responsive CSS hid or switched several locations at breakpoints. That combination explains visible placeholder markup and apparent flashes/disappearance during responsive layout or hydration; it was not a live-slot fill failure.

## Implemented modes

- **OFF:** renders no component, label, container, or reserved space and loads no external script. This is the production default.
- **PLACEHOLDER:** renders stable, labeled development placeholders and never loads an external script. This is the non-production default unless explicitly overridden.
- **LIVE:** requires an explicit mode, a syntactically valid publisher identifier, and a JSON mapping from internal slot IDs to numeric external slot IDs. Missing/invalid configuration safely resolves to OFF. A client WeakSet prevents duplicate initialization of the same element under hydration/Strict Mode.

No live identifiers were added. No live advertising was enabled. Existing locations are mapped in `ad-placement-map.csv`; lower/supporting placements are flagged for value/density review before any later activation.
