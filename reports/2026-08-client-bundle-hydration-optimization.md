# Client bundle and hydration optimization implementation

Date: 2026-08-06

Repository: `suhas-sunder/i-love-coloring-page`

Production: `https://www.ilovecoloringpage.com`

## 1. Starting state

- Branch: `main`
- Starting HEAD: `778dd94dee6611f8969fbb9775cfe389fd9beb85`
- Upstream: `origin/main`
- Starting divergence: 0 ahead, 0 behind
- Starting worktree: clean
- Required repository instructions and every `reports/2026-08-*.md` report were read before editing.

The worktree contained no pre-existing user changes. No dependency, lockfile, environment, Netlify, advertising, generated-content, route, taxonomy, asset, or printable-data change was present or introduced.

## 2. Fresh baseline and methodology

The baseline used a fresh successful Next 16.2.6 production build and the existing performance audit. Static measurements are build-artifact measurements. Browser measurements are local desktop lab results, not field, p75, physical-mobile, or low-end-device results.

| Route family | Baseline HTML bytes | Final HTML bytes | Baseline initial JS raw | Final initial JS raw | Baseline initial JS gzip | Final initial JS gzip |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 113,690 | 113,837 | 676,047 | 672,804 | 201,621 | 200,637 |
| Gallery | 130,855 | 131,023 | 685,788 | 682,545 | 204,437 | 203,624 |
| Large hub | 195,402 | 195,570 | 687,776 | 684,533 | 205,195 | 204,367 |
| Small hub | 66,343 | 66,511 | 687,776 | 684,533 | 205,195 | 204,367 |
| Seasonal hub | 191,509 | 191,677 | 687,776 | 684,533 | 205,195 | 204,367 |
| Paginated hub | 122,711 | 122,866 | 687,776 | 684,533 | 205,195 | 204,367 |
| Printable | 71,523 | 71,704 | 672,779 | 670,089 | 199,990 | 199,351 |
| Privacy | 33,218 | 33,386 | 665,464 | 665,464 | 197,553 | 197,511 |
| Terms | 29,328 | 29,496 | 665,464 | 665,464 | 197,553 | 197,511 |
| About | 24,554 | 24,722 | 665,464 | 665,464 | 197,553 | 197,511 |
| Sitemap | 111,846 | 112,014 | 665,464 | 665,464 | 197,553 | 197,511 |
| 404 | 16,930 | 17,098 | 665,464 | 665,464 | 197,553 | 197,511 |

The small HTML increase is the required deployment marker plus build serialization differences; primary HTML, headings, actions, and related links remain server-rendered.

Fresh aggregate JavaScript baseline: 774,783 raw bytes across 19 files. Final: 762,945 raw bytes across 22 files. The exact reduction is 11,838 bytes (1.53%). Splitting creates more files deliberately while removing action-only code from startup.

Shared CSS remained 61,190 raw / 10,132 gzip bytes. The static first-party request model remained 14 requests on the representative printable. The baseline browser additionally fetched two hidden action runtimes (22,312 and 19,109 raw bytes) before interaction; the final browser fetched neither heavy runtime before interaction. The lightweight visible download-menu chunk remains available after hydration.

## 3. Attribution and confirmed cause

The baseline printable mounted `PrintablePreviewDialog` even while closed. Its static import and the immediately mounted download-menu boundary caused the preview and export/composition implementation to be fetched before the user chose Print or a download format.

The final deterministic attribution identifies these action-time chunks:

| Owner | Raw bytes | Gzip bytes | Load phase |
| --- | ---: | ---: | --- |
| PDF/PNG/JPG runtime (`browserDownloads.ts`) | 21,359 | 6,738 | First PDF, PNG, JPG, or Print preparation |
| Artwork canvas/WebP runtime | 4,233 | 1,825 | First WebP action |
| Preview dialog context A | 4,064 | 1,578 | First Print-dialog open in that context |
| Preview dialog context B | 3,549 | 1,383 | First Print-dialog open in that context |
| Lightweight download menu | 3,427 | 1,439 | Hydrated visible format controls |

