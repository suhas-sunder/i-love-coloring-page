# Browser QA evidence

Local browser checks were run on the production export and the hydrated development build on 2026-07-18. Screenshots are stored locally under `pipeline/review/manual-signoff/site-quality-audit/` and are intentionally excluded from Git.

## Production export

- Homepage and Fantasy Abyss Wyrm carried the same build revision and runtime-data fingerprint.
- OFF mode emitted zero ad-slot elements and zero Advertisement labels.
- Fantasy Abyss Wyrm rendered the same 341×512 WebP before and after hydration, with a non-empty alt attribute and a 341×512 rendered box.
- Document horizontal overflow: zero pixels at the available 1280×720 browser viewport.

## Hydrated development build

- PLACEHOLDER mode rendered six stable logical placeholders on a printable page and loaded no live advertising configuration.
- Fantasy Abyss Wyrm exposed PNG, JPG, and WebP controls after browser capability detection.
- Categories opened as a 1,080-pixel panel with three equal columns, 18 valid links, and zero document overflow.
- Search opened as a modal dialog, focused its search input, locked body scrolling, used a 920×409 dialog and a 872×52 input, and produced zero document overflow.

## Responsive limitation

The connected browser viewport was fixed at 1280×720 and did not expose viewport emulation. The 320, 375, 390, and 430 CSS-pixel and landscape checks therefore remain an explicit browser acceptance item rather than an inferred pass. Static checks did verify the mobile rules for 100dvh containment, safe-area padding, start-aligned grid content, horizontal overflow containment, focus trapping, focus restoration, and body-scroll locking.
