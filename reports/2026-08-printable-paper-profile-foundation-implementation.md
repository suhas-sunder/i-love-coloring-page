# Printable Paper-Profile Foundation Implementation

Date: 2026-08-04

## Outcome

Implemented one internal paper-profile and artwork-placement engine for US Letter, A4, portrait, landscape, automatic orientation, and 100%, 90%, 75%, and 50% artwork scale. The existing public experience still defaults to US Letter portrait at 100% maximum safe fit. No paper, orientation, or scale control was added to the UI.

The accepted default output is byte-identical in the tested Chromium browser. Three representative PDFs and the representative PNG, JPG, and WebP outputs retained their exact pre-change byte lengths and SHA-256 hashes.

## Starting State

- Branch: `main`
- Starting HEAD: `90910be6aca59e9e81c56040db27a6b94bda56a9`
- Upstream: `origin/main`
- Ahead/behind at start: `0/0`
- Working tree at start: clean
- Baseline focused test: `npm run test:export` passed `11/11`
- The branch and upstream were synchronized before editing.

## Files Changed

- `src/lib/coloring/exportComposition.ts`
  - Owns paper definitions, profile resolution, automatic orientation, safe-area calculation, maximum fit, percentage scaling, and PDF/raster geometry.
- `src/lib/coloring/browserDownloads.ts`
  - Passes an optional internal profile request through the existing PDF, Print, PNG, and JPG composition paths.
  - Uses resolved page dimensions instead of Letter-only PDF constants.
- `pipeline/tests/export-composition.test.mjs`
  - Expands composition regression coverage from 11 to 19 tests.
- `pipeline/tests/fixtures/printable-paper-profile-baseline.json`
  - Preserves the compact pre-change default geometry, output hashes, and local Chromium timing sample.
- `pipeline/scripts/printable-paper-profile-browser-qa-runner.cjs`
  - Provides repeatable Chrome/Edge default-output checks plus internal profile generation, Poppler parsing, and rendered visual evidence.
- `pipeline/scripts/validate-canonical-static-export.mjs`
  - Replaces its stale `Download` label assertion with the already-accepted `Download PDF`, `Print`, and `Download image` hierarchy.
- `package.json`
  - Adds `qa:paper-profiles`; no package or dependency version changed.
- `reports/2026-08-printable-paper-profile-foundation-implementation.md`
  - This report.

Generated screenshots and browser results are retained locally under `pipeline/review/printable-paper-profile/`. They are ignored by Git under the repository's generated-media policy. The compact baseline JSON fixture is tracked.

## Previous Composition Contract

The current code and fresh generated output established this accepted default before implementation:

| Property | Accepted value |
| --- | --- |
| PDF page | US Letter portrait |
| PDF MediaBox | `612 x 792` points |
| Raster printable page | `2550 x 3300` pixels |
| Raster density | 300 DPI page canvas |
| Background | White full-page rectangle |
| Outer frame | `x 10, y 10, width 592, height 772` points |
| Safe content | `x 15, y 15, width 582, height 762` points |
| Portrait image box | `x 52, y 15, width 508, height 762` points |
| Brand box | `x 267.78, y 7.62, width 76.44, height 7` points |
| Brand knockout | `x 263.78, y 5.15, width 84.44, height 9` points |
| Frame count | One |
| PDF artwork raster | `1600 x 2400` pixels for the representative portrait records |
| Effective artwork DPI | About `226.77 x 226.77` at the default placed size |
| Image color | `/DeviceRGB`, 8 bits per component |
| Image filter | Lossless `/FlateDecode` |
| PDF pages | One |

The three real source fixtures use SVG view boxes of `800 x 1200`, `800 x 1200`, and `799 x 1200`. The internal SVG remains private infrastructure. PNG and JPG remain branded page compositions; WebP remains an artwork-only image.

The preview dialog continues to prepare an artwork preview. It does not pretend to be a paper preview. Activating the dialog's Print button still prepares the shared one-page PDF before the hidden-iframe browser print handoff.

## Central Model

The engine now defines these internal types:

- `PaperKind`: `letter | a4`
- `PageOrientation`: `portrait | landscape`
- `OrientationPreference`: `auto | portrait | landscape`
- `ArtworkScalePercent`: `100 | 90 | 75 | 50`
- `PrintableProfileRequest`: optional paper, orientation, and scale inputs
- `PrintablePageProfile`: resolved physical page dimensions and stable profile ID
- `PrintableLayout`: resolved page, safe area, maximum image fit, scaled image box, frame, and brand geometry

`PRINTABLE_COMPOSITION.page` remains the frozen default Letter portrait page so existing UI facts and callers do not change. `computePrintableLayout` preserves its original `"pdf" | "raster"` call signature and also accepts the new request object. This avoids a parallel layout engine and keeps old callers deterministic.

## Paper Definitions

| Profile | PDF points | Raster pixels | Physical definition |
| --- | ---: | ---: | --- |
| Letter portrait | `612 x 792` | `2550 x 3300` | `8.5 x 11 in`, 300 DPI |
| Letter landscape | `792 x 612` | `3300 x 2550` | `11 x 8.5 in`, 300 DPI |
| A4 portrait | `595.28 x 841.89` | `2480 x 3508` | `210 x 297 mm`, 300 DPI rounded raster |
| A4 landscape | `841.89 x 595.28` | `3508 x 2480` | `297 x 210 mm`, 300 DPI rounded raster |

A4 raster conversion uses independent point-to-pixel axis scales because integer 300 DPI A4 dimensions cannot share one mathematically exact scalar. The image itself is aspect-fitted again inside the converted safe area, preventing the slight aspect distortion that would result from scaling its PDF box independently on each axis.

## Automatic Orientation

Automatic orientation computes the maximum safe fitted image in portrait and landscape for the selected paper. It selects the orientation with the larger fitted artwork area. Equal-area ties resolve to portrait. The tie rule is explicit and deterministic.

Verified selections:

- `800 x 1200`: portrait
- `1200 x 800`: landscape
- `1000 x 1000`: portrait tie
- The same portrait and landscape choices hold for A4.

## Artwork Scaling

Scaling is applied after maximum safe contain-fit:

1. Resolve paper and orientation.
2. Compute frame and branding knockout.
3. Compute the safe content rectangle.
4. Compute the maximum aspect-preserving fit.
5. Multiply its width and height by `1`, `0.9`, `0.75`, or `0.5`.
6. Recenter the scaled box on both axes.

This keeps every supported scale inside the existing safe area without clipping, changing source assets, or changing the canonical route contract.

## Integration

- Direct PDF and Print still call `prepareOnePagePrintPdf`.
- The PDF writer receives the resolved page and layout from `computePrintableLayout`.
- The PDF MediaBox comes from the resolved layout rather than hard-coded Letter constants.
- The existing RGB byte conversion and `/FlateDecode` writer are unchanged.
- PNG and JPG page canvases use the resolved profile dimensions and shared raster layout.
- WebP continues through the artwork-only conversion path and does not receive a paper profile.
- Default callers pass no profile request, so they resolve to Letter portrait at 100%.
- Filenames and metadata titles are unchanged.
- Object URL, temporary-anchor, preview, and hidden-iframe behavior are unchanged.

## Default Output Equivalence

### PDF

| Route | Before bytes | After bytes | SHA-256 preserved |
| --- | ---: | ---: | --- |
| `/printables/animals/animals-alligator-4feec8505a` | 613,584 | 613,584 | `8bab1edb0e18f90800974c16be753d2448a20c6b0a104fbc92e7df774ec82bca` |
| `/printables/animals/cats-playing-cards-c22648db9b` | 539,659 | 539,659 | `db6063cee65bb1091037c22113d20af2eb09da5571b289a6e834d018c16dd2c3` |
| `/printables/anime-girls/anime-girl-brazilian-jiu-jitsu-5a40029b84` | 573,452 | 573,452 | `20c7e92c0ebcd8463d20306a234aabac9305c48155768b8b07ef9621d480ffeb` |