The three largest remaining initial chunks are framework/shared chunks of 227,537, 146,196, and 112,594 raw bytes. The next shared client chunks (54,646 and 42,146 raw bytes) combine Next routing with protected advertising, image, gallery, navigation, and printable interaction owners. Further reduction there would require a broader client-shell/advertising/navigation architecture phase and was not safe here.

## 4. Implementation

- `browserDownloadSupport.ts` owns lightweight capability and public-format checks.
- `browserCanvasRuntime.ts` owns generic canvas/image/filename/download helpers without paper composition or PDF code.
- `browserArtworkDownloads.ts` owns artwork-only WebP generation and does not import printable composition.
- `browserDownloads.ts` remains the single heavy PDF/Print/PNG/JPG implementation. Its PDF writer, geometry, metadata, `/FlateDecode` path, object-URL lifecycle, and public exports remain behaviorally unchanged.
- `browserExportLoader.ts` provides cached dynamic imports. Concurrent callers share one promise; a rejected import clears the cache so an accessible retry remains possible.
- `PrintableCardActions.tsx` creates the preview-dialog boundary only after `open` becomes true. The button, IDs, focus-restoration owner, and existing dialog behavior remain intact.
- PDF, preview, and Print use the same cached printable runtime. PNG/JPG use that runtime on their first action. WebP uses the smaller artwork runtime.
- `printableOutputFacts.ts` centralizes the accepted 2550 by 3300 default raster facts so visible labels do not import the paper-composition engine.
- `PublicPageShell.tsx` emits `data-runtime-optimization-version="client-split-v1"` for deployment detection.

There is no second export pipeline, external CDN code, environment branch, route navigation, reload, prefetch-on-hover behavior, or generated-output change.

## 5. First and repeated activation

Local Chrome production-build measurements:

| Action | First duration | Deferred JS | Repeated behavior |
| --- | ---: | ---: | --- |
| PDF | 230.07 ms | 21,359 raw / 6,738 gzip | 283.93 ms; byte-identical; zero new chunks |
| PNG | 1,189.45 ms | 21,359 raw / 6,738 gzip | Existing cached runtime thereafter |
| JPG | 1,213.84 ms | 21,359 raw / 6,738 gzip | Existing cached runtime thereafter |
| WebP | 344.69 ms | 4,233 raw / 1,825 gzip | Did not load the PDF writer |
| Print preview | 883.76 ms | dialog plus printable runtime on demand | PDF handoff prepared in 162.73 ms |

Production Chrome measurements from one page load:

- WebP: 707.42 ms; only `0cd.aiiezzgxn.js`; no PDF writer.
- PDF: 566.89 ms; `0.weety0uh.ux.js` loaded from the original activation.
- Repeated PDF: 1,173.69 ms; no new chunk; byte-identical output.
- PNG: 252.72 ms after the cached runtime was available.
- JPG: 222.77 ms after the cached runtime was available.

Timing variance reflects local versus production network/cache state. These are desktop lab observations, not field claims.

## 6. Output equivalence

- Default PDF: 613,584 bytes, SHA-256 `8bab1edb0e18f90800974c16be753d2448a20c6b0a104fbc92e7df774ec82bca`, `%PDF`, one 612 by 792 point Letter portrait page, `/FlateDecode`, unchanged geometry and title metadata.
- Repeated PDF: byte-identical with zero additional chunk loads.
- PNG: 1,404,823 bytes, 2550 by 3300, SHA-256 `011726dc272ff5a2217887ddb3c2773da1a95b22df989021caff7b0b66f2d58c` locally and in production.
- JPG: 1,238,249 bytes, 2550 by 3300, SHA-256 `bd8174f1437414536b89d4679829d78c88753652ba3511bceb8abb78bd1b5a22` locally and in production.
- WebP: artwork-only, 1600 by 2400 for the fixture, SHA-256 `f42a63e22139352fde66dab4705031a156c8b5c9db2c363913fea86fc14c1594`; no paper composition import.
- Filenames remained `animals-alligator.pdf`, `.png`, `.jpg`, and `.webp`.
- Existing anchor, object-URL, timer, preview, focus, failure, and status cleanup tests remain passing.

## 7. Server rendering, gallery, search, and shared utilities

The visible H1, printable preview, Download PDF, Print, Download image heading, facts, help, and related canonical links remain in the initial HTML. The lazy image menu retains its existing server fallback and hydrates into the same accessible buttons.

