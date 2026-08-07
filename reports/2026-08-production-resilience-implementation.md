# Production Resilience and Failure-State Hardening

Date: 2026-08-07
Status: implemented, locally verified, published, and production-smoke verified

## 1. Starting branch and HEAD

- Branch: `main`
- Starting HEAD: `dcc49058d2bbe604607fcd4a0a871a58e8c00fec`
- Upstream: `origin/main`
- Initial divergence: 0 ahead, 0 behind

## 2. No-op milestone check

Repository history and every `reports/2026-08-*.md` file were reviewed. No equivalent completed production-resilience milestone existed. Earlier work covered successful output, accessibility, performance, advertising, release determinism, and visual polish, but did not cover the complete degraded-path matrix requested here.

## 3. Starting Git status

The working tree was clean and synchronized before editing. No prior user changes were mixed into this milestone.

## 4. Files changed

Implementation commit `faaca3220c49e5ffaa94e6df57cbc5b33ee52a33` changed:

- `package.json`
- `pipeline/scripts/production-resilience-browser-qa-runner.cjs`
- `pipeline/tests/export-composition.test.mjs`
- `pipeline/tests/production-resilience.test.mjs`
- `src/components/coloring/DownloadMenu.tsx`
- `src/components/coloring/PrintableDetailActions.tsx`
- `src/components/coloring/PrintablePreviewDialog.tsx`
- `src/components/site/PublicPageShell.tsx`
- `src/lib/coloring/asyncOperationController.ts`
- `src/lib/coloring/browserArtworkDownloads.ts`
- `src/lib/coloring/browserCanvasRuntime.ts`
- `src/lib/coloring/browserDownloads.ts`

Corrective commit `6a42e33e5b916fc0d9900425fa4b301be13b1ae4` synchronized only deterministic payload byte counts in `pipeline/manifests/trust-ads-readiness.json`. It changed no trust-page wording, policy decision, advertising behavior, or readiness conclusion.

## 5. Async and failure inventory

The inventory covered 39 owned boundaries: 7 navigation paths, 6 gallery/search/lazy-media paths, 16 printable/export paths, and 10 advertising lifecycle paths. For each, ownership, pending/success/failure state, retry, cleanup, abort behavior, route-change behavior, and existing coverage were traced. Important owners were the header/mobile navigation components, gallery search and asset-image components, printable action/dialog components, browser export helpers, and the existing AdSense page coordinator.

## 6. Existing coverage

Existing tests were strong on successful geometry, bytes, routes, content, accessibility, ad placement, and release determinism. The material gaps were exception-safe temporary-resource cleanup, print-handoff truthfulness, duplicate async activation, stale completion after route change, JavaScript-disabled browser coverage, broken/slow/lazy images, and combined long-session stress.

## 7. JavaScript-disabled findings

Chrome and Edge each passed 8 JavaScript-disabled routes: Home, gallery, large hub, pagination, printable, Privacy, Sitemap, and 404. Branding, H1s, canonical card links, breadcrumbs, pagination, related links, printable context, trust copy, sitemap links, and footer links remained available. Search/filtering, Show More, generated downloads, and Print correctly remain enhancements requiring JavaScript.

## 8. Dynamic-import findings

PDF, PNG, and JPG deferred-chunk rejection each cleared busy state, re-enabled the initiating control, emitted one operation-specific live-region message, produced no unhandled rejection, and allowed an explicit later retry. No automatic retry was added.

## 9. PDF failure findings

Composition/compression, object-URL, and temporary-download-trigger failures now return typed results. Prepared URLs are revoked if later PDF preparation fails; failed download initiation removes the temporary anchor and revokes immediately. The successful PDF byte contract remains unchanged.

## 10. PNG failure findings

Canvas/context/draw/blob/URL/anchor failures are typed and produce PNG-specific messaging. PNG failure leaves JPG and WebP usable. Temporary anchors are removed and failed-initiation URLs are revoked.

## 11. JPG failure findings

JPG follows the same typed, isolated cleanup contract without silently substituting PNG. It reports the requested format and restores the menu state.

## 12. Print-popup findings

