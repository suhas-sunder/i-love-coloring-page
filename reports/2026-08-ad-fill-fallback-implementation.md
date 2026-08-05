# AdSense Fill and Fallback Coordination Implementation

Date: August 4, 2026

## Outcome

Eligible content pages now use one environment-independent AdSense path. Every approved placement server-renders the configured real `<ins class="adsbygoogle">` unit and an initially hidden, noninteractive fallback sibling. A route-scoped coordinator uses the official `data-ad-status` attribute to decide whether all approved fallbacks may appear or must remain hidden.

The implementation uses the required deployment marker `data-ad-fallback-policy="page-all-or-none-v1"`. One `filled` or `unfill-optimized` unit switches the route lifecycle to terminal `adsense-present`, which hides every fallback on the page. All initialized units reporting `unfilled`, a script or initialization failure, or one 13-second centralized timeout may switch the page to `fallback`. A late fill immediately overrides fallback and fallbacks cannot return during that route lifecycle.

This implementation does not certify AdSense account approval, regional-policy compliance, a creative fill, or legal compliance.

## Starting state

- Branch: `main`
- Starting HEAD: `493905da3e3fb4b4935f2b24e9c37e4d36cef53e`
- Upstream: `origin/main`
- Starting divergence: 0 ahead, 0 behind
- Starting working tree: clean
- Latest starting milestone: `feat: add printable paper profile foundation`
- The requested `reports/2026-08-automatic-ad-mode-fix.md` was absent from the working tree and Git history. The active `reports/ad-mode-verification.md` and `reports/correct-repo-ad-mode-verification.md` were reviewed instead.

## Paper-profile milestone preservation

The paper-profile and export implementation was not edited. The following remain byte-for-byte identical to the starting commit:

- `src/lib/coloring/exportComposition.ts`
- `src/lib/coloring/browserDownloads.ts`
- `pipeline/tests/export-composition.test.mjs`
- `pipeline/tests/fixtures/printable-paper-profile-baseline.json`

`npm run test:export` passes 19/19. Letter and A4 profiles, portrait and landscape geometry, automatic orientation, 100/90/75/50 percent scaling, default Letter byte equivalence, `/FlateDecode`, PDF/Print sharing, PNG/JPG page composition, and artwork-only WebP remain unchanged.

## Previous advertising architecture

The prior `src/lib/ads/mode.ts` selected placeholder markup outside production and live markup in production by reading `process.env.NODE_ENV`. `AdSlot` emitted either placeholder-only markup or a real unit. This meant local development, tests, and production did not exercise the same DOM or runtime path. It also could not coordinate page-wide fallbacks after official AdSense fill results.

The prior runtime already contained useful protections retained here: centralized slot configuration, page-family eligibility, breakpoint eligibility, actual-visibility checks, a 400-pixel near-viewport threshold, one `data-ad-initialized` marker, one stable external-script ID, a `MutationObserver` for route content, and `IntersectionObserver` cleanup.

## Removed runtime and environment modes

- Deleted `src/lib/ads/mode.ts`.
- Removed `AdMode`, `AdRuntimeEnvironment`, and `ResolvedAdMode`.
- Removed every advertising branch that reads `NODE_ENV`.
- Removed the development/test placeholder branch and production live branch.
- Kept no custom advertising environment variable or replacement switch.
- Updated active verification documentation and the Netlify comment; no Netlify directive or deployment behavior changed.
- Historical round evidence remains historical, with the active August report explicitly marking its old mode section as superseded.

## Page state machine

`src/lib/ads/pageCoordinator.ts` owns the deterministic state model:

| State | Meaning | Fallback visibility |
| --- | --- | --- |
| `pending` | Initialized units are unresolved | Hidden |
| `fallback` | Zero present units and all initialized units are unfilled, or failure/timeout occurred | Visible only at approved, responsive placements |
| `adsense-present` | At least one unit is `filled` or `unfill-optimized` | Hidden globally and terminal for the route |

The coordinator tracks each initialized unit by logical slot ID. Duplicate registration is rejected. Unknown or absent status remains pending. A disposed coordinator ignores stale status, failure, and timeout callbacks.

## Registration and initialization behavior

- `AdSenseRuntime` keys its effect to `usePathname()`, so a client-side route begins with a new coordinator.
- Cleanup marks the old lifecycle inactive, cancels the timer, removes script listeners, disconnects both mutation observers and the intersection observer, clears the observed set, disposes the coordinator, removes the page-state attribute, and hides remaining fallbacks.
- Only page-family, breakpoint, configuration, visibility, near-viewport, and not-already-initialized decisions can initialize a unit.
- Hidden responsive alternatives are observed for future visibility but never registered in page state until they actually initialize.
- Successful initialization marks the element once, registers the logical slot once, starts the single route timeout once, ensures one script, and calls `adsbygoogle.push({})` once.
- Script insertion has one stable `adsense-runtime` ID. Load and error listeners are attached before a newly created script is inserted.
- No retry, reload, forced fill, polling of Google endpoints, or manufactured production status exists.