Gallery search data was already loaded only after intent and results were already bounded. Gallery batching, diversity, ranking, and related-content work did not show an evidence-backed safe change, so they were left untouched. Navigation and the protected advertising runtime also remained untouched. Generic canvas helpers were separated only where byte and interaction evidence showed a direct benefit.

## 8. Performance and accessibility results

- Gallery initial JS: 203,624 gzip bytes, below the unchanged 210 KiB budget.
- Printable initial JS: 199,351 gzip bytes, below the unchanged 200 KiB budget.
- Static printable reduction: 2,690 raw bytes (0.40%) and 639 gzip bytes (0.32%).
- Startup no longer requests 41,421 raw bytes of hidden preview/export code. Relative to the baseline HTML plus those two eager chunks, the comparable startup set falls from 714,200 to 673,516 raw bytes (40,684 bytes, 5.70%).
- Local browser matrix maximum interaction long task: 63 ms in Chrome and 53 ms in Edge. PDF-generation maximum: 147 ms. Both remain below 200 ms.
- Maximum measured layout-shift score: 0.07356, below the 0.1 good-practice threshold and with no visible regression in reviewed screenshots.
- Horizontal overflow: zero in all 126 local browser checks and the controlled production check.
- Buttons remain native and keyboard accessible. The original activation begins the dynamic load; existing busy, disabled, live-status, success, and error paths remain in their owning components. No second click is required.
- Dialog focus management and focus restoration remain owned by the existing hooks and passed the retained accessibility contracts.
- Server-rendered landmarks, one H1, image alt text, and related links remain intact.

This does not constitute WCAG certification. Screen-reader and non-Chromium manual checks remain listed below.

## 9. Browser matrix

The durable local runner used installed Google Chrome 150.0.7871.187 and Microsoft Edge 151.0.4129.59. Both are Chromium-based, not independent engine coverage.

- Routes: home, gallery, animals hub, paginated animals hub, printable, Privacy, Terms, Sitemap, and 404.
- Widths: 390, 768, 1024, 1440, 1920, 2400, and 3440 CSS pixels.
- Result: 126/126 startup checks passed; zero hydration errors, broken non-RSC resources, horizontal overflow, or initially loaded heavy export chunks.
- Action result: PDF, repeated PDF, PNG, JPG, WebP, and Print passed.
- Evidence: `pipeline/review/client-bundle-hydration/`.

## 10. Advertising regression

- Focused manual-layout/fallback tests: 19/19 passed.
- Printable/ad/zero-width combined tests: 61/61 passed.
- Advertising/trust tests: 12/12 passed.
- Manual-six, balanced-flow, fixed-header, slot, fallback, timeout, measured-rail, and page-family contracts are unchanged.
- Production contained exactly one centralized AdSense script. The controlled page reported the initialized header as `unfilled`; no creative fill is claimed.
- No `availableWidth=0`, ad/action overlap, duplicate script, or ad click occurred.
- Production emitted one opaque third-party `pageerror` message, `Y`, while real AdSense was active. There were zero application console errors and zero hydration errors. The third-party message remains an AdSense/browser diagnostic follow-up, not a suppressed application finding.

## 11. Protected contracts

- Runtime printables: 6,352.
- Protected record SHA-256: `4fc394e39aa4d8e2b0e2e96ebbc586d00c91e5e18479748b72dbb6075e77bed6`.
- Static pages: 6,920.
- Export-safety scan: 69,561 files, zero findings.
- Canonical route validation: seven valid representatives plus eight invalid-route cases passed.
- Routes, stable IDs, asset IDs, primary categories, hub membership, related IDs, titles, hub copy, sitemaps, source images, public asset URLs, navigation, gallery, and advertising configuration are unchanged.
- Letter/A4 profiles, orientation selection, scaling, PDF geometry/compression, PNG/JPG composition, and WebP artwork-only behavior are unchanged.
- `public/ads.txt`: HTTP/local content is the exact 58-byte UTF-8 record `google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0`, no BOM.
- No dependency, package version, environment variable, Netlify directive, analytics, Cloudflare, DNS, consent, or external-service change occurred.

## 12. Commands and exact results

