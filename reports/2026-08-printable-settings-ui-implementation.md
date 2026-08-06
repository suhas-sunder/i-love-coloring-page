# Printable Settings UI Implementation

> Superseded on 2026-08-06. The public paper, orientation, and artwork-size controls documented below were removed by `fix: restore default printable experience` (`baf0f045b7a30244969953a886a6767246e37d79`). The centralized paper-profile engine remains available internally, while the canonical printable page again exposes only the accepted US Letter portrait default. This report is retained as historical implementation evidence; the active behavior is documented in `reports/2026-08-printable-ux-ad-flow-correction.md`.

Date: 2026-08-06
Status: implementation verified locally, released, and verified on the production domain

## 1. Starting branch, HEAD, and Git status

- Branch: `main`
- Starting HEAD: `c5a3db613a97171c5d60af323c56c1a90e6f8796`
- Upstream: `origin/main`
- Starting divergence: 0 ahead, 0 behind
- Starting working tree: clean
- No history rewrite, force push, manual deployment, or external-service change was performed.

## 2. Existing architecture and ownership

Before this milestone, printable-detail actions were owned by `PrintableDetailActions`, the print dialog by `PrintablePreviewDialog`, and the visible detail preview was rendered directly by `PrintableDetailPage`. PDF preparation and Print both used `prepareOnePagePrintPdf` through `browserDownloads.ts`; PNG and JPG used `composePrintableRasterToBlob`; WebP used the artwork-only conversion/download path. Filenames were centralized in `browserDownloads.ts`. Action and dialog status messages were local to their respective client components.

The paper-profile foundation already centralized paper definitions, orientation resolution, safe bounds, artwork fitting, scaling, and PDF/raster geometry in `exportComposition.ts`. The former detail preview did not yet project that geometry; it showed the artwork preview itself. This milestone reuses the existing engine and does not create another export or geometry pipeline.

## 3. Files changed

Application implementation:

- `src/components/coloring/PrintableDetailExperience.tsx` (new bounded client owner)
- `src/components/coloring/PrintablePagePreview.tsx` (new lightweight geometry preview)
- `src/components/coloring/PrintableDetailPage.tsx`
- `src/components/coloring/PrintableDetailActions.tsx`
- `src/components/coloring/PrintableCardActions.tsx`
- `src/components/coloring/PrintablePreviewDialog.tsx`
- `src/components/coloring/DownloadMenu.tsx`
- `src/lib/coloring/exportComposition.ts`
- `src/lib/coloring/browserDownloads.ts`
- `src/styles/components.css`

Tests and durable QA:

- `pipeline/tests/printable-settings-ui.test.mjs` (new)
- `pipeline/tests/export-composition.test.mjs`
- `pipeline/tests/canonical-printable-pages.test.mjs`
- `pipeline/tests/printable-content-quality.test.mjs`
- `pipeline/tests/public-page-restructure.test.mjs`
- `pipeline/scripts/validate-refinement-contracts.mjs`
- `pipeline/scripts/printable-paper-profile-browser-qa-runner.cjs`
- `package.json` (scripts only; no dependency or version change)

Evidence and report:

- `pipeline/review/printable-settings-ui/browser-qa-results.json`
- Eleven compact screenshots/rendered profile images under `pipeline/review/printable-settings-ui/`
- `reports/2026-08-printable-settings-ui-implementation.md`

## 4. UI state ownership and defaults

`PrintableDetailExperience` is the smallest shared client boundary that needs the selected profile. Its strongly typed local state is a normalized `PrintableProfileRequest`:

- Paper: `letter | a4`
- Orientation: `portrait | landscape | auto`
- Artwork scale: `100 | 90 | 75 | 50`

No cookie, local/session storage, IndexedDB, query parameter, environment variable, backend, or server persistence is used. `PrintableDetailPage` keys the client experience by the immutable asset ID, so client navigation to another printable constructs a fresh default state.

The initial state remains US Letter, Portrait, Maximum (100%). It comes from `DEFAULT_PRINTABLE_PROFILE`, and invalid requests are rejected by the exported centralized normalizer before they can reach composition.

