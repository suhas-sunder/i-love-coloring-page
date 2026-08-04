# PDF Compression Implementation Report

Date: 2026-08-02
Repository: `suhas-sunder/i-love-coloring-page`
Scope: frontend-only compression of the existing one-page printable PDF image stream

## Outcome

The shared PDF generator now losslessly compresses the existing 1600 × 2400 RGB artwork stream with zlib/deflate and declares PDF `/FlateDecode`. The three accepted production samples are 539,659 to 613,584 bytes, a 94.6742% to 95.3159% reduction from the 11.52 MB baselines. Every sample remains one US Letter portrait page with the same metadata, frame, safe area, artwork box, branding, filename, Download PDF action, and hidden-iframe Print handoff.

Pixel-level comparison of 300 DPI renders found no changed pixels between the raw-RGB baseline and production compressed PDFs. The change introduces no JPEG artifacts because the selected encoding is lossless.

## Starting state

- Branch: `main`
- Starting commit: `3023f4bf876d252be853c7e09c21ddc377efb798`
- Worktree: dirty before this phase; the accepted navigation polish and direct-PDF format-clarity work was preserved.
- No commit or push was performed.

### Pre-existing uncommitted tracked files

- `pipeline/scripts/validate-refinement-contracts.mjs`
- `pipeline/tests/export-composition.test.mjs`
- `pipeline/tests/navigation-search-filter.test.mjs`
- `src/components/coloring/DownloadMenu.tsx`
- `src/components/coloring/GallerySearch.tsx`
- `src/components/coloring/PrintableCardActions.tsx`
- `src/components/coloring/PrintableDetailActions.tsx`
- `src/components/coloring/PrintableDetailPage.tsx`
- `src/components/site/MobileNav.tsx`
- `src/components/site/SiteHeader.tsx`
- `src/lib/coloring/browserDownloads.ts`
- `src/lib/coloring/exportComposition.ts`
- `src/styles/components.css`

### Pre-existing untracked files

- `pipeline/scripts/direct-pdf-format-clarity-browser-qa-runner.cjs`
- `pipeline/scripts/navigation-polish-browser-qa-runner.cjs`
- `reports/2026-08-comprehensive-change-plan.md`
- `reports/2026-08-direct-pdf-format-clarity-implementation.md`
- `reports/2026-08-navigation-polish-implementation.md`
- `reports/2026-08-professional-site-audit.md`
- `src/components/site/DisclosureChevron.tsx`

## Files changed by this phase

- `src/lib/coloring/browserDownloads.ts`
  - Makes the existing PDF byte writer asynchronous.
  - Compresses its existing RGB byte array with `CompressionStream("deflate")`.
  - Emits `/Filter /FlateDecode` and the compressed stream length.
  - Rejects unsupported or empty compression results through the existing truthful PDF failure path.
- `pipeline/tests/export-composition.test.mjs`
  - Adds compressed-stream, size-budget, inflate, xref, metadata, failure, and no-base64 assertions while retaining the existing geometry, lifecycle, format, and action tests.
- `pipeline/scripts/pdf-compression-bakeoff-runner.cjs`
  - Reproducibly captures the raw production baseline, creates the real/synthetic three-method bakeoff, and runs Chrome/Edge route, viewport, download, Print, cleanup, and failure QA.
- `reports/2026-08-pdf-compression-implementation.md`
  - This report.

Approved compact evidence is under `pipeline/review/pdf-compression/`; temporary PDF downloads and redundant renders remain excluded.

## Baseline independently verified

The baseline was captured from the current uncommitted direct-PDF implementation before changing its writer, using Google Chrome 150.0.7871.187 on the local Windows x64 development machine.

| Route | Source metadata dimensions | PDF artwork raster | Exact bytes | Image object |
| --- | ---: | ---: | ---: | --- |
| `/printables/animals/animals-alligator-4feec8505a` | 1024 × 1536 | 1600 × 2400 | 11,521,080 | `/DeviceRGB`, 8 bpc, no filter, stream 11,520,000 bytes |
| `/printables/animals/cats-playing-cards-c22648db9b` | 923 × 1385 | 1600 × 2400 | 11,521,081 | `/DeviceRGB`, 8 bpc, no filter, stream 11,520,000 bytes |
| `/printables/anime-girls/anime-girl-brazilian-jiu-jitsu-5a40029b84` | 972 × 1459 | 1600 × 2400 | 11,521,093 | `/DeviceRGB`, 8 bpc, no filter, stream 11,520,000 bytes |

All three baselines had:

