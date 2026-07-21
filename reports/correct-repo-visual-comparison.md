# Correct repository visual comparison

Fresh browser evidence is stored under `pipeline/review/correct-repo-prompt-4/screenshots/`. The `before/` and `after/` directories use matching viewport names where the state is available. The attached CSV is the authoritative route-by-route inventory.

## Corrected defect

At 1152 pixels, the Seasonal panel's baseline bounds were left 729.31 and right 1169.31 in a 1152-pixel viewport. At 1280 pixels, its right edge was 1297.31. The count column clipped and the page gained approximately 18 pixels of horizontal overflow.

The panel now right-anchors at roomy widths and returns to the existing centered fallback at 1100 pixels and below. After bounds were:

| Width | Left | Right | Panel width | Positive page overflow |
| ---: | ---: | ---: | ---: | ---: |
| 1024 | 284.00 | 724.00 | 440 | 0 |
| 1152 | 557.66 | 997.66 | 440 | 0 |
| 1280 | 685.66 | 1125.66 | 440 | 0 |
| 1366 | 748.46 | 1188.46 | 440 | 0 |
| 1440 | 785.26 | 1225.26 | 440 | 0 |
| 1920 | 1025.26 | 1465.26 | 440 | 0 |

## Accepted comparisons

- Categories: complete 17-link surface, associated counts, no duplicate destination, overflow, or detached fragments.
- Seasonal: corrected and accepted at every required desktop width.
- Mobile navigation: accepted at 320 by 568, 360 by 800, 375 by 812, 390 by 844, 412 by 915, 430 by 932, and 844 by 390 landscape.
- Mobile search: compact empty state and immediate results accepted across the same mobile matrix; the `dragon` query showed 3 collections and 8 printable results in a scrollable dialog. A one-character query retained the compact minimum-length prompt, a long nonsense query produced the compact no-results state, and a long train-and-mandala query rendered seven long-label results without horizontal overflow. Additional evidence uses the `search-no-results-long-query` and `search-long-labels` filenames.
- Collection cards and More ways to browse: representative image, title, count, approved description, and destination remain in one predictable card hierarchy.
- Printable grids: portrait art fills the 2:3 media frame without distortion or a wide blank band.
- Printable details: the principal 341 by 512 WebP rendered at its 341 by 512 natural size, with actions adjacent to the image and related content following primary actions.
- Trust page: reading width, headings, spacing, footer, and mobile reflow accepted.
- Advertising OFF: no container, label, script, reserved gap, or flash.
- Advertising PLACEHOLDER: stable responsive wells only when explicitly enabled; no ad script.

## Inventory limitations

The current approved runtime data contains 6,352 portrait records and no verified landscape or square record. Those two orientation rows are marked not applicable. No artwork or metadata was altered to manufacture an example.

The connected browser produced incorrect duplicated fixed regions in its earliest stitched full-page captures. Those files were preserved, but only the clean viewport screenshots listed in `correct-repo-visual-comparison.csv` are used as evidence.

The in-app browser does not expose a real mobile software keyboard. Keyboard-open layout was approximated by the 320 by 568 and 844 by 390 constrained viewports and verified against the dialog's internal scrolling, safe-area CSS, focus trap, and active keyboard-access tests. No physical soft-keyboard claim is made.
