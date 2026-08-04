# Direct PDF and format clarity implementation

Date: 2026-08-02
Scope: canonical printable-detail actions and output descriptions only
Repository: `suhas-sunder/i-love-coloring-page`
Production reference: `https://www.ilovecoloringpage.com`

## Starting state

- Branch: `main`
- Starting commit: `3023f4bf876d252be853c7e09c21ddc377efb798`
- No commit or push was performed.
- The working tree was already intentionally dirty from the accepted navigation-polish task. Those changes were inspected and preserved.

Pre-existing uncommitted paths at the start:

- `pipeline/scripts/validate-refinement-contracts.mjs`
- `pipeline/tests/navigation-search-filter.test.mjs`
- `src/components/coloring/GallerySearch.tsx`
- `src/components/site/MobileNav.tsx`
- `src/components/site/SiteHeader.tsx`
- `src/styles/components.css`
- `pipeline/scripts/navigation-polish-browser-qa-runner.cjs`
- `reports/2026-08-comprehensive-change-plan.md`
- `reports/2026-08-navigation-polish-implementation.md`
- `reports/2026-08-professional-site-audit.md`
- `src/components/site/DisclosureChevron.tsx`

`src/styles/components.css` was already modified by navigation polish and received only the directly related printable-action styles in this phase. No pre-existing navigation edits were reverted or reformatted.

## Workflow traced before implementation

The current implementation matched the audit description:

1. `prepareOnePagePrintPdf` rendered the private internal SVG to a canvas, obtained the shared PDF layout from `computePrintableLayout`, produced PDF bytes, created an `application/pdf` Blob and object URL, and returned the deterministic PDF filename.
2. `printOnePagePdf` called that preparation function and handed the result to `triggerPdfPrint`, which uses a temporary hidden iframe and invokes the iframe print method after load.
3. PNG and JPG called `composePrintableRasterToBlob` and produced the branded US Letter composition at 2550 × 3300 px.
4. WebP called the separate raw-artwork conversion path at the configured long edge; it did not include the Letter page, frame, or brand composition.
5. The canonical detail page exposed Print first, followed by technically named PNG/JPG/WebP controls with no semantic distinction. Its details panel labeled the internal artwork viewport as `Artwork size: 800 × 1200 px`.

The live-production baseline spot check at 390 px confirmed that action order, wording, ambiguous dimension row, and the existing print-preview dialog before source changes were made.

The shared composition was confirmed from current code and tests as one portrait US Letter PDF page, 612 × 792 points, and 2550 × 3300 px for branded PNG/JPG output. These facts were not inferred solely from the older audit.

## Files changed by this phase

- `src/lib/coloring/browserDownloads.ts`
- `src/lib/coloring/exportComposition.ts`
- `src/components/coloring/PrintableDetailActions.tsx`
- `src/components/coloring/PrintableCardActions.tsx`
- `src/components/coloring/DownloadMenu.tsx`
- `src/components/coloring/PrintableDetailPage.tsx`
- `src/styles/components.css` (shared with the retained navigation-polish diff)
- `pipeline/tests/export-composition.test.mjs`
- `pipeline/scripts/direct-pdf-format-clarity-browser-qa-runner.cjs`
- `reports/2026-08-direct-pdf-format-clarity-implementation.md`
- Intentional ignored QA evidence under `pipeline/review/direct-pdf-format-clarity/`

## Exact implementation

### Direct PDF download

`downloadOnePagePdf` is a small wrapper around the existing `prepareOnePagePrintPdf`; it does not duplicate PDF-writing or layout calculations. On success it:

- uses the prepared `application/pdf` Blob URL and existing deterministic `.pdf` filename;
- initiates a normal anchor download without opening a tab, iframe, or print workflow;
- returns the existing page count, page-size identifier, and point dimensions;
- revokes the prepared object URL in `finally`, including the download-unavailable branch.

The canonical detail action prevents duplicate activation with both React disabled state and an immediate ref lock. It announces `Preparing PDF...`, success, and failure through the persistent polite live region. Keyboard focus is restored to the PDF button after the busy-to-ready render completes. No PNG fallback runs when PDF preparation fails.

### Object URL lifecycle

The direct path creates one URL during existing PDF preparation, clicks one temporary download anchor, removes the anchor, and revokes that URL in `finally`. Two consecutive automated downloads produced two URLs and two revocations, with zero active URLs, zero retained PDF anchors, zero print iframes, zero print calls, and zero calls to `window.open` afterward.

