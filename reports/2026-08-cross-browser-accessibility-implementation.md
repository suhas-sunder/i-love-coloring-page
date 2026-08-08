# Cross-browser accessibility implementation

Date: 2026-08-07
Repository: `suhas-sunder/i-love-coloring-page`

## 1. Starting state and no-op review

- Branch: `main`
- Starting HEAD: `88bcf654783d0ee2ae2842d5b5661113105b986d`
- Upstream: `origin/main`
- Starting status: clean; `0` ahead and `0` behind.
- The existing reports, QA scripts, and recent history were checked before implementation. No prior milestone provided the requested four-engine, keyboard, touch, reflow, download, and print-style matrix, so this was not a no-op milestone.
- The existing navigation, gallery, printable paper profiles, exports, AdSense coordination/layout, editorial data, performance budgets, and release gate were treated as protected contracts.

## 2. Files changed

Implementation commit `ca10d8fe6293e08915f33ba6609ef8a8ee8b573f` contains only:

- `package.json`
- `pipeline/scripts/cross-browser-accessibility-browser-qa-runner.cjs`
- `pipeline/tests/cross-browser-accessibility.test.mjs`
- `src/components/site/GlobalSearchDialog.tsx`
- `src/components/site/MobileNav.tsx`
- `src/styles/components.css`

Corrective commit `b3215a9bae8790b49841222cfa0fedd845597cfb` contains only:

- `pipeline/scripts/cross-browser-accessibility-browser-qa-runner.cjs`
- `pipeline/tests/cross-browser-accessibility.test.mjs`
- `src/styles/components.css`

This documentation/evidence milestone adds:

- `reports/2026-08-cross-browser-accessibility-implementation.md`
- `pipeline/review/cross-browser-accessibility/browser-qa-results.json`
- Eight compact screenshots listed in section 10.

No dependency, lockfile, workflow, Netlify, advertising, generated-content, route, taxonomy, sitemap, source-image, or printable-output file changed.

## 3. Browser inventory and methods

| Browser | Engine | Version exercised | Method | Result |
| --- | --- | ---: | --- | --- |
| Google Chrome | Blink | 151.0.7922.76 | Installed channel controlled by existing Playwright | Pass |
| Microsoft Edge | Blink | 151.0.4129.72 | Installed channel controlled by existing Playwright | Pass |
| Firefox | Gecko | 150.0.2 | Existing Playwright-managed binary | Pass |
| Firefox retail install | Gecko | 153.0.3 | Inventoried; its protocol was not compatible with the installed Playwright driver | Not used for automation |
| Playwright WebKit | WebKit | 26.4 | Existing locally available Playwright WebKit binary | Pass |
| Safari/iOS Safari | WebKit | Not available on Windows | No false claim of real Safari or iOS coverage | Manual gate |

Chrome and Edge are both Chromium/Blink coverage; they are not independent rendering engines. Playwright WebKit is useful WebKit coverage but is not a test on Apple Safari hardware. The in-app Chromium browser was also used for a bounded local semantic/search-dialog smoke.

## 4. Routes and viewport matrix

The deterministic runner exercised 12 routes at 10 CSS widths in each of four automated browsers: `480` route/viewport checks total (`120` per browser).

Routes:

- `/`
- `/coloring-pages`
- `/coloring-pages/animals`
- `/coloring-pages/christmas`
- `/coloring-pages/lotus`
- `/coloring-pages/animals/page/16`
- `/coloring-pages/plushies/page/36`
- `/printables/animals/animals-alligator-4feec8505a`
- `/privacy`
- `/terms`
- `/sitemap`
- `/404`

Widths: `320`, `390`, `480`, `768`, `1024`, `1280`, `1440`, `1920`, `2400`, and `3440` CSS pixels.

Real generated pages and the approved local R2 media bundle were used; ad-network requests were blocked so the QA run did not manufacture impressions or click ads.

## 5. Compatibility defects reproduced

Four concrete defects were reproduced before application changes:

1. Resizing from the open mobile navigation to desktop could leave the portal, inert state, and body scroll lock active.
2. Several normal navigation and related-link variants explicitly suppressed outlines, and their forced-colors focus treatment was insufficient.
3. Long trust-page links produced about `100px` of horizontal overflow at 200% text enlargement.
4. Browser page printing leaked the site header, footer, controls, and advertising wells.

A Firefox-only race was then found during the new suite: the lazy global-search portal could mount after the modal-focus hook ran, leaving focus on `body`. Final WebKit verification also found a long printable title whose intrinsic width could overflow a two-column card at 390px with 200% text enlargement. A runner-only defect could leave the local static server waiting on persistent HTTP connections after browser work completed.

## 6. Application corrections

- `MobileNav` now observes the existing desktop breakpoint with `matchMedia`. A transition to desktop closes the mobile dialog, releases inert/body-lock state, restores focus to the brand, and removes the listener during cleanup.
- `GlobalSearchDialog` now activates the existing modal-focus hook only after the lazy portal is mounted, eliminating the Gecko focus race without changing successful Blink behavior.
- Normal navigation and related links retain explicit visible focus rings. Forced-colors mode uses a `CanvasText` outline rather than suppressing focus.
- Trust-page links use local wrapping so long URLs reflow without a global overflow mask.
- Printable card titles explicitly permit intrinsic shrinking and anywhere wrapping, preserving long scientific, cultural, and fantasy names at enlarged text sizes in WebKit without changing the two-column mobile layout.
- Print CSS removes application chrome, ads, dialogs, controls, and buttons, removes page-shell padding, and keeps printable content in a reachable single-column flow.
- The browser-QA server now closes remaining connections during teardown; the final run exited normally and left zero runner-owned processes.

No browser-sniffing branch or compatibility framework was added.

## 7. CSS compatibility findings

- Current CSS custom-property checks pass; no unresolved token was introduced.
- The fixes use existing focus-width/offset and design tokens. `CanvasText` is used only in the forced-colors override.
- No global `overflow-x: hidden`, fixed overlay workaround, negative z-index, gradient, shadow, arbitrary palette value, or reduced focus treatment was added.
- Print rules are confined to `@media print`; the screen layout and approved advertising layout are unchanged.

## 8. Navigation, keyboard, and focus

All four automated browsers passed the keyboard journey:

- desktop Categories/Seasonal disclosure activation, mutual exclusion, Escape dismissal, Tab progression, and focus restoration;
- mobile-navigation open, traversal, Escape/Close, resize-to-desktop cleanup, and focus restoration;
- search open, initial input focus, result traversal, Escape dismissal, and focus restoration;
- gallery filters, Show More/pagination, card links, card Print, printable actions, download menu, print preview, and related links.

The focus scan found visible indicators on every sampled visible interactive element: Chrome `43`, Edge `43`, Firefox `40`, and WebKit `16`. WebKit headless required the runner's focusability fallback for disclosure descendants because its keyboard preference differs from desktop Safari settings; it did not require an application workaround. No hidden focused element, duplicate ID, keyboard trap, focus-behind-modal state, or lost post-download focus was accepted.

## 9. Touch, reflow, text enlargement, and orientation

- Touch/pointer journey: `4/4` browser suites passed. Mobile navigation, search, filter, card, Show More, printable, and dialog targets remained operable; the card Print control was not reduced.
- Reflow: `36` checks per browser passed at effective 100%, 125%, 150%, 200%, 300%, and 400% CSS-width equivalents.
- Text enlargement: `12` checks per browser passed at 100%, 150%, and 200% text size.
- No tested route had horizontal page overflow at 320 CSS pixels or enlarged text after the trust-link correction.
- Portrait/landscape simulation passed in every engine. This is viewport resize simulation, not physical iOS rotation.

## 10. Accessibility tree, semantics, and evidence

Semantic snapshots confirmed one visible H1, useful landmarks, native links/buttons, named dialogs, valid expanded/control relationships, useful image alternatives, and link/button separation on representative home, gallery, printable, trust, sitemap, and 404 routes. The screen-reader-oriented audit found no duplicate IDs, nameless sampled controls, invalid dialog labelling, or nested interactive control regression.