- MIME: `application/pdf`
- Magic bytes: `%PDF`
- Page count: 1
- MediaBox: `0 0 612 792`
- Valid deterministic filenames
- Route-specific metadata titles
- No PDF image filter

The PDF raster dimensions are determined by the existing 2400-pixel long-edge print target, not by the public preview dimensions or the internal SVG viewport. The representative records have different provenance dimensions even though the generated PDF raster is intentionally normalized to 1600 × 2400.

### Baseline workflow and lifecycle

- `prepareOnePagePrintPdf` loaded the internal SVG, rendered its existing high-quality canvas, computed the centralized PDF layout, built the PDF Blob, created one object URL, and recorded the QA snapshot.
- `downloadOnePagePdf` called that preparation function, attached and clicked a temporary download anchor, removed the anchor, and revoked the PDF object URL in `finally`.
- `printOnePagePdf` called the same preparation function and handed the Blob URL to the existing hidden `iframe[title="Printable coloring page PDF"]`; its delayed cleanup owns URL revocation.
- Download PDF did not call Print or open a blank window.

## Candidate encoding bakeoff

The bakeoff used the exact raw RGB streams from the three baseline downloads plus a 1600 × 2400 synthetic fixture containing single-pixel lines, closely spaced parallel lines, diagonals, curves, dense black regions, small white regions, and neutral antialiased edge values.

### Real-production results

| Route | Lossless RGB Flate | Lossless grayscale Flate | JPEG 95, 4:4:4 |
| --- | ---: | ---: | ---: |
| Animals Alligator | 581,331 bytes | 312,428 bytes | 921,307 bytes |
| Cats Playing Cards | 504,661 bytes | 270,391 bytes | 675,201 bytes |
| Anime Girl Brazilian Jiu Jitsu | 538,443 bytes | 293,061 bytes | 790,130 bytes |

Candidate bakeoff compression used level-9 zlib for comparison; production browser-native deflate chooses the user agent’s standards-compliant deflate settings, so production sizes are slightly different.

### Synthetic fixture results

| Encoding | Exact bytes | Reduction from raw synthetic PDF | Pixel result |
| --- | ---: | ---: | --- |
| Lossless RGB Flate | 39,868 | 99.6540% | Zero changed channels |
| Lossless grayscale Flate | 25,590 | 99.7779% | Zero changes for this neutral fixture |
| JPEG 95, 4:4:4 | 608,722 | 94.7166% | 726,642 changed channels; 5,520 channels changed by more than 5 levels |

### Selection

Lossless RGB Flate was selected because it:

- Preserved every RGB channel exactly in all real and synthetic fixtures.
- Rendered pixel-identically to the baseline at 300 DPI.
- Cleared the 3 MiB acceptance limit by more than 2.5 MiB on every sample.
- Preserved future non-neutral pixels rather than assuming all assets will always be grayscale.
- Is a standard PDF image representation using `/FlateDecode`.
- Uses the browser-native byte-oriented `CompressionStream` API without base64, a backend, or a new dependency.
- Keeps the existing hand-authored PDF object model understandable and small.

### Rejected candidates

- Lossless grayscale Flate was smaller and pixel-identical for the sampled neutral line art, but conversion to `/DeviceGray` would irreversibly discard chroma in any future non-neutral source. The additional reduction was unnecessary to meet the budget.
- JPEG/DCT was faster in the isolated Node bakeoff and remained under budget, but it changed 1,147,494 to 1,664,766 channels in the real samples. High-resolution render comparisons showed nonzero differences around line-art regions, consistent with avoidable lossy ringing or edge-value changes. It was rejected because the lossless RGB candidate was both smaller than the JPEG samples and visually exact.

## Production implementation

`prepareOnePagePrintPdf` still calls one shared `buildPrintPdfBytes` function for both Download PDF and Print. That writer now:

1. Reads the same canvas pixels.
2. Produces the same alpha-composited RGB bytes.
3. Streams those bytes through `CompressionStream("deflate")`.
4. Awaits the compressed byte-oriented result through `Response(...).arrayBuffer()`.
5. Rejects a missing compression API or an empty result.
6. Writes `/ColorSpace /DeviceRGB`, `/BitsPerComponent 8`, `/Filter /FlateDecode`, and the compressed `/Length` into image object 4.
7. Writes the same page, font, content, metadata, xref, and trailer objects.