## Official status handling

The implementation follows Google’s [Ad status parameter documentation](https://support.google.com/adsense/answer/10762946?hl=en): AdSense adds `data-ad-status` after an ad request; `filled`, `unfilled`, and `unfill-optimized` have distinct meanings; `data-adsbygoogle-status` indicates processing and is not fill evidence; and `MutationObserver` can react to status changes. The real `<ins>` is not initially hidden, consistent with Google’s warning that initially hidden units may not execute an ad request.

- `filled`: enter terminal `adsense-present`.
- `unfill-optimized`: enter terminal `adsense-present` for fallback-suppression purposes; this is not reported as a paid fill.
- `unfilled`: contributes to all-initialized-unfilled fallback eligibility.
- Unknown or absent value: remain unresolved.
- `data-adsbygoogle-status`: never read as fill evidence.

## Late-fill, failure, and timeout behavior

- A late `filled` or `unfill-optimized` mutation transitions `fallback` to terminal `adsense-present`.
- A later `unfilled` result cannot restore fallback after AdSense is present.
- Script error and initialization exception may transition to fallback while no present result exists.
- Unresolved units transition to fallback after `AD_FALLBACK_TIMEOUT_MS = 13_000`, measured from the first eligible initialization.
- The timeout is cleared after fallback or AdSense presence and on route cleanup.
- Initialized units remain observed after fallback so a late official result still wins.

## CSS immediate suppression and all-or-none fallback

Every approved wrapper contains sibling real and fallback elements. The fallback is initially `hidden`, has no link, button, tab stop, advertiser imitation, promotional text, or call to action. It uses approved tokens and remains hidden in print through the existing ad-slot rule.

Immediate sibling safety suppresses a fallback for `filled` and `unfill-optimized` units before the page-level observer callback runs. The global `[data-ad-page-state="adsense-present"]` rule suppresses all fallbacks with `display: none !important`. Fallbacks use no opacity trick, overlay, absolute/fixed/sticky positioning, or negative stacking. In fallback state the unresolved/unfilled real surface is hidden rather than overlapped; late status mutations remain observed.

The header, side-rail, square, and lower placement inventory is unchanged. The currently accepted visual density remains one header allocation through 1,535 pixels and header plus left/right rails at safe wide-desktop widths. Paginated hubs remain condensed with no rails. Trust, Sitemap, and 404 routes retain zero units and zero fallbacks.

## Files changed

Application and configuration ownership:

- `src/components/ads/AdSlot.tsx`
- `src/components/ads/AdSenseScript.tsx`
- `src/components/ads/AdSenseRuntime.tsx`
- `src/lib/ads/pageCoordinator.ts` (new)
- `src/lib/ads/mode.ts` (removed)
- `src/lib/ads/types.ts`
- `src/styles/components.css`
- `netlify.toml` (comment only; no directive changed)
- `AGENTS.md` (active contract clarification)

Tests, validation, QA, and scripts:

- `pipeline/tests/ad-fill-fallback.test.mjs` (new)
- `pipeline/tests/advertisement-layout.test.mjs`
- `pipeline/tests/site-quality-foundations.test.mjs`
- `pipeline/tests/trust-ads-readiness.test.mjs`
- `pipeline/tests/printable-content-quality.test.mjs`
- `pipeline/scripts/ad-fill-fallback-browser-qa-runner.cjs` (new)
- `pipeline/scripts/build-trust-ads-readiness.mjs`
- `pipeline/scripts/validate-public-page-layout.mjs`
- `pipeline/scripts/validate-refinement-contracts.mjs`
- `package.json` (scripts only; no dependency changed)

Updated existing active documentation and generated readiness artifacts:

- `reports/2026-08-ads-trust-readiness-implementation.md`
- `reports/ad-mode-verification.md`
- `reports/correct-repo-ad-mode-verification.md`
- `reports/final-production-configuration.md`
- `reports/production-readiness-status.md`
- `pipeline/manifests/trust-ads-readiness.json`
- `pipeline/reports/trust-ads-readiness.md`
- `reports/2026-08-ad-fill-fallback-implementation.md` (new; this report)

## Local browser QA

The deterministic runner used the real static export and installed Chrome `150.0.7871.187` and Edge `151.0.4129.59`. Both are Chromium-based. It intercepted only the external AdSense script and injected controlled official status attributes; it did not add a production query parameter, fake creative, public switch, environment variable, or ad click.

| Coverage | Result |
| --- | --- |
| Eight routes x five widths x two browsers, all unfilled | 80/80 pass |
| One filled | Both pass; state present, zero visible fallbacks |
| One optimized | Both pass; state present, zero visible fallbacks |
| Late fill after fallback | Both pass; all fallbacks disappear and do not return |
| Script failure | Both pass; one responsive fallback, one script element, usable page |
| Pending timeout then late fill | Both pass; hidden while pending, fallback after 13 seconds, hidden after late fill |
| Client navigation reset and stale mutation | Both pass; new route starts pending, old callback cannot update it |

The route matrix covers Home, gallery, Animals, Animals page 2, a printable detail, Privacy, Terms, and 404 at widths 390, 768, 1024, 1440, and 1920. It verified zero horizontal overflow, zero live/fallback overlap, zero clickable fallback, zero duplicate logical initialization, zero fake iframe, and correct one-versus-three visible fallback density. Trust and 404 routes contained neither units nor fallbacks.

Compact local evidence is stored under `pipeline/review/ad-fill-fallback/`:

- `browser-qa-results.json`
- `chrome-390-all-unfilled.png`
- `chrome-1920-all-unfilled.png`
- `chrome-1440-late-fill-final.png`
- `production-chrome-1440.png`

The evidence directory remains ignored under the repository’s generated-review-media policy.

## Tests and build results

Starting focused baselines passed: advertisement layout 5/5, site foundations 9/9, trust/readiness 12/12, and export 19/19.

Final local results before commit:

- `npm run test:ad-fill-fallback`: pass, 16/16.
- `npm run test:trust-ads-readiness`: pass, 12/12.
- `npm run test:discovery-ux`: pass, 12/12.
- `npm run test:gallery-discovery-quality`: pass, 8/8.
- `npm run test:editorial-seo`: pass, 27/27.
- `npm run test:performance-accessibility`: pass, 7/7.
- `npm run test:printable-content`: pass, 8/8.
- `npm run test:export`: pass, 19/19.
- `npm run test:route-preservation`: pass, 1/1.
- `npm run typecheck`: pass.
- `npm test`: pass, 192/192 in 223.4 seconds.
- `npx next build`: pass, 6,920/6,920 static pages in 337.7 seconds.
- `npm run build`: pass, all approved generators, 6,920/6,920 static pages, trust readiness, and punctuation audit in 391.2 seconds.
- `npm run validate:page-layout`: pass, nine page families.
- `npm run validate:refinement`: pass.
- `npm run validate:static-routes`: pass, seven representative routes and eight invalid forms.
- `npm run validate:crawl`: pass, 6,352 printables, 6,520 sitemap URLs, 362 pagination routes, and zero canonical or link findings.
- `npm run validate:image-sitemap`: pass.
- `npm run validate:accessibility`: pass, four printable pages and all source checks.
- `npm run qa:ad-fill-fallback -- --base-url http://127.0.0.1:3013`: pass, 80/80 matrix checks and all scenarios.

An extra non-required `npm run validate:payload` diagnostic remains red at 769,728 aggregate raw JavaScript bytes versus its 753,081 raw-total cap. The pre-task retained readiness manifest already reported 762,184 bytes, which exceeded the same cap before this milestone. Required route-level gzip budgets in `test:performance-accessibility` pass. The legacy cap was not weakened and no necessary coordinator behavior was hidden from measurement.

The final retained-tree rerun passed `validate:page-layout`, `validate:refinement`, `validate:static-routes`, `validate:crawl`, `typecheck`, `test:export` (19/19), and `git diff --check`.

## Protected contracts

A before/after projection across asset ID, stable ID, canonical path and slug, primary category and hub, all hub IDs, related printable and hub IDs, WebP path, and internal SVG path for all 6,352 runtime printables produced identical SHA-256 hashes:

`fafd3862d4873fb04dbdbefd32fbd0d995a85f9c98ad5c289334c6f462eab9cc`

No protected path changed: runtime printables, runtime hubs, runtime route inventory, runtime sitemap inventory, image sitemap data, paper-profile source, browser download source, export tests and fixture, `public/ads.txt`, and `package-lock.json` all match the starting commit.

`public/ads.txt` and `out/ads.txt` are 58-byte UTF-8 text without BOM and contain exactly:

`google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0`

There is one line, no duplicate, no HTML, and no `ca-` prefix. Exported robots references the regular and image sitemaps and does not block `/ads.txt`.

## Commit, push, and production verification

The implementation was committed as `cfbf8dfc86c2523e03cf9bae77f03e6cb7d1c2b3` with message `fix: coordinate AdSense fill and fallback placeholders` and pushed normally from `main` to `origin/main`. The push advanced the remote from `493905da3e3fb4b4935f2b24e9c37e4d36cef53e` and left local/upstream divergence at 0/0. No force push or deployment command was used.

### Netlify automatic deployment

The synchronized-push timestamp was 2026-08-05 00:51:36 EDT. No production request was made during the following three full minutes. Polling then used cache-bypassed HTML requests with JavaScript disabled and stopped as soon as the required marker appeared.

| Poll | Timestamp (EDT) | HTTP | Marker | HTML bytes | Evidence |
| ---: | --- | ---: | --- | ---: | --- |
| 1 | 2026-08-05 00:55:09 | 200 | absent | 189,646 | Cloudflare response, age 1; prior asset set |
| 2 | 2026-08-05 00:56:23 | 200 | present | 191,751 | Cloudflare response, age 0; new asset set including `/_next/static/chunks/0pqt~8bl3ukh4.js` |

The marker first appeared 1 minute 14 seconds after polling began and 4 minutes 47 seconds after the recorded push/synchronization check. At 00:56:31 EDT, `/build-revision.json` returned HTTP 200 with production revision `cfbf8dfc86c2523e03cf9bae77f03e6cb7d1c2b3`, branch `main`, and runtime-data hash `d916a37223dc9bcf329c599402302146ef1726561fa5029066766f627f6da5b9`.

### Controlled live Chrome result

One installed Chrome `150.0.7871.187` load was made at 1440 x 1000 on `https://www.ilovecoloringpage.com/coloring-pages/animals`, from 00:57:45 through 00:58:16 EDT. JavaScript was enabled. There was no request interception, blocker, status injection, fake creative, reload, scrolling loop, route cycling, or ad click.

- Navigation returned HTTP 200.
- Five configured wrappers carried `data-ad-fallback-policy="page-all-or-none-v1"`.
- Exactly one external AdSense script existed, using `ca-pub-4810616735714570`; its request returned HTTP 200 and its runtime load state was `loaded`.
- The managed AdSense script, lookup document, and both ad document requests returned HTTP 200. AdSense ping and SODAR requests returned HTTP 204. One ping also surfaced as `ERR_ABORTED` when the browser context closed after evidence capture; it had already returned 204 and caused no page error.
- No relevant console or duplicate-initialization error was recorded.
- The header unit was the only configured unit initialized in the unchanged initial viewport. It reported official `data-ad-status="unfilled"` and diagnostic-only `data-adsbygoogle-status="done"`.
- The two 1440-pixel-hidden rail units and the two below-fold units were not initialized and retained no official status.
- Configured-unit totals were: filled 0, optimized 0, unfilled 1, unresolved/uninitialized 4.
- Page state was `fallback`; exactly one fallback was visible, none was clickable, live/fallback overlap was zero, and horizontal overflow was false.
- AdSense inserted one managed iframe element during the unfilled request, but no paid creative fill occurred: the authoritative configured unit status was `unfilled`, its displayed live surface was 0 x 0 in fallback state, and no claim of a creative fill is made.
- The visible result is captured at `pipeline/review/ad-fill-fallback/production-chrome-1440.png`; it shows the neutral header fallback below navigation, above content, with no overlap.

| Logical slot | External slot | Initialized | Official `data-ad-status` | Diagnostic processing status | Fallback visible |
| --- | --- | --- | --- | --- | --- |
| `hub-header-banner` | `5574432869` | yes | `unfilled` | `done` | yes |
| `rail-left-desktop` | `5115981872` | no | unresolved | absent | no |
| `rail-right-desktop` | `9929324856` | no | unresolved | absent | no |
| `hub-post-header-banner` | `5574432869` | no | unresolved | absent | no |
| `hub-lower-content` | `5382861174` | no | unresolved | absent | no |

This production observation is the all-unfilled outcome for the one initialized eligible unit, not evidence of an AdSense account fill. The repository integration, status observation, and fallback presentation worked as designed during the controlled check.

## Remaining limitations and external decisions

- AdSense account approval, serving eligibility, policy review, consent, personalization, child-directed/mixed-audience treatment, and regional behavior remain external owner/qualified-review responsibilities.
- Local deterministic statuses prove repository coordination, not Google account fill behavior.
- Firefox, Playwright WebKit, real Safari/iOS, physical mobile, assistive technology, and field layout-shift checks remain manual.
- No AdSense account, consent platform, Netlify dashboard, Cloudflare, DNS, analytics, or external service was modified.
- No environment variable, dependency, package version, route, title, hub content, taxonomy, sitemap membership, source image, public asset path, printable control, or printable output was changed.