Compact retained evidence:

- `pipeline/review/cross-browser-accessibility/browser-qa-results.json`
- `pipeline/review/cross-browser-accessibility/chrome-home-320.png`
- `pipeline/review/cross-browser-accessibility/chrome-forced-colors-focus.png`
- `pipeline/review/cross-browser-accessibility/edge-animals-3440.png`
- `pipeline/review/cross-browser-accessibility/edge-forced-colors-focus.png`
- `pipeline/review/cross-browser-accessibility/firefox-gallery-390.png`
- `pipeline/review/cross-browser-accessibility/firefox-printable-1440.png`
- `pipeline/review/cross-browser-accessibility/webkit-christmas-768.png`
- `pipeline/review/cross-browser-accessibility/webkit-printable-390.png`

No browser profiles, caches, downloads, server logs, or build output are retained.

## 11. Live regions and dynamic status

Search results/no-results, filter/Show More changes, PDF/Print preparation, direct-download success/failure, and image-download status were exercised against the existing live regions. All four engines passed. The suite verifies that meaningful state is announced without adding noisy announcements for ordinary visual changes. Error/success meaning is not color-only.

## 12. Reduced motion, forced colors, and contrast

- Reduced-motion checks passed in Chrome, Edge, Firefox, and WebKit. Navigation-chevron and dialog/reveal transitions retain state changes while nonessential motion is removed.
- Forced-colors emulation passed in installed Chrome and Edge, including a visible `3px` system-color focus outline. Firefox/WebKit forced-colors emulation was unavailable and is not claimed.
- The existing approved token combinations remained within the project's automated contrast checks. Automated checks are evidence, not a claim of complete WCAG 2.2 AA conformance or legal certification.

## 13. Print CSS and print handoff

Print CSS checks passed for home, Privacy, and the representative printable in all engines: headers, footers, ad wells, dialogs, and application buttons are absent from browser-page print styling while main content remains present. Printable layout becomes one column. The printable preview dialog and its Print/Close handoff remained available in all four engines. The native OS print dialog and a physical printer were not inspected.

## 14. Download and cleanup results

PDF, repeated PDF, PNG, JPG, and WebP downloads succeeded in each engine with deterministic filenames, correct signatures, no navigation, and complete lifecycle cleanup (`5` object URLs created, `5` revoked, `0` active, `0` temporary anchors per engine).

| Engine | PDF bytes | PNG bytes | JPG bytes | WebP bytes |
| --- | ---: | ---: | ---: | ---: |
| Chrome | 613,584 | 1,404,823 | 1,238,249 | 389,232 |
| Edge | 613,584 | 1,404,823 | 1,238,249 | 389,232 |
| Firefox | 600,964 | 1,588,974 | 1,375,986 | 388,704 |
| WebKit | 578,193 | 1,003,356 | 1,239,072 | 389,170 |

Rasterized bytes vary by browser encoder. Format semantics, filenames, PDF structure, cleanup, and UI behavior were consistent. The protected deterministic default fixture remains exactly `613,584` bytes in the authoritative export test.

## 15. Image scrolling, fonts, inputs, and orientation

- Full-scroll checks on Animals, Christmas, and Plushies page 36 found zero broken images and zero collapsed cards in every engine.
- Font-failure simulation at 320, 390, and 1280 pixels on home, gallery, and printable routes produced zero horizontal overflow and zero clipped controls. Fraunces/Figtree configuration was not changed.
- Search and other form inputs retained labels, native semantics, keyboard operation, touch operation, and useful focus indication.
- Orientation resize simulation passed; real iOS rotation remains manual.

## 16. Test-only coverage added

`pipeline/tests/cross-browser-accessibility.test.mjs` adds eight deterministic source/static contracts for mobile breakpoint cleanup, mounted-dialog focus, focus-ring preservation, forced-colors behavior, trust-link wrapping, print cleanup, QA matrix breadth, and package-script wiring.