The accepted implementation uses a hidden same-document PDF iframe rather than `window.open()`. Previously it reported success before the iframe proved that the print handoff existed. The handoff is now awaited and bounded by a 10,000 ms timeout; iframe load error, missing `contentWindow`, thrown `print()`, abort, and timeout all return a clear failure and revoke/remove resources. The native print dialog itself remains a manual gate.

## 13. Duplicate-activation findings

A small operation controller admits one active PDF, Print, or image-download action per owning control group. Five rapid PDF activations produced one deferred-runtime request and zero temporary anchors. Repeated pointer/keyboard activation cannot start duplicate generation, URLs, downloads, or print frames.

## 14. Route-change findings

Route/unmount effects abort current work, invalidate operation IDs, clear busy state, and ignore stale completion. The destination hub had one H1, no stale PDF status, no retained dialog, and no application error.

## 15. Broken-image findings

The existing local `AssetImage` fallback was verified rather than redesigned. Blocking gallery assets produced 8 restrained placeholders while preserving 96 canonical media links and 48 title links, with zero horizontal overflow. Printable action failures remain explicit when required artwork cannot load.

## 16. Slow-image findings

Reserved image geometry remained 149 by 223.5 CSS pixels during the controlled slow response. Scenario CLS was 0.041895 and there was no overflow. Lazy loading remained enabled; no skeleton system was introduced.

## 17. Full lazy-image scroll findings

| Route | Images | Lazy | Broken | Missing source |
| --- | ---: | ---: | ---: | ---: |
| Home | 20 | 14 | 0 | 0 |
| Gallery | 56 | 52 | 0 | 0 |
| Animals | 71 | 69 | 0 | 0 |
| Christmas | 66 | 64 | 0 | 0 |
| Plushies page 36 | 24 | 20 | 0 | 0 |

## 18. Search and filter findings

Empty, whitespace, 500-character, Unicode, emoji, apostrophe, hyphen, numeric, and no-result queries completed without exception, stale cards, count/layout breakage, or overflow. Clear restored the unfiltered state. Ranking semantics were not changed.

## 19. Navigation lifecycle findings

Disclosure switching, repeated Escape, mobile open/resize/close, and route navigation retained one active disclosure/dialog, visible focus behavior, restored body scrolling, and zero overflow. Existing listener cleanup remained intact; no navigation code change was necessary.

## 20. 404 findings

Five invalid forms—top-level, unknown hub, page 0, page 9999, and malformed printable—returned 404, one H1, recovery links, `noindex`, and zero ad wrappers. No redirect or indexable duplicate was introduced.

## 21. Static-asset failure findings

Missing deferred chunks use action-specific recovery. Broken artwork preserves local context. Existing font stacks remain CSS-native and readable without font JavaScript. Primary CSS loss was documented as nonrecoverable without creating a second stylesheet, which was intentionally rejected.

## 22. Advertising failure regression

Existing deterministic script-block, failure, unfilled, zero-width, delayed-width, resize, late-fill, and stale-route tests passed. The manual six-position layout, fixed header dimensions, rail policy, 13-second timeout, verified-fill suppression, slot IDs, script count, and trust exclusions were unchanged.

## 23. Observer cleanup audit

The existing ad runtime still disconnects IntersectionObserver and ResizeObserver instances and cancels animation frames. Lazy-image cleanup did not strand viewport-entered images. No new observer was introduced.

## 24. Timer and listener cleanup audit

Image timeouts remove abort listeners. Print handoff clears load timeout, abort listener, delayed handoff, and delayed cleanup timers on the applicable path. Existing navigation pointer/keyboard/orientation listeners remain paired with cleanup.

## 25. Unhandled-error audit

Injected chunk, canvas, URL, and print failures produced zero page errors and zero unhandled promise rejections. Expected intercepted network failures were recorded separately and were not treated as application exceptions.

## 26. User-facing error wording changes

Messages now name the failed operation: PDF import/preparation, PNG creation/download start, JPG creation/download start, WebP download start, preview preparation, and print workflow opening. Stack traces and implementation terms are not exposed.

## 27. Accessibility results

Existing polite status regions announce one concise result without stealing focus. Busy/disabled state clears after failure; triggering controls remain reachable. Messages wrap at narrow widths in the 320 px matrix and are not communicated by color alone.

## 28. Resource-leak findings