| Command | Result |
| --- | --- |
| Fresh underlying `npx next build` baseline | Passed; 6,920 pages |
| `npm run audit:client-bundle` | Passed; deterministic route/chunk report generated |
| `npm run test:client-bundle` | 5/5 passed |
| `npm run qa:client-bundle` | 126/126 matrix checks plus all printable actions passed |
| `npm run test:performance-accessibility` | 7/7 passed |
| `npm run test:printable-ux-correction` | 27/27 passed |
| `npm run test:export` | 19/19 passed |
| `npm run test:ad-layout-finalization` | 19/19 passed |
| `npm run test:printable-ad-flow-correction` | 61/61 passed |
| `npm run test:trust-ads-readiness` | 12/12 passed |
| `npm run test:discovery-ux` | 12/12 passed |
| `npm run test:gallery-discovery-quality` | 8/8 passed |
| `npm run test:editorial-seo` | 27/27 passed |
| `npm run typecheck` | Passed |
| `npm test` | 216/216 passed in 333.8 seconds; an earlier 244-second command-wrapper attempt timed out without an assertion result |
| `npm run build` | Passed in 440.1 seconds; 6,920 pages |
| `npm run validate:static-routes` | Passed |
| `npm run validate:export-safety` | Passed; 69,561 files, zero findings |
| `git diff --check` | Passed |

The informational legacy `npm run validate:payload` diagnostic remains failed only on aggregate raw JavaScript: 762,945 versus 753,081 bytes. Every HTML, RSC, total-output, printable-count, and full-dataset-probe check passed. The limit was not weakened or gamed. The final total is 9,864 bytes over the historical target, while being 11,838 bytes smaller than the fresh baseline.

The build regenerated `pipeline/manifests/trust-ads-readiness.json`, `reports/related-printable-quality.md`, and `reports/related-printable-samples.csv`; all three were restored byte-for-byte to HEAD and are absent from the implementation diff.

## 13. Commit, push, and Netlify deployment

- Implementation commit: `3e810c2963c9123a63e48df7697f0a6192aa8b1f` — `perf: reduce initial client JavaScript`.
- Push: `main` to `origin/main` succeeded; divergence returned to 0/0.
- Recorded post-push timestamp: 2026-08-06 13:53:51 EDT.
- Initial quiet wait: 190 seconds; no production request or browser load occurred.
- 13:57:37 EDT: first poll attempt; PowerShell `Invoke-WebRequest` parser raised a local null-reference error before yielding an HTTP status. It is recorded as an attempted request, and the next attempt waited more than 60 seconds.
- 13:59:12 EDT: HTTP 200; `client-split-v1` present; body SHA-256 `9858dc966a9b4ecb9c59cbd8ffd8e9d5af97f2988cf35849a9fe141cd128692f`.
- First successful marker time: 2026-08-06 13:59:12 EDT.
- Total recorded deployment wait: approximately 5 minutes 21 seconds.
- Production printable metadata reported deployed revision `3e810c2963c9123a63e48df7697f0a6192aa8b1f`.

Production static verification returned HTTP 200 for the printable, Privacy, and `/ads.txt`; confirmed server-rendered heading, PDF/Print controls, download section, 16 crawlable printable links, and the optimization/manual-six/balanced-flow/fixed-header markers; all nine initial JS assets returned HTTP 200 and totaled 670,089 raw / 199,351 deterministic gzip bytes. Privacy remained ad-free.

The documentation evidence commit is `docs: record client bundle optimization`; its hash and push result are recorded in the task completion response because this report is part of that commit.

## 14. Remaining manual verification

- Firefox and Playwright WebKit browser runs.
- Real Safari and Safari/iOS.
- Screen-reader review with NVDA, JAWS, VoiceOver, or TalkBack.
- Physical mobile and representative mid-tier-device timing.
- Native print-dialog inspection and physical printer output.
- Field Core Web Vitals/p75 measurement after normal traffic accumulates.
- Follow-up attribution of the opaque third-party AdSense page error `Y`; no repository or external-service change was made for it.

No force push, manual deployment, dependency installation, environment change, Netlify configuration change, Cloudflare change, DNS change, AdSense-account change, consent-platform change, or other external-service modification was performed.
