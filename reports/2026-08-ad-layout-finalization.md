# Manual AdSense Layout Finalization

Date: August 5, 2026  
Status: Released to `main`; automatic Netlify publication and production HTML/static-asset verification passed. Rendered browser checks remain a documented manual gate because the required Codex browser extension/native-host bridge is unavailable.

## Starting state

- Branch: `main`
- HEAD: `ee48030cac8b8c71628560f936c8a92c18e5b400`
- Upstream: `origin/main`
- Initial divergence: 0 ahead, 0 behind
- Initial working tree: 26 modified tracked files, three untracked implementation files, and nothing staged
- Latest commit: `ee48030 docs: record live AdSense verification`

The completed printable paper-profile foundation and coordinated ad-fill/fallback milestone were present at the starting commit. Their protected behavior was not changed.

## Evidence available and limitations

The task attachment contained written requirements but no separate reference screenshot files. The existing 2026-08 reports, current production/source architecture, official Google documentation, generated static output, and the local iLoveSVG reference implementation were therefore the available evidence.

The iLoveSVG reference was reviewed only for reusable geometry and containment ideas, including its delayed AdSense and ultra-wide sidebar-ad components and their call sites. The adopted values were the 2,400-pixel minimum ultra-wide viewport, 300 by 600 rail size, 24-pixel content gap, 16-pixel outer safety allowance, and measured content-bound eligibility. Its identifiers, retry behavior, and any overlay/sticky behavior were not copied.

Interactive browser automation is unavailable in this Codex environment. Google Chrome and Microsoft Edge executables are installed, but neither browser has the required Codex browser extension enabled and the native-host registration is absent. The browser-control procedure does not permit substituting standalone Playwright or shell-driven browser automation for an explicitly requested Chrome/Edge family run. The browser-client attempt returned `Browser is not available: chrome`; one diagnostic pass confirmed that extension ID `hehggadaopoacecdllhhajmbjkdcmajg` and native host `com.openai.codexextension` are absent. No extension, host, browser package, or dependency was installed. Consequently:

- no Chrome or Edge scenario is claimed as passed;
- no screenshot evidence was fabricated or retained;
- `pipeline/review/ad-layout-finalization/` was not created merely to hold non-browser evidence;
- rendered Chrome/Edge scenarios are not claimed as passed;
- the milestone was released under the closeout instruction that explicitly permits source, static-output, test, build, and production-HTML verification to proceed when this bridge is unavailable;
- production verification was limited to non-JavaScript HTTP, generated HTML, and serving static assets, so no live AdSense status or creative-fill claim is made.

## Baseline placement inventory

Before this phase, full page families emitted five logical wrappers: header, left rail, right rail, post-header, and lower banner. CSS made only the header visible at ordinary widths and added 160 by 600 rails at 1,536 pixels. The post-header and lower placements remained hidden, and the supporting-square slot was configured but absent from full-page source.

The header used responsive-auto attributes. That allowed AdSense to choose a fluid height and was the direct cause of the reported oversized header surface. A raw `data-ad-status="filled"` or `unfill-optimized` value also moved the whole route to `adsense-present`, even if no non-zero Google-owned creative surface was visible. That could suppress fallbacks for empty or blocked outcomes.

The repository and history contain five authoritative external slot IDs. No sixth authoritative ID was found. The post-header logical position therefore deliberately reuses the header unit ID while retaining a unique logical wrapper and DOM identifier.

## Final six-position matrix

| Logical position | External slot ID | Format | Reserved geometry | Placement behavior |
| --- | --- | --- | --- | --- |
| Header banner | `5574432869` | Fixed | 300x50, 320x50, 468x60, or 728x90 | First child of the public main shell, below the complete header/navigation |
| Left rail | `5115981872` | Auto responsive | 300x600 | Page-anchored outside the content column on measured eligible ultra-wide layouts |
| Right rail | `9929324856` | Auto responsive | 300x600 | Page-anchored outside the content column on measured eligible ultra-wide layouts |
| Post-header banner | `5574432869` | Auto responsive | Responsive banner well | After the page heading and before primary content |
| Supporting square | `2489818539` | Auto responsive | 300x300 | Supporting-content break, never in a grid or action group |
| Lower banner | `5382861174` | Auto responsive | Responsive banner well | After supporting discovery/related content |