## 5. Controls, Auto display, and reset

The `Print settings` section appears only on canonical printable detail pages, immediately before Download PDF and Print. It is outside the artwork, breadcrumbs, related content, and every advertisement wrapper.

It contains three native `fieldset`/`legend` groups with associated radio inputs:

- Paper: US Letter (`8.5 × 11 in`) and A4 (`210 × 297 mm`)
- Orientation: Portrait, Landscape, and Auto
- Artwork size: Maximum, 90%, 75%, and 50%

Auto's explanation is “Chooses the orientation that gives the artwork more printable space.” The resolved result comes from `computePrintableLayout` and is exposed in the visible output summary and preview caption, for example `Auto selected: Portrait`.

`Reset to defaults` is a real button rendered only for a non-default selection. It resets all three values without navigation or reload, restores default naming/output, removes itself after reset, and explicitly moves focus to the US Letter radio so focus is not lost with the removed button.

The wrapper includes the harmless deployment marker `data-printable-settings-version="paper-controls-v1"`.

## 6. Preview integration

`PrintablePagePreview` calls the central `computePrintableLayout` for every selected profile. It projects the returned page, artwork, frame, knockout, and branding boxes through percentage-based CSS and one decorative SVG overlay. It does not allocate a 2550 × 3300 or A4 raster canvas when a radio changes.

Verified behavior:

- Letter and A4 portrait/landscape ratios update correctly.
- Auto exposes the central resolved orientation, including the portrait tie-breaker.
- 90%, 75%, and 50% visibly reduce the centered artwork relative to maximum safe fit.
- Artwork, frame, and branding remain contained with no negative geometry or clipping.
- The same lightweight selected preview is shown in the print dialog on detail pages; gallery-card Print retains its existing preview path and behavior.

## 7. PDF and Print integration

Download PDF snapshots the selected normalized profile at action start and passes it to the existing `downloadOnePagePdf`/`prepareOnePagePrintPdf` path. The document remains one page, uses the selected MediaBox and shared placement geometry, retains metadata and lossless RGB `/FlateDecode`, and preserves object-URL and temporary-anchor cleanup.

Print snapshots the same selected profile and calls the same `printOnePagePdf` preparation path. It retains the existing hidden-iframe handoff, popup/error handling, dialog focus behavior, and URL cleanup. There is no separate Print geometry.

One shared ref-backed operation controller prevents concurrent paper-output operations and disables paper controls while PDF, Print, PNG, or JPG generation is active. Settings are restored on both success and failure. WebP remains independent of this paper lock.

## 8. PNG, JPG, and WebP

PNG and JPG receive the selected profile through the existing branded printable-raster composer:

| Profile | Output dimensions |
| --- | ---: |
| Letter portrait | 2550 × 3300 px |
| Letter landscape | 3300 × 2550 px |
| A4 portrait | 2480 × 3508 px |
| A4 landscape | 3508 × 2480 px |

Selected scale changes artwork placement without changing the selected paper raster dimensions. PNG remains lossless; JPG retains the existing quality setting and MIME behavior.

WebP remains the original artwork-image workflow. It ignores paper, orientation, and scale, has no printable frame or branding, retains its existing filename and URL, and does not expose SVG.

## 9. Filename strategy

Default Letter/Portrait/Maximum filenames are byte-for-byte compatible and have no suffix. Non-default paper-output files append deterministic lowercase, hyphen-separated selected settings:

| Selection | Example PDF filename |
| --- | --- |
| Letter, Portrait, Maximum | `animals-alligator.pdf` |
| A4, Portrait, Maximum | `animals-alligator-a4.pdf` |
| Letter, Landscape, Maximum | `animals-alligator-landscape.pdf` |
| A4, Landscape, 75% | `animals-alligator-a4-landscape-75.pdf` |
| Letter, Auto → Portrait, Maximum | `animals-alligator-auto-portrait.pdf` |
| A4, Auto → Landscape, 75% | `animals-alligator-a4-auto-landscape-75.pdf` |

PNG and JPG use the same suffix table with their own extensions. Auto records both the user's Auto choice and its resolved direction. WebP remains, for example, `animals-alligator.webp`. Route slugs and public asset filenames are untouched.

