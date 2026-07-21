# Correct repository pre-refinement audit

Fresh baseline evidence was captured from `http://127.0.0.1:3005`, served from this verified repository's `out/` directory. Artifacts are under `pipeline/review/correct-repo-prompt-4/screenshots/before/`.

| Route or state | Viewport | Component | Finding | Baseline behavior | Intended behavior | Root cause | Planned correction |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| Homepage, Categories open | 1024 to 1920 | Desktop Categories disclosure | Already fixed in real repository | 17 unique destinations, aligned live counts, complete surface, no horizontal overflow | Preserve behavior | Prior portrait/dropdown CSS is active | None |
| Homepage, Seasonal open | 1152 and 1280 | Desktop Seasonal disclosure | Confirmed | Panel extended about 18 CSS pixels beyond the viewport; the count column clipped and a horizontal scrollbar appeared | Trigger-associated panel fully inside the viewport | Absolute panel was centered on a trigger near the right edge; the fixed fallback ended at 1100px | Right-anchor the roomy panel and keep the compact centered fallback |
| Homepage, Seasonal open | 1024, 1366, 1440, 1920 | Desktop Seasonal disclosure | Partially fixed | Correct at these widths but not the complete required matrix | Correct at every required width | Same breakpoint gap | Same correction |
| Homepage, mobile menu | 320, 360, 375, 390, 412, 430 and 844 landscape | Mobile navigation | Already fixed in real repository | Full viewport, one scrolling panel, reachable Close control, body locked, no horizontal overflow | Preserve behavior | Shared modal and navigation data are active | None |
| Homepage, mobile search | Same mobile matrix | Global search | Already fixed in real repository | Empty sheet is compact; results follow controls; landscape uses internal scrolling; body remains locked | Preserve behavior | Prior search layout is active | None |
| Homepage, Start with a collection | 1440 and 390 | Collection cards | Already fixed in real repository | Image, title, count, and approved description form one card; title/count baselines remain associated | Preserve behavior | `HubCard` and portrait-first CSS are active | None |
| Homepage, More ways to browse | 1440 and 390 | Collection cards | Already fixed in real repository | Six image-backed cards with live counts and approved descriptions; no bare label list | Preserve behavior | Shared `HubCard` path is active | None |
| Animals hub, gallery | 1440 and 390 | Printable cards | Already fixed in real repository | Portrait image dominates; source is 341 by 512 WebP; frame is 2:3; no visible upscaling or overflow | Preserve behavior | Printable gallery frame correction is active | None |
| Variant printable | 1440 and 390 | Printable detail | Already fixed in real repository | H1 and breadcrumb use colon variant; summary does not repeat full title; principal image renders at natural 341 by 512 | Preserve behavior | Title and principal-image foundations are active | None |
| Privacy | 1440 and 390 | Trust layout | Already fixed in real repository | Readable measure, clear heading hierarchy, comfortable spacing, no overflow | Preserve behavior | Narrow trust measure is active | None |
| Homepage, ad OFF | 1440 and 390 | Advertising shell | Already fixed in real repository | Zero slots, labels, scripts, or reserved gaps | Preserve behavior | Production mode resolves to OFF | None |
| Runtime orientation inventory | all 6,352 records | Image framing | Not reproducible for landscape or square records | Every verified runtime record is portrait, 1024 by 1536 source and 341 by 512 public WebP | Test all orientations that actually exist without inventing unsupported records | Current approved runtime inventory contains no verified landscape or square record | Record the inventory limitation; do not manufacture samples or alter artwork |

## Baseline artifact highlights

- `before/desktop-1440-home-viewport.png`
- `before/desktop-1440-categories-open.png`
- `before/desktop-1152-seasonal-open.png`
- `before/desktop-1440-more-ways-viewport-clean.png`
- `before/desktop-1440-animals-grid-viewport.png`
- `before/desktop-1440-variant-printable.png`
- `before/mobile-390x844-navigation-open.png`
- `before/mobile-390x844-search-empty.png`
- `before/mobile-390x844-search-results-dragon.png`
- `before/mobile-390x844-more-ways-viewport-clean.png`
- `before/mobile-390x844-animals-grid-viewport.png`
- `before/mobile-390x844-variant-printable.png`
- `before/mobile-390x844-privacy.png`
- `before/desktop-1440-ad-off.png`

Earlier full-page captures were preserved but were not used for visual comparison because the connected browser's stitched full-page rendering duplicated fixed regions. The viewport captures listed above are the authoritative fresh baseline.