Full layouts emit `data-ad-layout-version="manual-six-v2"`. The position markers are `post-header`, `supporting-square`, and `lower-content`. The known client remains `ca-pub-4810616735714570` and all identifiers remain centralized in `src/lib/ads/config.ts`.

Condensed pagination retains three configured in-flow wrappers. Trust, policy, contact, sitemap, and 404 page families retain zero wrappers and zero fallbacks.

## Fixed header behavior

The header wrapper emits `data-ad-size-policy="fixed-header-v1"`. Its active width and height are written to data attributes and inline geometry before initialization:

- under 360 pixels: 300 by 50;
- 360 through 640 pixels: 320 by 50;
- 641 through 1,023 pixels: 468 by 60;
- 1,024 pixels and wider: 728 by 90.

The header `<ins>` omits `data-ad-format="auto"` and `data-full-width-responsive="true"`. All other positions preserve both attributes. Component-level clipping contains unexpected creative overflow without adding global page overflow masking. The header remains normal-flow, outside navigation landmarks, non-sticky, non-fixed, and non-overlay.

## Ultra-wide rails

Each rail emits `data-ad-rail`, `data-ad-rail-size="300x600"`, and reserves exactly 300 by 600 CSS pixels. Eligibility requires:

- viewport width at least 2,400 pixels;
- measured left and right gutters each at least 340 pixels, comprising 300 rail pixels, a 24-pixel content gap, and 16 pixels of outer safety;
- a full page layout that permits rails;
- normal slot eligibility, visibility, near-viewport, and duplicate-initialization checks.

The rails use page-anchored absolute positioning relative to the public page shell. They are intentionally not fixed or sticky. Official Google guidance warns against mirrored sticky desktop units; this implementation preserves both requested rail positions without adopting that prohibited pattern.

## In-flow placements

The post-header, supporting-square, and lower-banner wrappers now render on full home, gallery, page-one hub, and printable families. They remain absent from prohibited controls and surfaces:

- no unit is inside navigation, search, filters, pagination, gallery cards, printable actions, or dialogs;
- no unit is between printable artwork and Download PDF, Print, or image-download actions;
- the printable supporting square follows Related Collections and the lower banner follows the square;
- pagination remains the condensed three-position model;
- Privacy, Terms, Editorial Policy, Affiliate Disclosure, Contact, Sitemap, About, and 404 output contain no rendered ad unit or fallback.

## Placeholder presentation and stability

Fallbacks are neutral sibling elements rather than content inside `<ins>`. They contain only the `Advertisement` label and three restrained skeleton lines. They have:

- no link, button, call to action, fake advertiser, promotional copy, focusability, or pointer styling;
- the existing paper-soft surface, soft-plum border, approved radius, and approved typography tokens;
- fixed reserved dimensions inherited from the real slot;
- no shadow, gradient, transition, overlay positioning, or negative stacking trick;
- `hidden` and `aria-hidden="true"` while pending;
- print suppression.

The previous flash/false-suppression risk came from accepting raw status attributes as visible-fill proof. The revised system preserves reserved geometry while separating official status from visual creative evidence.

## Fill, optimized, failure, and fallback coordination

The official status source remains `data-ad-status`. `data-adsbygoogle-status` is not used as fill evidence.

A route enters terminal `adsense-present` only when an initialized slot has both:

1. official `filled` or `unfill-optimized` status; and
2. a visible, non-zero Google-managed iframe or equivalent AdSense-owned surface inside a visible unit.

Recognized Google-managed frame hosts are constrained to Google, DoubleClick, Google Ad Services, and Google Syndication suffixes. An empty iframe, a non-Google iframe, a hidden frame, or a zero-size frame is not accepted.

Raw blank `filled` and `unfill-optimized` outcomes do not globally suppress every fallback. A raw optimized or filled slot suppresses only its own sibling fallback, preventing a fallback from competing with an AdSense-owned slot while other eligible fallbacks can still appear. A late verified creative immediately changes the route to terminal `adsense-present` and hides every fallback.