Failed URL/anchor/iframe fixtures ended with zero active application-owned URLs, anchors, or frames. Rapid activation produced one active operation. The 24-route long session showed no growing application registry or duplicate IDs. No precise heap-retention claim is made.

## 29. Long-session stress findings

The Home → Animals → printable → related/back → pagination → Christmas → search → printable/back → Home → Sitemap → Home sequence was repeated in one context for 24 route checks. It produced no application console/page error, stale dialog/status, duplicate ID, or overflow. Aborted image requests during intentional navigation were diagnostic, not broken final images.

## 30. Progressive-enhancement matrix

| Feature | Static without JS | Enhanced with JS |
| --- | --- | --- |
| Branding and canonical navigation | Yes | Disclosures and mobile dialog |
| Gallery cards and canonical links | Yes | Search, filters, Show More |
| Pagination and breadcrumbs | Yes | Client navigation |
| Related collections/printables | Yes | Client navigation |
| Printable preview and details | Yes | Generated high-quality preview |
| PDF/PNG/JPG generation | No | Required |
| WebP generated download | No | Required |
| Print preparation | No | Required |

No backend, API, service worker, or duplicate no-JS application was added.

## 31. Performance before and after

| Artifact | Before gzip | After gzip | Delta |
| --- | ---: | ---: | ---: |
| Home initial JS | 200,637 B | 200,640 B | +3 B |
| Gallery initial JS | 203,624 B | 203,627 B | +3 B |
| Hub initial JS | 204,367 B | 204,372 B | +5 B |
| Printable initial JS | 199,351 B | 199,581 B | +230 B |
| Shared CSS | 10,168 B | 10,168 B | 0 B |

Initial image bytes and request counts were unchanged. The post-change browser maximum was CLS 0.087721 and a 65 ms long task, both within accepted budgets. The previous accepted Chrome alligator PDF cold/repeat timings were 727.93/366.89 ms; the composition and byte generator remain unchanged, while production later generated PDF, PNG, JPG, and WebP together in 3.6 seconds on desktop Chrome. This is lab evidence, not field p75 data.

## 32. Browser QA matrix

Installed Chrome 151.0.7922.76 and Edge 151.0.4129.72 (both Chromium) covered 10 routes at 320, 390, 768, 1024, 1440, 1920, 2400, and 3440 px: 160 normal checks, zero failures. Sixteen JavaScript-disabled checks also had zero failures. Failure injection was local-only and ad requests were blocked locally.

## 33. Focused tests

- Production resilience: 37/37 passed.
- Export composition: 22/22 passed.
- Visual polish: 3/3 passed.
- Client bundle: 5/5 passed.
- Performance/accessibility: 7/7 passed.
- Ad layout: 19/19 passed.
- Internal links: 5/5 passed.
- Crawl: 8/8 passed.
- Sitemap: 4/4 passed.
- Navigation: 1/1 passed.
- Gallery/discovery: 8/8 passed.
- Editorial/SEO: 27/27 passed.
- Trust/ads readiness tests: 12/12 passed.

## 34. Full test result

`npm test` passed 253/253 in 210.452 seconds before the release gate. Both authoritative release-gate runs also passed the full-test stage (213.014 and 207.265 seconds).

## 35. Export result

`npm run test:export` passed 22/22. Default Letter portrait stayed byte-identical at 613,584 bytes, one page, 612 by 792 points, RGB `/FlateDecode`, with unchanged geometry, metadata, and filename.

## 36. Protected-contract result

All 6,352 printable records remained unchanged with SHA-256 `4fc394e39aa4d8e2b0e2e96ebbc586d00c91e5e18479748b72dbb6075e77bed6`. Canonicals, stable/asset IDs, categories, hub membership, related IDs, sitemap membership, public asset URLs, source images, generated titles/content, paper profiles, and dependencies were unchanged.

## 37. Internal-link result

Validation passed 6,916 public HTML nodes, 334,452 static edges, 214,370 unique edges, zero broken links, zero orphan indexable pages, and zero dead ends.

## 38. Visual-polish regression result

Visual-polish tests passed 3/3. The only markup addition was the invisible full-shell deployment marker. No CSS or successful-state layout changed.

## 39. Advertising regression result

Ad layout tests passed 19/19 and the full ad/trust suites passed. No advertising source, placement, ID, timeout, eligibility, fill/fallback rule, or layout file changed.