## 10. Accessibility, keyboard, zoom, and status results

- Native radios, three fieldsets/legends, unique React-generated IDs, labels, native arrow/Space behavior, and a logical Tab order were verified.
- Selectable labels and Reset use a minimum 44 CSS-pixel target; existing visible focus tokens are retained.
- Reset works with Space and Enter and restores focus to US Letter.
- Download PDF, Print, and all download formats remain native buttons. No nested interactive controls or duplicate IDs were found.
- The existing polite atomic status region announces meaningful preview, Auto, preparation, success, and failure changes. The full preview is not a live region.
- No preview animation was added; existing reduced-motion behavior is unchanged.
- Direct Chromium QA verified 390, 768, 1024, 1440, 1920, 2400, and 3440 widths with no document or panel overflow.
- Chromium DevTools visual scaling at 200% and 400% kept the settings reachable. A direct in-app browser check at 390 px also found zero horizontal overflow and verified selection/reset/live-status behavior.

This is engineering verification against the existing accessibility target, not a claim of legal certification or complete WCAG conformance.

## 11. Performance measurements

All figures are local desktop/static-build measurements, not field or p75 device data.

| Printable-route measure | Before | Final | Change |
| --- | ---: | ---: | ---: |
| HTML bytes | 71,070 | 73,661 | +2,591 |
| First-party JavaScript gzip | 199,445 | 203,691 | +4,246 |
| Shared CSS gzip | 10,106 | 10,496 | +390 |
| Initial image requests/bytes | 1 / 49,052 | 1 / 49,052 | unchanged |
| First-party request count | 14 | 14 | unchanged |

The required printable JavaScript budget remains passing at 203,691 bytes against 204,800; shared CSS remains passing at 10,496 against 12,288. The preview uses no full-size canvas and produced a local three-selection update in 200 ms including browser automation overhead. A 10,000-iteration central geometry micro-benchmark took 8.9 ms total (0.00089 ms average). The selected A4/Auto/75% lab run measured PDF 253 ms, PNG 192 ms, and JPG 173 ms. Observed long tasks were 135, 120, and 69 ms (all under 200 ms), and measured layout-shift score was 0.

The historical uncompressed aggregate JavaScript diagnostic remains above its legacy limit: `npm run validate:payload` reports 804,677 bytes against 753,081 (baseline 717,241; +87,436). This diagnostic is reported unchanged and was not weakened. The required route-level gzip budget audit passes.

## 12. Deterministic browser and output QA

Command:

```text
npm run qa:printable-settings -- http://127.0.0.1:3012
```

Installed Chrome 150.0.7871.187 and Edge 151.0.4129.59 (both Chromium-based) each passed 21 route/viewport cases: three production printables × seven widths. The matrix covered default Letter portrait; A4 portrait; Letter landscape; Auto portrait, landscape, and square tie; Letter 90/75/50; and A4 landscape 75. All nine internal profile PDFs parsed as one page, used the expected MediaBox and `/FlateDecode`, stayed under 3 MB, and contained artwork/frame/branding. Poppler rendered every retained comparison; it emitted non-fatal local font-substitution warnings for Symbol and ArialUnicode.

Public A4/Auto/75% verification produced:

- PDF: `animals-alligator-a4-auto-portrait-75.pdf`, 613,609 bytes, A4 portrait, one page, `/FlateDecode`
- PNG: `animals-alligator-a4-auto-portrait-75.png`, 2480 × 3508
- JPG: `animals-alligator-a4-auto-portrait-75.jpg`, 2480 × 3508
- WebP: `animals-alligator.webp`, unchanged artwork-only filename
- Print snapshot: `a4-portrait`, using the shared PDF path

Temporary anchors were removed, direct PDF did not invoke Print, the Print iframe remained `aria-hidden`, and repeated output succeeded. Compact evidence is in [the printable settings review folder](../pipeline/review/printable-settings-ui/).

## 13. Default-output equivalence

All accepted default outputs matched their frozen baselines exactly:

| Route sample | PDF bytes | SHA-256 |
| --- | ---: | --- |
| Animals Alligator | 613,584 | `8bab1edb0e18f90800974c16be753d2448a20c6b0a104fbc92e7df774ec82bca` |
| Cats Playing Cards | 539,659 | `db6063cee65bb1091037c22113d20af2eb09da5571b289a6e834d018c16dd2c3` |
| Anime Girl Brazilian Jiu Jitsu | 573,452 | `20c7e92c0ebcd8463d20306a234aabac9305c48155768b8b07ef9621d480ffeb` |

The default Alligator image hashes also remained exact: PNG `011726dc…d58c`, JPG `bd8174f1…5a22`, and WebP `f42a63e2…1594`.

## 14. Advertising and protected-contract results

No advertising source was edited. Static page-layout validation confirms the printable page still has six unique logical wrappers, `manual-six-v2`, the fixed header policy, the two 300 × 600 rail slots, post-header, square, and lower placements. Print settings and actions contain no advertisement wrapper. Trust, sitemap, and 404 routes remain ad-free. The exact five configured slot IDs and fill/fallback coordination tests remain passing.

`public/ads.txt` remains exactly 58 UTF-8 bytes without a BOM or duplicate record:

```text
google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0
```

Protected comparison results:

- Runtime printables: 6,352
- Protected record hash: `4fc394e39aa4d8e2b0e2e96ebbc586d00c91e5e18479748b72dbb6075e77bed6`
- Static pages generated: 6,920
- Regular sitemap entries: 6,520; image sitemap pairs: 6,352
- Canonical, stable ID, asset ID, primary category, hub membership, related ID, sitemap, public asset, generated title, and generated hub-content findings: zero
- Source images, public asset paths, navigation, gallery discovery, trust copy, dependencies, environment configuration, and Netlify directives: unchanged

## 15. Commands and exact results

- `npm run test:printable-settings`: 27/27 passed
- `npm run test:export`: 19/19 passed; default Letter portrait byte identity passed
- `npm run typecheck`: passed
- `npm test`: 203/203 passed
- `npx next build`: passed; 6,920/6,920 static pages generated
- `npm run audit:performance-accessibility -- --label printable-settings-release`: passed measured budgets; zero unresolved CSS variables
- `npm run validate:static-routes`: passed (7 valid representative routes, 8 invalid routes correctly 404)
- `npm run validate:export-safety`: passed; 69,559 files scanned, 6,352 printables, zero findings
- `npm run validate:accessibility`: passed on 4 representative printables
- `npm run validate:page-layout`: passed, including six printable ad positions and no ad in preview/actions
- `npm run validate:crawl`: passed; 6,352 runtime/frozen records, zero canonical or sitemap mismatches
- `npm run validate:refinement`: passed
- Focused performance/accessibility, editorial/SEO, gallery/discovery, ad layout/fallback, trust/ads, and navigation/discovery suites: all passed in the pre-commit retained verification
- `git diff --check`: passed
- `npm run validate:payload`: only the documented legacy raw-JavaScript diagnostic failed, at 804,677/753,081 bytes; every other payload check passed

The full test run retains one pre-existing Node warning about reparsing `galleryPresentation.ts` as ESM. No test fails because of it.

## 16. Temporary-artifact cleanup

Browser profiles, caches, temporary downloads, generated PDFs, generated PNG/JPG exports, and local QA temp directories are created under the system temporary directory and removed by the runner. Task-specific performance snapshots outside the approved review folder were removed after their values were recorded. Ignored `.next/` and `out/` build products are not staged. The local static server is stopped before commit. No generated readiness file, source image, or build output is retained as a change.

## 17. Commit, push, and deployment evidence