Fallback can occur after:

- all initialized eligible units report unfilled;
- script request failure;
- initialization failure;
- the centralized 4-second script-availability grace period; or
- the existing 13-second unresolved-status timeout.

There is no forced fill, randomized retry, automatic reload, status manufacture, ad interaction, or duplicate script insertion. Route cleanup disconnects both mutation observers, the shared intersection observer, the resize observer, frame/unit observations, animation frames, timers, and event listeners. Stale route callbacks cannot change the new lifecycle.

## Official guidance and engineering decisions

Policy/implementation requirements were distinguished from layout recommendations:

- Google documents fixed-size display units and responsive size selection via CSS/media queries: [fixed-size display ads](https://support.google.com/adsense/answer/9185043) and [modifying responsive ad code](https://support.google.com/adsense/answer/9183363/how-to-modify-your-responsive-ad-code).
- Google documents `data-ad-status`, including `filled`, `unfilled`, and `unfill-optimized`, separately from AdSense processing attributes: [ad status parameter](https://support.google.com/adsense/answer/10762946).
- MutationObserver-based status handling and avoiding initially hidden real units follow that status guidance.
- Page-anchored rather than mirrored sticky rails follow the [AdSense FAQ and ad-placement guidance](https://support.google.com/adsense/answer/10734935).
- The precise six-position density, rail threshold, and fallback visual treatment are product/UX engineering recommendations, not assertions of Google approval or revenue performance.

## Static-output and performance evidence

Fresh baseline production build:

- command: `npx next build`
- result: pass
- static pages: 6,920
- duration: approximately 201.3 seconds

Closeout production build:

- `npm run build`: compile and TypeScript passed, then a Windows Next build worker exited during page-data collection with code 1 and no application error after 227.6 seconds;
- `npx next build`: passed using the established underlying production-build fallback in 244.6 seconds;
- static pages: 6,920;
- runtime printable records: 6,352
- protected record hash: `4fc394e39aa4d8e2b0e2e96ebbc586d00c91e5e18479748b72dbb6075e77bed6`

| Artifact | Before | After | Delta |
| --- | ---: | ---: | ---: |
| First-party JS, raw | 769,728 B | 772,892 B | +3,164 B |
| First-party JS, sum of per-file gzip | 235,423 B | 236,322 B | +899 B |
| Shared CSS, raw | 60,470 B | 60,992 B | +522 B |
| Shared CSS, gzip | 10,107 B | 10,220 B | +113 B |
| Homepage HTML, raw | 108,418 B | 113,347 B | +4,929 B |
| Homepage HTML, gzip | 15,923 B | 16,614 B | +691 B |

The additional JavaScript is the creative-evidence, measured-rail, and shared observer coordination. No dependency was added.

Static route inspection confirmed:

- home, gallery, page-one hub, and printable pages: six unique logical wrappers and the `manual-six-v2` marker;
- page-two hub: three logical wrappers;
- Privacy, Terms, Sitemap, About, Contact, Affiliate Disclosure, Editorial Policy, and 404: zero rendered wrappers;
- header fixed marker present and responsive-auto attributes absent from the header only;
- the header external ID is intentionally reused by post-header, with unique logical wrapper IDs;
- every other external ID matches the centralized five-ID configuration.

## Local browser QA matrix

The durable browser runner was extended for 390, 768, 1,024, 1,440, 1,920, 2,400, 2,560, and 3,440-pixel widths and for these deterministic scenarios:

- pending;
- all unfilled;
- raw filled with empty frame;
- verified filled with a visible Google-managed frame;
- raw blank optimized;
- verified optimized;
- late verified fill;
- script failure;
- unresolved timeout;
- measured rail eligibility and ineligibility;
- fixed-header dimensions;
- trust/404 exclusions;
- overflow, slot count, fallback count, duplicate script, and duplicate initialization.

The runner uses controlled DOM evidence and does not click ads. It was not executed because the browser-family integration was unavailable. Chrome and Edge are both Chromium-family coverage and would not constitute Firefox, WebKit, or Safari verification even if available. The release did not use a standalone automation substitute, install a browser, or click an ad.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run test:ad-fill-fallback` baseline | 16/16 pass |
| `npm run test:advertisements` baseline | 5/5 pass |
| `npm run test:ad-layout-finalization` | 19/19 pass |
| `node --test pipeline/tests/public-page-restructure.test.mjs` | 7/7 pass |
| `npm run test:trust-ads-readiness` | 12/12 pass |
| `npm run test:discovery-ux` | 12/12 pass |
| `npm run test:gallery-discovery-quality` | 8/8 pass |
| `npm run test:editorial-seo` | 27/27 pass |
| `npm run test:performance-accessibility` | 7/7 pass |
| `npm run test:export` | 19/19 pass, including default Letter byte identity and paper profiles |
| `npm run validate:static-routes` | pass; seven representative routes and invalid-route cases |
| `npm run validate:export-safety` | pass; 69,558 files scanned, 6,352 printables, zero ad-free-route findings |
| `npm run validate:refinement` | pass |
| `npm run validate:page-layout` | initially exposed a stale five-position expectation; strengthened to six full-layout positions and passed |
| `npm run typecheck` | pass in 13.6 seconds |
| `npm test` closeout | 195/195 pass in 344 seconds |
| `npm run build` closeout | compile and TypeScript passed; Windows build worker exited during page-data collection after 227.6 seconds |
| `npx next build` closeout | pass in 244.6 seconds; 6,920 static pages |
| `npm run validate:payload` legacy diagnostic | all checks pass except raw JavaScript: 772,892 B versus the pre-existing 753,081 B limit; not weakened or suppressed |
| `git diff --check` | pass; only Git line-ending notices |

The trust/readiness generator is technically passing but correctly remains not production-ready because owner/legal/CMP decisions recorded by that generator remain unresolved. Those blockers were not suppressed or reclassified.

## Protected contracts

Verification found no change to:

- 6,352 printable canonical routes, stable IDs, asset IDs, primary categories, hub membership, related IDs, sitemap membership, generated titles, or generated hub content;
- source images, public asset URLs, source filenames, or SVG exposure policy;
- Letter/A4 profiles, portrait/landscape/automatic orientation, scale percentages, shared export geometry, lossless `/FlateDecode`, default Letter byte identity, PDF/Print/PNG/JPG composition, or WebP artwork behavior;
- printable controls, navigation, search, gallery diversity, related scoring, trust copy meaning, canonical metadata, dependencies, package versions, Netlify configuration, environment configuration, Cloudflare, or other external services.

`public/ads.txt` remains exactly:

```text
google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0
```

It is 58 bytes, UTF-8 without BOM, contains one record, contains no `ca-` prefix, and survives the production build.

## Files changed

Application and configuration:

- `AGENTS.md`
- `app/page.tsx`
- `app/coloring-pages/page.tsx`
- `src/components/ads/AdRail.tsx`
- `src/components/ads/AdSenseRuntime.tsx`
- `src/components/ads/AdSlot.tsx`
- `src/components/coloring/HubPageContent.tsx`
- `src/components/coloring/PrintableDetailPage.tsx`
- `src/components/site/PublicPageShell.tsx`
- `src/lib/ads/config.ts`
- `src/lib/ads/creativeEvidence.ts`
- `src/lib/ads/layout.ts`
- `src/lib/ads/pageCoordinator.ts`
- `src/styles/components.css`

Tests, validators, durable QA, and generated readiness ownership:

- `package.json`
- `pipeline/scripts/ad-fill-fallback-browser-qa-runner.cjs`
- `pipeline/scripts/build-trust-ads-readiness.mjs`
- `pipeline/scripts/validate-export-safety.mjs`
- `pipeline/scripts/validate-public-page-layout.mjs`
- `pipeline/scripts/validate-refinement-contracts.mjs`
- `pipeline/tests/ad-fill-fallback.test.mjs`
- `pipeline/tests/advertisement-layout.test.mjs`
- `pipeline/tests/public-page-restructure.test.mjs`
- `pipeline/tests/site-quality-foundations.test.mjs`
- `pipeline/tests/trust-ads-readiness.test.mjs`
- `pipeline/manifests/trust-ads-readiness.json`
- `pipeline/reports/trust-ads-readiness.md`

Documentation:

- `reports/ad-mode-verification.md`
- `reports/correct-repo-ad-mode-verification.md`
- `reports/2026-08-ad-layout-finalization.md`

Generator noise in `reports/related-printable-quality.md`, `reports/related-printable-samples.csv`, and the crawl/image-sitemap validation manifest/report pairs was restored to the exact starting HEAD content. No generated media or browser evidence was added.

The ignored `.next/` and `out/` build directories remain on disk. Their resolved paths were verified to be inside the repository, but both approved PowerShell cleanup attempts were rejected by the host command policy before execution. They are absent from Git status and cannot enter a commit. No application server remains active; the only repository-working-directory Node process is the Codex browser-control worker itself and was not terminated.

## Commit, push, and deployment status

- implementation commit: `7dd931c983db2bbab9b5036d6776f03bdf8fdee0` (`fix: finalize manual AdSense layout`);
- push: `main` to `origin/main` succeeded from 22:55:21 through 22:55:24 EDT;
- divergence immediately after push: 0 ahead, 0 behind;
- no manual deployment command was run.

The required three-minute quiet period ended before the first production request. The rate-limited Netlify polling timeline was:

| Timestamp (EDT) | HTTP | Marker |
| --- | ---: | --- |
| 22:58:39 | 200 | absent |
| 22:59:55 | 200 | absent |
| 23:01:09 | 200 | present |

The first `data-ad-layout-version="manual-six-v2"` marker appeared at 23:01:09 EDT, 5 minutes 45 seconds after the push completed. The published CSS fingerprint changed to `/_next/static/chunks/11snkc0e7i8jc.css`; the AdSense runtime is served in `/_next/static/chunks/05tx-n.zis..x.js`.

Production HTML and static-asset verification on `/coloring-pages/animals` confirmed:

- HTTP 200 and exactly one `manual-six-v2` deployment marker;
- six unique logical wrappers: header, left rail, right rail, post-header, supporting square, and lower content;
- six live `<ins>` units using the five expected external IDs, with the deliberate header/post-header reuse of `5574432869`;
- one fixed-header marker using `5574432869`, without `data-ad-format` or `data-full-width-responsive`;
- two `300x600` rail markers and zero duplicate DOM IDs;
- one centralized AdSense script URL literal in one serving JavaScript asset and no duplicated server-rendered external script tag;
- new JavaScript and CSS assets returned HTTP 200;
- Privacy, Terms, Editorial Policy, Affiliate Disclosure, Contact, Sitemap, and 404 returned no rendered ad wrapper or live unit;
- `/ads.txt` returned HTTP 200 as `text/plain`, exactly 58 UTF-8 bytes without BOM, HTML, duplicate records, or a `ca-` seller prefix.

No JavaScript-enabled production page was opened because the supported bridge remained unavailable. Therefore rendered dimensions, live `data-ad-status` values, creative-iframe evidence, network-level AdSense request outcomes, console output, and visible fallback counts are not claimed.

## Remaining checks

1. With an authorized supported browser bridge, run `npm run qa:ad-layout-finalization` and capture the required widths and blocked/fill/optimized/late-fill scenarios under `pipeline/review/ad-layout-finalization/`.
2. Confirm rendered 2,400-pixel boundary measurements, 3,440-pixel two-rail geometry, header height at every breakpoint, zero overlap/overflow, stable 30-second blocked fallbacks, and zero units on prohibited routes.
3. Perform one controlled live AdSense check without clicking an ad, recording official `data-ad-status`, creative-iframe evidence, network results, console errors, and visible fallback count.
4. Run Firefox, Playwright WebKit, real Safari, and representative-device checks separately; Chrome and Edge alone are Chromium coverage.

No ad was clicked. No force push, manual deployment, dependency addition, environment variable, Netlify configuration change, Cloudflare change, or external-service modification occurred.