The implementation creates no base64 copy and does not retain a second uncompressed PDF path. The canvas `ImageData` and RGB preparation buffers remain necessary; the final image stream and PDF Blob fall from about 11.52 MB to about 0.54–0.61 MB. The browser compressor may allocate internal working memory, so peak memory on physical mobile hardware remains a manual measurement gate.

## Accepted production output

| Route | Before | After | Reduction | Compressed image stream |
| --- | ---: | ---: | ---: | ---: |
| Animals Alligator | 11,521,080 | 613,584 | 94.6742% | 612,487 bytes |
| Cats Playing Cards | 11,521,081 | 539,659 | 95.3159% | 538,561 bytes |
| Anime Girl Brazilian Jiu Jitsu | 11,521,093 | 573,452 | 95.0226% | 572,342 bytes |

Every Chrome and Edge download was byte-identical for the same printable. Repeated downloads in each browser were also deterministic.

## PDF structure and geometry comparison

Verified with the runner’s independent classic-xref parser, zlib inflation, `pypdf`, and `pypdfium2` rendering:

- MIME: `application/pdf`
- Magic bytes: `%PDF`
- Xref offsets: valid for objects 1–7
- Page count: 1
- MediaBox: `0 0 612 792`
- Image: 1600 × 2400, `/DeviceRGB`, 8 bits/component, `/FlateDecode`
- Inflated image length: exactly 11,520,000 RGB bytes
- Metadata titles: unchanged and route-specific
- Artwork safe box: `{ x: 15, y: 15, width: 582, height: 762 }`
- Placed image box: `{ x: 52, y: 15, width: 508, height: 762 }`
- Brand box: `{ x: 267.78, y: 7.62, width: 76.44, height: 7 }`
- Brand placement: `bottom-frame-label`
- Printable border count: 1
- Application controls in document: none

The baseline and compressed `pypdfium2` renders were pixel-identical at 300 DPI for all three routes. No thin-line loss, broken narrow lines, gray halos, ringing, blur, changed white background, frame change, or branding shift was observed.

### Visual evidence

- Full bakeoff contact sheets: `pipeline/review/pdf-compression/renders/*-fit-contact-sheet.png`
- Compact candidate comparisons: `pipeline/review/pdf-compression/renders/*-fit-contact-sheet.png` and `pipeline/review/pdf-compression/renders/*-thin-line-contact-sheet.png`
- Synthetic thin-line comparison: `pipeline/review/pdf-compression/renders/synthetic-thin-line-contact-sheet.png`
- Production thin-line comparisons: `pipeline/review/pdf-compression/final/renders/*-thin-line-comparison.png`
- Pixel comparison data: `pipeline/review/pdf-compression/final/final-pdf-render-verification.json`
- Browser verification data: `pipeline/review/pdf-compression/final/browser-verification-results.json`

Downloaded PDFs and redundant individual candidate renders were excluded from source control as reproducible QA artifacts. The retained JSON results, contact sheets, and thin-line comparisons preserve the measured and visual evidence without committing temporary downloads.

## Generation performance

Measurements are local lab timings on this Windows x64 development machine, not field data and not a representative mid-tier or physical mobile result.

### Google Chrome 150.0.7871.187

| Route | Baseline Download PDF cold / repeat | Compressed Download PDF cold / repeat | Baseline Print | Compressed Print |
| --- | ---: | ---: | ---: | ---: |
| Animals Alligator | 733.76 / 395.50 ms | 727.93 / 366.89 ms | 267.84 ms | 271.66 ms |
| Cats Playing Cards | 857.64 / 329.51 ms | 533.33 / 381.87 ms | 213.12 ms | 252.63 ms |
| Anime Girl Brazilian Jiu Jitsu | 815.79 / 289.89 ms | 503.90 / 395.45 ms | 186.93 ms | 285.87 ms |

The local Chrome samples remain well below two seconds, but the project’s p75 target is not claimed as met on representative devices because this is a high-end development-machine lab result with a sample of three.

### Microsoft Edge 151.0.4129.59

- Download PDF cold: 557.05–758.87 ms
- Download PDF repeat: 396.85–420.39 ms
- Print PDF generation/handoff: 255.15–285.57 ms
- All generated bytes matched Chrome for the same route.

## Browser and interaction QA

Chrome and Edge were both available and tested. Both are Chromium coverage; this is not cross-engine verification.

Routes:

- `/printables/animals/animals-alligator-4feec8505a`
- `/printables/animals/cats-playing-cards-c22648db9b`
- `/printables/anime-girls/anime-girl-brazilian-jiu-jitsu-5a40029b84`

Viewports per route and browser:

- 390 × 844
- 768 × 1024
- 1024 × 900
- 1440 × 1000
- 1920 × 1080

Results:

- 30 route/viewport combinations passed with no page or action-panel horizontal overflow.
- Action order remained Download PDF, Print, then Download image formats.
- No UI layout, label, focus, detail-fact, or action-hierarchy change was introduced.
- Download PDF returned from its busy state and announced `PDF download started.` through the existing live status region.
- Two direct downloads per route created two PDF URLs, revoked both, left zero active PDF URLs, zero temporary PDF links, zero print frames, zero print calls, and zero window opens.
- Direct download remained separate from Print.
- Print created one hidden printable PDF iframe and reported the same compressed byte length as direct download for every route.
- The existing delayed Print iframe/object-URL cleanup remained unchanged.
- The safe failure fixture aborted internal SVG loading and produced the existing accessible failure status without an empty PDF or silent fallback.
- In-app browser inspection confirmed the unchanged action hierarchy and successful live status, while standalone Chrome/Edge automation captured and parsed the actual downloads.

## Commands and exact results

- `npm run test:export`
  - Before change: 10/10 passed.
  - After change: 11/11 passed.
- `npm run typecheck`
  - Passed, exit 0.
- `node pipeline/scripts/pdf-compression-bakeoff-runner.cjs baseline`
  - Passed; captured three raw production PDFs and cold/repeat/Print timings.
- `node pipeline/scripts/pdf-compression-bakeoff-runner.cjs bakeoff`
  - Passed; created RGB Flate, grayscale Flate, and JPEG candidates for three production records and the synthetic line-art fixture.
- `node pipeline/scripts/pdf-compression-bakeoff-runner.cjs verify`
  - Passed; Chrome and Edge available, 30 responsive pages checked, six first downloads plus six repeats parsed, maximum 613,584 bytes, no failures.
- `npm test`
  - Exit 1: 151 total, 149 passed, 2 failed.
  - Both failures are the known out-of-scope `public/ads.txt` readiness inconsistencies:
    - `AdSense account readiness contains no live credentials or tooling`
    - `trust-report determinism and artifact safety`
  - These assertions were not changed, suppressed, or fixed.
- `npm run build`
  - First invocation: wrapper timeout, exit 124 after 604.044 seconds while the final punctuation-audit child was still completing; not counted as a pass.
  - Second invocation with a longer command cap: passed, exit 0 in 534.2 seconds. Next.js compiled successfully, TypeScript passed, and all 6,920 static pages generated.
- `git diff --check`
  - Passed, exit 0. Git emitted existing LF-to-CRLF working-copy warnings but no whitespace error.

## Generated-artifact cleanup

The full test and build commands regenerated:

- `pipeline/manifests/trust-ads-readiness.json`
- `pipeline/reports/trust-ads-readiness.md`
- `reports/production-readiness-status.md`

After each command, these files were restored to exact HEAD contents. Git’s desktop background status refresh temporarily held `.git/index.lock`; restoration therefore used `git restore --source=HEAD --worktree` with a temporary alternate copy of the existing index. The temporary index and server logs were removed. No trust/readiness diff remains.

## Manual checks still required

- Firefox direct download, deflate parsing, repeated cleanup, and Print handoff
- Playwright WebKit direct download, deflate parsing, repeated cleanup, and Print handoff
- Real Safari on macOS
- Real Safari/iOS and physical mobile peak-memory and generation-time measurement
- A representative mid-tier device for the p75 ≤ 2 second performance gate
- Physical printer output, including thin-line inspection on paper
- Native OS print-dialog behavior; browser automation verified only the existing hidden-iframe handoff, not the OS dialog UI

## Scope confirmation

This phase did not change or add:

- A4, landscape, automatic orientation, scaling, paper, margin, or placement controls
- Printable geometry, background, safe area, frame, branding, metadata, or filenames
- Download PDF, Print, or image-action hierarchy or labels
- PNG, JPG, or WebP generation or behavior
- Navigation, breadcrumbs, search, gallery-card actions, or related-content ranking
- Canonical routes, slugs, stable IDs, asset IDs, taxonomy, hub membership, sitemap data, generated titles, or metadata architecture
- Source SVGs, WebPs, previews, or other media
- Public SVG downloads
- Ads, AdSense, `ads.txt`, consent, publisher configuration, trust pages, or policy copy
- Dependencies, package manifests, production configuration, APIs, databases, server actions, storage, or backend routes

The accepted navigation-polish and direct-PDF format-clarity changes remain intact. No commit or push occurred.