`pipeline/scripts/cross-browser-accessibility-browser-qa-runner.cjs` is durable QA tooling. It inventories supported engines, starts/stops an isolated static server, intercepts only local test media/ad requests, exercises the full matrix, captures compact evidence, closes persistent server connections, and exits non-zero on regression. It does not add a production test switch or public route.

## 17. Performance before and after

All accepted budgets pass before and after. The application corrections add only the small mobile breakpoint effect and CSS rules.

| Route/artifact | Before gzip | After gzip | Delta |
| --- | ---: | ---: | ---: |
| Home first-party JS | 200,637 B | 200,723 B | +86 B |
| Gallery first-party JS | 203,624 B | 203,710 B | +86 B |
| Hub first-party JS | 204,369 B | 204,455 B | +86 B |
| Printable first-party JS | 199,595 B | 199,681 B | +86 B |
| Shared CSS | 10,168 B | 10,303 B | +135 B |

Above-fold image bytes were unchanged. Maximum observed lab CLS was `0.0916173193359375`; maximum observed interaction long task was `0ms`. These are local desktop lab measurements, not production field p75 data. The separate historical aggregate raw-JavaScript diagnostic remains over its older non-accepted diagnostic limit (`768,504` versus `753,081` bytes); accepted route-level gzip budgets pass and were not weakened.

## 18. Focused and full verification

- Cross-browser accessibility focused tests: `8/8` pass.
- Visual polish: `3/3` pass.
- Production resilience: `37/37` pass.
- Navigation: `12/12` pass.
- Gallery/discovery: `8/8` pass.
- Performance/accessibility: `7/7` pass.
- Printable/ad flow: `64/64` pass.
- Export: `22/22` pass.
- Ad layout: `19/19` pass.
- Internal-link unit: `5/5` pass.
- Crawl: `8/8` pass.
- Image sitemap: `4/4` pass.
- Client bundle: `5/5` pass.
- Release-gate unit tests: `17/17` pass.
- Full `npm test`: `262/262` pass in `215.97s`.
- `npm run typecheck`: pass.
- Fresh production build: pass; `6,920` static pages.
- `git diff --check`: pass.

## 19. Export and protected contracts

- `npm run test:export`: `22/22` pass.
- Default Letter portrait PDF byte identity: pass at `613,584` bytes.
- PDF remains one-page lossless `/FlateDecode`; paper profiles, geometry, filenames, metadata, PNG/JPG composition, and WebP artwork behavior are unchanged.
- Protected runtime printables: `6,352` unchanged.
- Protected hash: `4fc394e39aa4d8e2b0e2e96ebbc586d00c91e5e18479748b72dbb6075e77bed6`.
- Internal-link validation: `6,916` HTML nodes, `6,882` indexable nodes, `334,452` static edges (`214,370` unique), zero broken/orphan/dead-end/noncanonical/client-only findings.
- Export safety: `69,561` files scanned, zero prohibited-route ad findings.
- Advertising/trust regression tests pass; publisher/slot configuration and layouts are unchanged.
- `/ads.txt` remains the exact authorized 58-byte UTF-8 record with no BOM or duplicate.

## 20. Authoritative release gate

The first strict invocation correctly refused the dirty implementation worktree. After reviewing the retained diff and restoring only unrelated generated diagnostic noise, the authorized dirty-worktree verification was run:

`npm run verify:release -- --allow-dirty`

Initial implementation result: pass in `773.350s`.

Final corrective result: pass in `746.692s`. Every required stage passed: preflight, typecheck, build, full tests, static routes, accessibility, crawl, internal links, image sitemap, export safety, page layout, refinement, punctuation, accepted payload budgets, client bundle, technical readiness, protected contracts, and cleanliness. The historical aggregate raw-JavaScript diagnostic and external owner-readiness diagnostic were reported separately as non-release diagnostics; neither was hidden or weakened.

## 21. Implementation commit and push