- Implementation commit: `1878ecd8abe11f6fdf9e955032e3a43562891280` (`feat: add printable paper and layout controls`)
- Push: `main` to `origin/main` succeeded; the remote advanced from `c5a3db6` to `1878ecd` and divergence returned to 0/0.
- Push verification timestamp: 2026-08-06 03:06:52 EDT (07:06:52 UTC)
- Initial quiet period: three full minutes; no production request was made during it.
- Poll 1: 03:10:23 EDT, HTTP 200, marker absent; previous assets included `11snkc0e7i8jc.css` and `10~tbrc92zfff.js`.
- Poll 2: 03:11:36 EDT, HTTP 200, marker present; new assets included `01habux-i2x3~.css` and `0ssfc4~3atl3f.js`.
- First marker: 2026-08-06 03:11:36 EDT (07:11:36 UTC)
- Deployment duration from push verification: approximately 4 minutes 44 seconds.
- Documentation evidence commit: this report and compact evidence are committed after this snapshot with subject `docs: record printable settings deployment verification`; its hash is reported in the completion response.

Production HTML verification at 03:13:12 EDT returned HTTP 200 and 75,247 UTF-8 bytes. It contained the exact settings marker, three fieldsets, three legends, nine unique-ID radio inputs with values `letter`, `a4`, `portrait`, `landscape`, `auto`, `100`, `90`, `75`, and `50`, and no advertisement markup inside the settings section. `manual-six-v2` and `fixed-header-v1` remained present. The fixed header `<ins>` retained client `ca-pub-4810616735714570`, slot `5574432869`, and omitted both auto-format attributes. The new CSS and JavaScript assets returned HTTP 200. `ads.txt` returned HTTP 200 with the exact authorized seller line. Production Privacy and Terms HTML each had zero rendered ad wrappers and zero settings wrappers.

The static HTML does not directly emit the AdSense script element because the centralized client integration inserts it after hydration. The controlled rendered production check found exactly one matching AdSense script.

## 18. Direct rendered production findings

One controlled JavaScript-enabled production load used the canonical Alligator printable at a 1440 × 1000 viewport. No ad was clicked and no repeated refresh was used.

Initial rendered state:

- Marker, `manual-six-v2`, and `fixed-header-v1`: present
- Selected radios: Letter, Portrait, 100/Maximum
- Preview: `letter-portrait`
- Reset: absent
- Download PDF, Print, PNG, JPG, and WebP controls: visible
- Horizontal overflow: 0
- Centralized AdSense script count: 1

After selecting A4, Landscape, and 75%:

- Selected state: `a4`, `landscape`, `75`
- Preview: `a4-landscape`, 75%; visible label synchronized
- PNG description: 3508 × 2480 px
- Six rendered ad-layout nodes remained outside the settings section; geometric overlap count: 0
- Horizontal overflow: 0
- Reset appeared and remained keyboard reachable

After Reset, Letter/Portrait/Maximum and the `letter-portrait` preview returned, Reset disappeared, horizontal overflow stayed 0, and active focus moved to the Letter radio.

One AdSense-owned console error was recorded during the controlled production load: `adsbygoogle.push() error: No slot size for availableWidth=0`. There were no printable-settings application errors. Advertising source and behavior are protected and were not edited in this phase, so this existing live AdSense sizing diagnostic is documented for a separately authorized advertising follow-up rather than changed here. Production PDF download was not repeated because the in-app download surface could not independently inspect the resulting file; the installed direct Chromium runner already captured and verified the same selected PDF locally.

## 19. Remaining manual checks and limitations

- Chrome and Edge results are both Chromium coverage, not independent engine coverage.
- Firefox, Playwright WebKit, real Safari/macOS, Safari/iOS, screen-reader combinations, physical mobile-device performance, native browser/OS print dialogs, and physical printer output remain manual gates.
- DevTools 200%/400% visual scaling is useful reflow evidence but is not identical to every browser's UI zoom implementation.
- Local generation timing is not representative-device or production p75 field data.
- The prior browser-bridge limitation did not block this run: the existing direct Chrome/Edge runner and the in-app browser were both available. The in-app production download API did not expose a file path for independent PDF parsing, so local captured-file verification remains the authoritative byte/MediaBox evidence.
- The live AdSense `availableWidth=0` diagnostic needs separate advertising-scope investigation if it is reproducible in normal end-user Chrome; no advertising change was authorized here.

No ad was clicked. No force push, manual deploy, environment variable, dependency, package version, Netlify directive, Cloudflare setting, DNS setting, AdSense account setting, analytics setting, consent setting, backend, API, database, or other external service was added or changed.