The temporary automation downloads were removed after PDF inspection. Only review screenshots and the rendered review image remain under the approved review directory.

### Print retained

Print remains a visible secondary action and still opens the existing preview dialog. Its print button still calls `printOnePagePdf`, which uses `prepareOnePagePrintPdf` and then `triggerPdfPrint`. The direct download helper never calls `triggerPdfPrint`. The native OS print dialog was not claimed as inspected because browser automation cannot reliably inspect that device UI.

### Action hierarchy

| Before | After |
| --- | --- |
| Primary Print | Primary Download PDF |
| Heading `Download` | Secondary Print |
| Equivalent-looking PNG/JPG/WebP buttons | Heading `Download image`, then described formats |
| No direct PDF save | Direct PDF save without the print dialog |

Existing gallery-card Print styling and behavior remain unchanged because `PrintableCardActions` retains its original default button class; only the canonical detail call site supplies the secondary variant.

### Format-label truth table

| Control | Visible description | Actual implementation | Status |
| --- | --- | --- | --- |
| PNG | `Printable page image, 2550 × 3300 px` and `Recommended` | Branded portrait Letter raster composition | Accurate |
| JPG | `Printable page image, 2550 × 3300 px` | Branded portrait Letter raster composition | Accurate |
| WebP | `High-resolution artwork image` | Artwork-only conversion, no Letter composition | Accurate |

Every format keeps browser capability detection and existing download/error handling. Each description has a unique ID and is associated through `aria-describedby`; each button retains a concise format-specific accessible name. SVG remains absent from public controls.

### Details panel

| Before | After |
| --- | --- |
| `Orientation: Portrait` | `Artwork orientation: Portrait` |
| `Artwork size: 800 × 1200 px` | Removed |
| No PDF output facts | `Printable PDF: US Letter, portrait` and `PDF paper size: 8.5 × 11 in` |
| No raster output fact | `PNG/JPG output: 2550 × 3300 px` |
| No WebP distinction | `WebP output: Artwork image` |

Paper and raster values come from `PRINTABLE_COMPOSITION.page`; they are not duplicated unexplained constants. Existing Collection, Subject, Style, and Occasion facts remain data-driven. Help copy now concisely distinguishes direct PDF save, the same-PDF print workflow, printable-page PNG/JPG, and artwork-only WebP.

The About page still describes PNG as the initial download option and omits the new direct PDF action. That is now incomplete product copy, but changing a trust page was prohibited; it requires a later authorized trust-copy phase.

## Browser and keyboard verification

Three canonical records with distinct source-image dimensions were used:

- `/printables/animals/animals-alligator-4feec8505a` — source 1024 × 1536
- `/printables/animals/cats-playing-cards-c22648db9b` — source 923 × 1385
- `/printables/anime-girls/anime-girl-brazilian-jiu-jitsu-5a40029b84` — source 972 × 1459

Each was checked at 390, 768, 1024, 1440, and 1920 px in installed Google Chrome 150 and Microsoft Edge 151: 30 route/viewport checks total. These are two Chromium distributions, not independent browser-engine coverage.

Verified outcomes:

- HTTP success, visible main content, no horizontal page or action-panel overflow.
- Download PDF → Print → Download image ordering at every sampled route and viewport.
- Truthful PNG/JPG/WebP descriptions, PNG recommendation, no SVG control, and no ambiguous `Artwork size` row.
- Download PDF busy state is disabled, has `aria-busy=true`, and says `Preparing PDF` while the live region says `Preparing PDF...`.
- Direct PDF download returns to ready state, announces success, retains focus, and repeats cleanly through Enter activation.
- Print preview opens, reaches `Print preview ready.`, retains its Print handoff and Close control, and restores focus to the detail-page Print trigger.
- PNG, JPG, and WebP each initiated a download with the expected extension in supported Chromium.
- An intentionally aborted private-SVG request produced a visible failure message and did not initiate or silently substitute PNG.

Firefox and Playwright WebKit binaries were not installed locally. Playwright WebKit, even when available, would not be described as real Safari hardware coverage. Remaining manual coverage is listed below.

## Downloaded-file verification

Chrome automation captured `animals-alligator.pdf` twice. Each filename was deterministic. The retained inspection copy had:

- MIME reported by the implementation: `application/pdf`
- Magic bytes: `%PDF`
- Byte length: 11,521,080
- Pages: 1
- MediaBox: 612 × 792 points
- PDF title: `Animals Alligator - iLoveColoringPage.com`

`pypdf` independently verified the magic bytes, page count, dimensions, and metadata. The bundled Poppler command wrapper pointed to a missing runtime path, so the review render used the already bundled `pypdfium2` fallback at 120 DPI. Visual inspection confirmed one portrait Letter page, intact border, centered artwork, safe margins, and bottom branding without clipping. The rendered evidence is `pipeline/review/direct-pdf-format-clarity/chrome-downloaded-pdf-render.png`.

## Screenshot evidence

- `pipeline/review/direct-pdf-format-clarity/chrome-390-printable-actions.png`
- `pipeline/review/direct-pdf-format-clarity/chrome-390-download-image-hierarchy.png`
- `pipeline/review/direct-pdf-format-clarity/chrome-390-page-details.png`
- `pipeline/review/direct-pdf-format-clarity/chrome-390-download-pdf-busy.png`
- `pipeline/review/direct-pdf-format-clarity/chrome-390-download-pdf-failure.png`
- `pipeline/review/direct-pdf-format-clarity/chrome-390-print-preview-dialog.png`
- `pipeline/review/direct-pdf-format-clarity/chrome-1440-printable-actions.png`
- `pipeline/review/direct-pdf-format-clarity/chrome-1440-page-details.png`
- `pipeline/review/direct-pdf-format-clarity/chrome-downloaded-pdf-render.png`

## Commands and exact results

- `npm run test:export` — passed, 10/10 tests, 0 failures. Final focused run duration: 456.3349 ms.
- `npm run typecheck` — passed, exit code 0.
- `npm run build` — passed, exit code 0. Next.js 16.2.6 compiled, typechecked, and statically generated 6,920 pages. Final run duration: 403.3 seconds.
- `node pipeline/scripts/direct-pdf-format-clarity-browser-qa-runner.cjs` — passed. Chrome and Edge each completed 15 page/viewport checks with zero failures; all 20 interaction/lifecycle checks passed. Firefox and WebKit executables were unavailable.
- `npm test` — 148/150 passed; exactly 2 known, pre-existing `public/ads.txt` trust-readiness tests failed. Total duration: 178,413.6281 ms.
- `git diff --check` — passed, exit code 0, with no whitespace errors. Git emitted only the repository's existing LF-to-CRLF working-copy warnings.

The two full-suite failures were not altered:

1. `AdSense account readiness contains no live credentials or tooling` expected an empty path but found `public/ads.txt`.
2. `trust-report determinism and artifact safety` expected `false` but received `true` from the same existing readiness inconsistency.

Build and full-test commands regenerated `pipeline/manifests/trust-ads-readiness.json`, `pipeline/reports/trust-ads-readiness.md`, and `reports/production-readiness-status.md`. Those exact tracked artifacts were restored to HEAD after each command. No ads, trust-readiness, or production-readiness artifact remains modified.

## Remaining manual verification

- Firefox desktop and mobile widths, including PDF download, object-URL timing, and image-format capability gating.
- Playwright WebKit when its runtime is available; report it as WebKit coverage only.
- Real Safari on macOS and iOS, especially immediate Blob-URL download initiation and repeated saves.
- Physical 390 px mobile hardware for touch behavior and native download affordances.
- One real printer workflow on Windows and macOS to confirm native print settings while preserving the already verified one-page PDF input.
- Owner review of the incomplete About-page download wording in a separately authorized trust-copy phase.

## Scope confirmation

- No A4, landscape, automatic orientation, scale selector, margin control, paper selector, or PDF compression was introduced.
- PDF bytes, branding, frame, safe area, artwork positioning, and composition calculations were not redesigned.
- No ads, AdSense, `ads.txt`, consent, trust/policy copy, environment value, or production configuration was changed.
- No canonical path, slug, stable ID, asset ID, category, hub membership, sitemap record, metadata architecture, generated title, or generated data remains changed.
- No source image, SVG, WebP, generated media source, asset resolver, export/print route, backend route, API, dependency, or lockfile was changed.
- Existing navigation-polish changes remain intact.
- No commit or push occurred.