- Commit: `ca10d8fe6293e08915f33ba6609ef8a8ee8b573f`
- Message: `fix: harden cross-browser accessibility`
- Push: normal push to `origin/main`; no force push.
- Corrective commit: `b3215a9bae8790b49841222cfa0fedd845597cfb`
- Corrective message: `fix: harden WebKit text reflow`
- Corrective push: normal push to `origin/main`; no force push.
- GitHub Actions implementation run: [31223579912](https://github.com/suhas-sunder/i-love-coloring-page/actions/runs/31223579912), `success`, 2026-08-07 22:22:25Z–22:32:15Z (`9m50s`).
- GitHub Actions corrective run: [31227133239](https://github.com/suhas-sunder/i-love-coloring-page/actions/runs/31227133239), `success`, 2026-08-07 23:26:30Z–23:36:57Z (`10m27s`; verification job `10m23s`).

## 22. Netlify deployment and production smoke

Application/CSS changed, so automatic Netlify verification was required. The final corrective push was observed at 2026-08-07 23:26:30Z. After the required three-minute quiet period, no-cache revision polls returned:

| Timestamp (UTC) | HTTP | Revision |
| --- | ---: | --- |
| 23:29:38 | 200 | `ca10d8fe6293e08915f33ba6609ef8a8ee8b573f` |
| 23:30:50 | 200 | `ca10d8fe6293e08915f33ba6609ef8a8ee8b573f` |
| 23:32:00 | 200 | `b3215a9bae8790b49841222cfa0fedd845597cfb` |

The final revision appeared after `5m30s`. `/build-revision.json` remained `200`, `application/json`, and `no-store`; runtime data fingerprint `d916a37223dc9bcf329c599402302146ef1726561fa5029066766f627f6da5b9` was unchanged.

Bounded production Chrome 151 smoke with ad-network requests blocked confirmed:

- HTTP `200`, the final revision, and hashed stylesheet `/_next/static/chunks/17-3~4ddlv-0i.css` (`62,543` bytes);
- deployed `.item-title` and `.item-title-link` anywhere-wrap rules;
- search input receives initial focus and Escape closes the dialog;
- the mobile navigation opens with focus on Close and body lock, then closes on the 1024px breakpoint with body lock removed and focus restored to the brand;
- zero horizontal overflow at 320px normal text;
- zero horizontal overflow and zero clipped card titles at 390px with 200% text enlargement;
- zero Privacy overflow at 390px with 200% text enlargement;
- zero relevant console errors.

No manual deployment or hosting/configuration change was made. Production smoke is bounded, does not click ads, and blocks ad-network requests during rendered interaction checks.

## 23. Documentation-only evidence commit

This report and the compact evidence are committed together with message `docs: record cross-browser accessibility verification` after all implementation, CI, deployment, and production evidence was available.

The evidence commit contains only `reports/**` and `pipeline/review/**`. Its post-push workflow path-filter result is recorded in the final handoff because a commit cannot include its own resulting GitHub Actions query.

## 24. Remaining genuinely manual checks

- Real Safari on macOS and iOS Safari on physical devices.
- Physical iOS/Android rotation, virtual-keyboard overlap, and touch exploration.
- VoiceOver, NVDA, JAWS, and TalkBack task walkthroughs with a human operator.
- Windows High Contrast and platform forced-colors review outside automation.
- Native OS print-dialog settings, preview rendering, and physical printer output.
- Physical mid-tier-device interaction timing and production field metrics.
- Assistive-technology pronunciation and announcement-quality editorial review.

## 25. Scope confirmation

No dependency, package version, environment variable, browser-sniffing framework, canonical route, stable ID, taxonomy, hub membership, related scoring, sitemap membership, generated title, generated hub content, source image, public asset path, printable output, paper-profile behavior, advertising placement/configuration, trust-page meaning, Netlify directive, CI behavior, Cloudflare setting, DNS setting, AdSense-account setting, consent-system setting, analytics integration, backend, API, deployment configuration, or external service was changed. No ad was clicked. No force push or manual deployment was used.