Every default PDF remained `%PDF`, one page, `612 x 792` points, `/DeviceRGB`, 8 bits per component, and `/FlateDecode`. Repeated downloads produced the same exact hashes.

### Image outputs

| Format | Before and after bytes | Preserved SHA-256 |
| --- | ---: | --- |
| PNG printable page | 1,404,823 | `011726dc272ff5a2217887ddb3c2773da1a95b22df989021caff7b0b66f2d58c` |
| JPG printable page | 1,238,249 | `bd8174f1437414536b89d4679829d78c88753652ba3511bceb8abb78bd1b5a22` |
| WebP artwork image | 389,232 | `f42a63e22139352fde66dab4705031a156c8b5c9db2c363913fea86fc14c1594` |

## Internal Profile Artifact Checks

The QA runner imports the real TypeScript implementation in Chrome, uses the approved alligator SVG fixture in memory, produces PDFs and PNG compositions without exposing UI controls, parses each PDF with `pdfinfo`, and renders it with `pdftoppm`.

| Profile request | Resolved page | PDF bytes | PDF generation | Result |
| --- | --- | ---: | ---: | --- |
| Letter landscape, 100% | Letter landscape | 613,585 | 283.10 ms | Pass |
| A4 portrait, 90% | A4 portrait | 613,608 | 254.30 ms | Pass |
| A4 landscape, 75% | A4 landscape | 613,609 | 224.40 ms | Pass |
| A4 auto, 50% | A4 portrait | 613,610 | 231.60 ms | Pass |

All four artifacts:

- parsed as one page;
- used the expected MediaBox;
- retained `/FlateDecode`;
- remained under 3 MB;
- retained the deterministic `animals-alligator.pdf` filename;
- retained the accepted metadata title;
- kept the image box inside the safe area;
- produced the expected 300 DPI PNG page dimensions;
- retained one frame and the bottom frame brand label.

Visual review of `letter-landscape-100.png`, `a4-portrait-90.png`, `a4-landscape-75.png`, and `a4-auto-50.png` found no clipping, distortion, line degradation, frame error, branding overlap, or off-center placement. Poppler emitted local font-lookup warnings for Symbol and ArialUnicode, but those fonts are not used by the document; the Helvetica brand label rendered correctly in every inspected image.

## Local Timing Sample

These are local desktop Chrome lab timings, not field data or a mobile p75 claim.

| Route | Baseline cold/repeat | Final cold/repeat |
| --- | ---: | ---: |
| Animals Alligator | 343.58 / 313.75 ms | 362 / 267 ms |
| Cats Playing Cards | 270.66 / 1112.26 ms | 1110 / 1095 ms |
| Anime Girl Brazilian Jiu Jitsu | 345.36 / 321.12 ms | 311 / 350 ms |

The PDF bytes are identical, so the timing variation is treated as local browser/process noise rather than an output-path regression. Physical mobile performance remains a manual gate.

## Browser QA

Installed browsers:

- Google Chrome `150.0.7871.187`
- Microsoft Edge `151.0.4129.59`

Both are Chromium-based; this is not cross-engine coverage.

The runner checked all three printable routes at widths `390`, `768`, `1024`, `1440`, and `1920` in both browsers: 15 pages per browser, 30 total route/viewport checks. Results:

- HTTP and printable action panels loaded.
- No page or action-panel horizontal overflow.
- Download PDF and Print order remained unchanged.
- No A4, orientation, automatic, or artwork-scale control leaked into the UI.
- Public details still state `US Letter, portrait`.
- Direct PDF did not create a print iframe or open a tab.
- Temporary PDF download anchors were removed.
- Print prepared the default Letter profile and retained the existing hidden, `aria-hidden` iframe handoff.
- Chrome and Edge screenshots at 390 and 1440 showed no public visual change.

Local evidence: `pipeline/review/printable-paper-profile/browser-qa-results.json` and the PNG files in the same folder.

## Automated Tests

Focused export coverage now verifies:

- all four physical page profiles;
- automatic portrait, landscape, and tie behavior;
- every approved artwork scale;
- centered, contained geometry;
- exact default geometry from the baseline fixture;
- invalid dimension, paper, orientation, and scale rejection;
- normalized Letter PDF/raster geometry;
- A4 landscape PDF MediaBox and PNG dimensions;
- shared PDF and raster engine ownership;
- retained one-page `/FlateDecode` structure;
- retained direct-download and Print separation;
- retained object URL and anchor cleanup;
- unchanged public labels and no public paper controls;
- unchanged WebP artwork behavior and SVG exclusion.

## Commands and Results

- Starting `npm run test:export`: pass, `11/11`.
- Final `npm run test:export`: pass, `19/19`.
- `npm run typecheck`: pass.
- `npm test`: pass, `181/181`, 0 failures, 344.3 seconds.
- `npm run qa:paper-profiles -- http://127.0.0.1:3012`: pass.
  - Chrome: 15 pages, 0 failures.
  - Edge: 15 pages, 0 failures.
  - Three default PDF hashes preserved; repeated hashes preserved.
  - PNG, JPG, and WebP hashes preserved.
  - Four internal profile artifacts parsed and rendered successfully.
- `npm run validate:static-routes`: pass after correcting its stale action-label assertion.
  - 7 representative canonical pages passed every check.
  - 8 invalid route forms remained absent with HTTP 404.
- `npx next build`: pass, 6,920 static pages.
- Final `npm run build`: pass, including generators, 6,920-page Next build, trust readiness generation, and punctuation audit.
- `git diff --check`: pass after final line-by-line review.

An extra `npm run validate:export-safety` diagnostic remains red because its pre-existing `liveAdvertisementCode` rule flags the already-approved production AdSense integration in 34,574 generated static files. It reported zero local/private URLs, duplicate printable prefixes, stale fragments, SVG downloads, raw asset navigation, technical titles, source filenames, and route-output omissions. Advertising behavior and this unrelated validator rule were not changed in this milestone.

The first build attempt was aborted by an intentionally short command timeout while its child continued. A second wrapper invocation correctly reported the resulting Next build lock. The orphan was identified and stopped; the standalone Next build then passed, and the final clean top-level `npm run build` passed. No application workaround was added for the tooling race.

## Protected Contracts

A before/after comparison projected 11 protected fields across all 6,352 runtime printables:

- asset ID;
- stable ID;
- canonical path and slug;
- primary category and hub;
- hub membership;
- related printable and hub IDs;
- WebP path;
- internal SVG path.

Before and after SHA-256: `0b84a28856f7811e73303831a40193ae802875cbae1ec6501ade9f8620204549`.

The following Git blobs also remained identical to HEAD:

- runtime hubs;
- runtime route inventory;
- runtime sitemap inventory;
- image sitemap;
- `public/ads.txt`;
- `package-lock.json`.

The build regenerated trust-readiness and related-printable measurement artifacts. Those unrelated tracked files were restored to exact HEAD content after verification.

## Scope Confirmation

This milestone did not change:

- any visible action, label, detail fact, or page control;
- canonical URLs, slugs, stable IDs, asset IDs, categories, hubs, taxonomy, related scoring, or sitemap membership;
- source images, SVGs, WebPs, public asset URLs, or source filenames;
- PDF frame, branding, safe margins, default artwork placement, metadata, compression, filename, or object lifecycle;
- default PNG, JPG, or WebP bytes or behavior;
- navigation, breadcrumbs, search, gallery, or related-content UI;
- AdSense, ads.txt, trust pages, analytics, environment variables, or external services;
- dependencies, package versions, backend/API architecture, or deployment configuration.

No deployment was performed.

## Remaining Manual Checks

- Firefox PDF generation and page rendering.
- Playwright WebKit verification.
- Real Safari on macOS and iOS.
- Physical iOS and Android performance.
- Physical printer checks for Letter and A4 printers.
- Printer-driver handling for non-default landscape and reduced-scale profiles when controls are authorized in a future phase.
- Screen-reader review when future paper controls are exposed; no new control exists in this milestone.