## 40. `/ads.txt` result

The root file remains exact UTF-8 without BOM or duplicate records:

`google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0`

## 41. `npm run verify:release` result

The first local authoritative run passed in 769.794 seconds. After CI exposed stale generated payload counts, the corrected authoritative run passed in 766.250 seconds. Every required stage passed. The historical aggregate raw-JavaScript diagnostic and external owner-readiness diagnostic remained explicitly nonblocking; neither was suppressed or weakened.

## 42. GitHub Actions result

Initial run `31203883996` failed because clean CI regenerated `pipeline/manifests/trust-ads-readiness.json` with current deterministic payload sizes. That exact one-file cause was reproduced locally and the complete corrected local release gate passed. Corrective run `31206052749` was started for `6a42e33e5b916fc0d9900425fa4b301be13b1ae4`. On 2026-08-07 the owner explicitly directed that no further GitHub release-gate work be performed, so polling was stopped immediately and no final GitHub conclusion is claimed in this report.

## 43. Implementation commit

- `faaca3220c49e5ffaa94e6df57cbc5b33ee52a33` — `fix: harden production failure states`
- Corrective: `6a42e33e5b916fc0d9900425fa4b301be13b1ae4` — `fix: synchronize resilience readiness artifact`

## 44. Push result

Both commits were pushed normally to `origin/main`. No force push occurred.

## 45. Netlify deployment timeline

Implementation push: 2026-08-07 17:46:43.721 UTC.

| Poll (UTC) | HTTP | Marker |
| --- | ---: | --- |
| 17:50:09.083 | 200 | absent |
| 17:51:21.991 | 200 | absent |
| 17:52:31.327 | 200 | present |

The first poll followed the mandatory three-minute no-browser wait. Total wait to first marker was 347.606 seconds. No manual deploy or Netlify change occurred.

## 46. Production marker result

`data-resilience-version="failure-hardening-v1"` is live on Home, Animals, and the representative printable full shells. It is intentionally absent on utility/trust/404 shells and on the non-full paginated shell. Existing `professional-sweep-v1`, `manual-six-v2`, and `client-split-v1` markers remained present where intended.

## 47. Production resilience smoke

HTTP checks returned 200 for Home, Animals, Plushies page 36, printable, Privacy, and Sitemap; the invalid route returned 404 and `noindex`. The Animals hub natural scroll loaded all 71 images (69 lazy), with zero broken/missing sources and zero overflow.

The representative production printable produced:

- PDF: `animals-alligator.pdf`, 613,584 bytes, SHA-256 `8bab1edb0e18f90800974c16be753d2448a20c6b0a104fbc92e7df774ec82bca`, `%PDF`, one 612×792 page, `/FlateDecode`.
- PNG: 1,404,823 bytes, 2550×3300.
- JPG: 1,238,249 bytes, 2550×3300.
- WebP: 389,232 bytes, 1600×2400 artwork-only.

Print remained available; temporary anchors and print frames were zero afterward. The export-only capture blocked ad requests to avoid additional impressions, so its one resource-console entry was the deliberate block; page errors were zero. No ad was clicked.

## 48. Remaining manual checks

Firefox, Playwright WebKit, real Safari/iOS, screen-reader walkthroughs, physical mobile memory behavior, the native OS print dialog, and a physical printer remain manual. Chrome and Edge evidence is Chromium-only. Field p75 and precise heap-retention measurements remain unavailable.

## 49. Scope confirmation

No dependency, package version, environment variable, service worker, PWA/offline cache, backend, API, server action, database, route, canonical, taxonomy, content, printable successful output, advertising layout/behavior, ads.txt, Netlify directive, CI workflow behavior, Cloudflare setting, DNS setting, AdSense account setting, consent setting, analytics setting, or other external service was changed. No manual deployment, force push, or ad click occurred.

## Compact evidence

- `pipeline/review/production-resilience/failure-matrix-summary.json`
- `pipeline/review/production-resilience/browser-qa-summary.json`
- `pipeline/review/production-resilience/lazy-scroll-summary.json`
- `pipeline/review/production-resilience/cleanup-summary.json`
- `pipeline/review/production-resilience/production-smoke-summary.json`
