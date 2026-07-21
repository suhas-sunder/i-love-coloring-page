# Visual and performance comparison

This stage intentionally uses structural checks and focused browser observations instead of a brittle pixel snapshot baseline.

| Area | Baseline | Current local result | Follow-up production check |
| --- | --- | --- | --- |
| Collection framing | 4:3 wells around portrait previews | Portrait-first frames, no crop | Confirm representative cards at 1024, 1280, and 1440 pixels. |
| Categories | Fixed panel risk at compact desktop | Viewport-bounded trigger-relative/fixed fallback | Confirm no clipping at 1024, 1152, 1280, 1366, 1440, 1920. |
| Mobile search | Full-height blank region | Safe-area top sheet, header Close | Confirm 320, 375, 390, 430 and landscape with an on-screen keyboard. |
| Principal printable preview | Already truthful/SSR-present | Retained; layout centers the verified preview | Confirm an actual deployed Fantasy Abyss Wyrm response. |
| Advertising | Production OFF foundation | Retained; no live integration | Inspect static HTML and live response before approval. |

No page-weight or rendering benchmark is claimed here: the changes are CSS/layout and a small existing client dialog control, with no new production image files or external scripts.
