# I Love Coloring Page — Comprehensive Change Plan

**Prepared:** 2026-08-01
**Status:** Proposed plan only; no recommendation has been implemented or approved.
**Source audit:** [`2026-08-professional-site-audit.md`](2026-08-professional-site-audit.md)

## Objective and frozen constraints

The goal is to turn the existing technically mature static site into a truthful, polished, accessible, measurable, and conservatively monetizable product without destabilizing its accepted architecture.

The implementation must preserve:

- immutable source images and the latest approved/blocked source manifests;
- the one-canonical-page-per-runtime-printable contract;
- frozen canonical path, stable ID, asset ID, primary category, and published route fields;
- approved hub membership and sitemap status unless a separate explicitly approved taxonomy/editorial round changes them;
- static export compatibility;
- the centralized asset resolver and SVG-internal/WebP-public asset strategy;
- the Round 4C/4K/4L/4R/4U design and advertising constraints;
- the Fraunces/Figtree typography system and approved color, spacing, radius, and motion tokens;
- generated-title ownership by `npm run generate:printable-titles`; generated assignments must not be hand-edited.

The plan deliberately excludes live AdSense credentials, source-image work, production uploads, canonical migrations, taxonomy rewrites, and backend/API services.

## Sequenced roadmap

| Phase | Purpose | Dependency | Release gate |
|---|---|---|---|
| **0. Decisions and baseline** | Resolve facts that code cannot safely infer and record pre-change measurements | None | Owner/legal decisions and reproducible baseline |
| **1. Truth and test modernization** | Make tests/reports observe current production and user tasks | Phase 0 facts | Edge/live checks and current-contract tests pass |
| **2. Trust, privacy, and launch configuration** | Align public claims, publisher identity, analytics, consent plan, and output descriptions | Owner/legal wording | Qualified approval; no false statements |
| **3. Navigation and interaction polish** | Make desktop disclosures and mobile parity look/behave intentional | Phase 1 browser harness | Cross-browser visual/keyboard acceptance |
| **4. Printable document product** | Add direct PDF, paper/orientation/scale model, truthful format hierarchy, and performance limits | Phase 0 format decisions | File, printer, mobile, and accessibility matrix passes |
| **5. Gallery and discovery quality** | Reduce repeated CTA weight and improve search, pagination, related relevance, and mobile browsing | Phase 1 metrics | Task success and no route/taxonomy changes |
| **6. Editorial and SEO quality** | Correct titles through governed generation and make hub support genuinely distinct | Rights/content decisions | Editorial review plus technical SEO regression pass |
| **7. Performance and accessibility hardening** | Enforce budgets and close manual/AT gaps before third-party scripts | Phases 3–6 | Pre-ad CWV/lab/a11y baseline accepted |
| **8. Conservative ad staging** | Harden existing ad architecture and release one placement at a time | Phases 0, 2, 7 | Consent, policy, live test-ad, CWV, and owner gates |
| **9. Post-launch measurement** | Expand, hold, or roll back based on evidence | Phase 8 | Weekly then monthly decision record |

Phases are ordered to prevent monetization from masking product defects or making privacy/output statements obsolete twice.

## Phase 0 — Owner decisions and pre-change baseline

### Scope

Create a decision record outside generated data for:

- asset provenance/licensing and the permitted meaning of “Free Printable”;
- intended AdSense account and publisher ID;
- Cloudflare Browser Insights status and disclosure;
- general-audience/child-directed treatment;
- consent regions and certified CMP choice;
- supported document products: PDF, Print, PNG, JPG, WebP, Letter/A4, default paper, and browser/printer support matrix;
- whether WebP is valuable enough to remain as an advanced user-facing format;
- initial ad matrix acceptance;
- WCAG 2.2 AA as the delivery target;
- product metrics and error/privacy constraints.

Capture production baselines by page family and mobile/desktop: p75 LCP, INP, CLS; route traffic; search queries and zero-result rate; card-to-detail rate; Print/download starts and failures if privacy-approved; pages/session; and current resource/asset bytes. Cloudflare RUM can be used only after the disclosure/owner decision is resolved.

### Recommendation assessment

| Dimension | Assessment |
|---|---|
| Problem solved | Prevents engineering from making legal, audience, publisher, or product promises by inference. Establishes the control group needed to detect regressions. |
| Why current state is inadequate | Public rights wording, production `ads.txt`, repository readiness, and active Cloudflare measurement do not describe one agreed state; no credible pre-ad field baseline was available. |
| Expected user impact | Indirect but foundational: truthful promises and fewer disruptive reversals. |
| SEO/revenue/maintainability impact | Avoids monetizing an unresolved corpus, enables honest ROI/CWV comparisons, and gives future tests an authoritative source. |
| Regression risk | Low technical risk; schedule risk if decisions are deferred. |
| Verification | Signed owner/legal decision record, live configuration inventory, timestamped baseline dashboard/export, and explicit “unknown” entries where evidence is unavailable. |

### Likely files and systems

- A new owner-approved decision/report document under `reports/` or the project’s non-generated governance location.
- Cloudflare and AdSense dashboards (read-only during baseline).
- No application files in this phase.

### Must not change

`images/**`, `pipeline/manifests/**`, `src/generated/**`, canonical route fields, sitemap membership, production asset objects, publisher settings, or live scripts.

### Risks, rollback, and acceptance

- **Risk:** treating an undecided item as tacit approval. Mitigation: mark it unresolved and keep the dependent phase blocked.
- **Rollback:** not applicable; baseline capture is read-only.
- **Acceptance:** all P0 decisions have an owner and status; pre-ad measures are segmented by page family/device and include collection windows/sample sizes.

## Phase 1 — Truthful QA and test modernization

### Scope

1. Reconcile stale reports with the current canonical-detail behavior, live `ads.txt`, and Cloudflare edge injection.
2. Retire or rewrite `ux-polish.test.mjs` and `ux-corrective.test.mjs`; include the corrected tests in the primary test script.
3. Add production-smoke assertions that can distinguish repository source, static output, CDN-injected resources, and live HTTP state.
4. Add browser task tests rather than selector-only checks:
   - disclosure computed styles, visual state, pointer/Escape/Enter/Space/Tab behavior, and focus restoration;
   - mobile nav and search focus trap/restore;
   - gallery query/filter/no-result/show-more/pagination tasks;
   - card image/title canonical navigation versus utility Print;
   - direct file download and Print as separate workflows;
   - live-mode ad eligibility, consent, no-fill, labels, distances, and CLS.
5. Add screenshot-diff review at the defined viewport matrix with real production/test-bundle media.
6. Add report freshness metadata: commit, production deployment identifier, date, environment, routes, and asset base.

### Recommendation assessment

| Dimension | Assessment |
|---|---|
| Problem solved | Stops structural presence tests and stale reports from being interpreted as UX/policy acceptance. |
| Why current state is inadequate | Existing tests can pass while the search placeholder is ungrammatical, related links are irrelevant, edge analytics is undisclosed, and hidden ads would initialize. |
| Expected user impact | Faster detection of broken tasks and visible regressions before release. |
| SEO/revenue/maintainability impact | Protects canonicals and crawlability, reduces ad-policy risk, and makes reports reproducible instead of narrative snapshots. |
| Regression risk | Medium: browser tests may be flaky if they depend on timing or production data. Use stable fixtures plus a small production smoke layer. |
| Verification | Primary test command includes current-contract tests; deliberately introduced fixture failures are caught; screenshots and task traces are attached to acceptance reports. |

### Files likely to change

- `package.json` test script
- `tests/navigation-search-filter.test.mjs`
- `tests/export-composition.test.mjs`
- `tests/canonical-printable-pages.test.mjs`
- `tests/advertisement-layout.test.mjs`
- `tests/trust-ads-readiness.test.mjs`
- stale `tests/ux-polish.test.mjs` and `tests/ux-corrective.test.mjs`
- browser-QA scripts/reports under the established test/report directories

### Must not change

Runtime/generated assignments, source media, routes, taxonomy, sitemap records, or production configuration.

### Dependencies, risks, rollback, acceptance

- **Dependency:** Phase 0 authoritative facts and a safe test asset base.
- **Risk:** tests that call production become nondeterministic or mutate state. Limit them to GET/DOM/network inspection.
- **Rollback:** revert new harness/config while retaining the corrected current-contract unit assertions.
- **Acceptance:** one command runs all non-production-mutating checks; browser coverage proves tasks at 390/768/1024/1440/1920; no historical report is presented without deployment metadata.

## Phase 2 — Trust, privacy, and launch configuration accuracy

### Scope

- Update Privacy to accurately disclose Cloudflare measurement and future ad/consent behavior after owner/legal review.
- Align Terms, About, Editorial policy, and Affiliate disclosure with the actual client-generated output workflow and approved rights position.
- Reconcile `siteIdentity` readiness, environment documentation, production `ads.txt`, and the owner-verified publisher ID.
- Document which statements must flip atomically when live ads or any additional analytics are enabled.
- Select and document the certified CMP/regional privacy-message flow and child-directed tagging strategy, without yet enabling live ads.
- Keep the real `admin@ilovecoloringpage.com` contact path prominent.

### Recommendation assessment

| Dimension | Assessment |
|---|---|
| Problem solved | Removes statements contradicted by production behavior and establishes a truthful monetization gate. |
| Why current state is inadequate | Privacy omits active Cloudflare RUM; Terms mislabels PNG generation and exposes unresolved licensing; live `ads.txt` conflicts with repository readiness and older reports. |
| Expected user impact | Clearer trust, permitted-use expectations, and data-use disclosure. |
| SEO/revenue/maintainability impact | Reduces trust/policy risk before AdSense review and centralizes launch state rather than scattering it across copy, environment, and reports. |
| Regression risk | High if wording overclaims legal rights or ads that are not active. All wording requires owner/legal review and conditional-state tests. |
| Verification | Code-to-copy truth table, live network scan, owner/legal sign-off, publisher-ID match, consent-region test plan, and no fake business/legal details. |

### Files likely to change

- `app/privacy/page.tsx`
- `app/terms/page.tsx`
- `app/about/page.tsx`
- `app/editorial-policy/page.tsx`
- `app/affiliate-disclosure/page.tsx`
- possibly `app/contact/page.tsx` if owner-approved clarification is needed
- `src/config/siteIdentity.ts`
- `.env.example` and deployment-environment documentation
- trust/readiness tests and reports
- `public/ads.txt` or its existing generation/configuration source, **only** after publisher verification

### Must not change

Canonical printables, metadata titles through hand edits, source images, generated route maps, sitemap membership, or live ad code.

### Dependencies, risks, rollback, acceptance

- **Dependencies:** owner/legal rights decision; publisher-account verification; Cloudflare/CMP decision.
- **Risk:** conditional copy can become false on the next configuration change. Mitigation: derive status from centralized verified configuration where appropriate and test both modes.
- **Rollback:** revert copy/config as one release and keep ads disabled; never leave ads enabled with reverted disclosure.
- **Acceptance:** every public statement maps to observable production state; policies carry reviewed dates/status; launch-blocker checklist is closed or explicitly blocked.

## Phase 3 — Navigation and interaction polish

### Scope

Implement the audit’s token-only navigation specification:

- fully reset desktop disclosure buttons, including `appearance` and font inheritance;
- replace typographic chevrons with a 14×14 `currentColor` SVG and tokenized rotation;
- align trigger padding/weight with adjacent navigation links;
- make hover, current-route, and expanded state distinct using only soft-plum/plum approved tokens;
- align desktop panel to the content grid; preserve viewport fit and no border/shadow;
- visually separate labels from counts and keep counts secondary;
- ensure only one desktop disclosure is open;
- preserve pointer dismissal, Escape dismissal/focus restore, native Enter/Space, logical Tab order, and visible focus;
- apply the same chevron/state language to mobile `<details>` while preserving the full-screen dialog and separate Search action;
- refine mobile breadcrumb presentation so labels remain intelligible.

### Recommendation assessment

| Dimension | Assessment |
|---|---|
| Problem solved | Makes the primary navigation read as one designed system and removes browser-native styling risk. |
| Why current state is inadequate | `appearance:auto`, text-glyph chevrons, subtle expanded hierarchy, and count emphasis create an unfinished impression even though mechanics mostly work. |
| Expected user impact | Faster recognition of navigation versus form controls, clearer open/current state, and more predictable keyboard use. |
| SEO/revenue/maintainability impact | Improves discovery/internal navigation without adding routes; consolidating the trigger pattern reduces CSS drift. |
| Regression risk | Medium: header widths, panel positioning, focus behavior, and mobile dialog can regress across breakpoints. |
| Verification | Screenshot and keyboard matrix across four engines and five widths; route-link validation; no overflow; focus restore; reduced-motion check. |

### Files likely to change

- `src/components/site/SiteHeader.tsx`
- `src/components/site/MobileNav.tsx`
- shared icon component if one already exists in the approved system
- `src/styles/components.css`
- possibly `src/styles/tokens.css` only to repair approved missing token aliases, not invent values
- navigation browser tests

### Must not change

Generated navigation routes, hub IDs, taxonomy membership, font families, ad slot placement/IDs/counts, or the top-level Coloring Pages link.

### Dependencies, risks, rollback, acceptance

- **Dependencies:** Phase 1 browser harness; existing Round 4 tokens/component rules.
- **Risk:** a visual reset can accidentally reduce touch size or focus visibility. Test computed dimensions and keyboard focus.
- **Rollback:** revert the navigation component/style commit as one unit; no data migration is involved.
- **Acceptance:** no native white-button appearance in Chrome/Firefox/Safari/Edge; 40 px desktop and 44 px mobile targets where specified; all links existing Phase 1 routes; screenshots accepted at all widths.

## Phase 4 — Printable document and export product

### Scope

#### 4A. Establish one composition model

- Parameterize paper profiles: Letter and A4, portrait and landscape.
- Define safe area, frame, branding, and artwork box once and share it across preview, direct PDF, Print, PNG, and JPG.
- Add Auto orientation based on maximum contained artwork area.
- Define Fit as mandatory containment and artwork scale as 100/90/75/50% of the maximum safe fit.
- Keep canonical SVG/WebP inputs unchanged.

#### 4B. Make PDF a direct product

- Add a real Download PDF Blob/file path with deterministic filename and URL cleanup.
- Compress/encode the PDF image stream or use a proven bundled method; target ≤3 MB for typical pages while retaining acceptable print detail.
- Reuse the exact same PDF for Print so the two workflows do not drift.
- Keep Print as a secondary action that hands the generated PDF to the browser/OS dialog.

#### 4C. Correct hierarchy and terminology

- Primary: Download PDF.
- Secondary: Print.
- Download image group: PNG recommended, JPG available, WebP under More formats.
- Label PNG/JPG as branded printable-page images and WebP as compact raw artwork.
- Replace the primary “Artwork size” fact with paper size, orientation, PDF page size, and PNG/JPG resolution. If retained in details, call 800×1200 “Artwork canvas,” never “Source artwork dimensions.”

#### 4D. Verify printers, browsers, and accessibility

- Test Chrome, Edge, Firefox, Safari; iOS Safari and Android Chrome; Save as PDF; at least representative inkjet/laser drivers if available.
- Test Letter/A4, portrait/landscape/auto, all scaling values, long titles, SVG failure with WebP fallback, offline/error states, Blob cleanup, and repeated downloads.
- Add synthetic square and landscape fixtures because current runtime inventory is overwhelmingly 2:3 portrait.

### Recommendation assessment

| Dimension | Assessment |
|---|---|
| Problem solved | Gives users a deterministic document they can save and clarifies what each format produces. Adds requested paper/orientation/scale capabilities without changing assets. |
| Why current state is inadequate | Print is browser-dependent, PDF is hidden inside it, formats have inconsistent composition, dimensions are ambiguous, Letter is hard-coded, and raw PDF payload is large. |
| Expected user impact | Higher successful save/print rate, especially on mobile; fewer surprises about branding, paper, and image dimensions. |
| SEO/revenue/maintainability impact | Better task completion and return value; a single composition model prevents divergent format bugs. Do not index utility states. |
| Regression risk | High: PDF byte structure, print margins, CORS, memory, Safari downloads, and file naming can fail. Stage behind a reversible feature flag/config with no route change. |
| Verification | Byte-decode every output, pixel/PDF snapshot comparison, file-size/time budgets, browser/printer matrix, accessible status/error announcements, zero clipping. |

### Files likely to change

- `src/components/printables/PrintableDetailActions.tsx`
- `src/components/printables/PrintablePreviewDialog.tsx`
- `src/components/printables/PrintableDetailPage.tsx`
- `src/lib/printables/exportComposition.ts`
- `src/lib/printables/browserDownloads.ts`
- existing export/filename/asset-resolver helpers
- printable component styles
- export and browser task tests
- trust-page wording affected by the approved output contract

### Must not change

- SVG as internal infrastructure only; do not expose it as a public download.
- Source or generated media files, CDN asset paths, stable IDs, canonical URLs, printable slugs, primary categories, related IDs, or sitemap records.
- No backend/API route.

### Dependencies, risks, rollback, acceptance

- **Dependencies:** owner paper/default/format decisions; verified production CORS; Phase 1 harness.
- **Risks:** compressed PDF quality loss, printer-border clipping, main-thread stalls, Safari Blob quirks, mismatch among preview and output.
- **Rollback:** feature flag/config reverts action order to current Print workflow while preserving canonical pages; retain old composition module until new path meets a release window.
- **Acceptance:** direct PDF downloads without opening Print; Print uses the same document; Letter/A4/orientation/scale matrix has no clipping; typical PDF ≤3 MB and p75 generation ≤2 s on agreed mid-tier device; PNG/JPG exactly match labeled resolution; WebP label is truthful.

## Phase 5 — Gallery and discovery quality

### Scope

1. Fix generated search microcopy (“Search coloring pages,” not “Search coloring pages pages”).
2. Rebalance card hierarchy:
   - keep image and title as the strongest canonical-detail targets;
   - retain card Print initially but reduce resting emphasis using approved secondary/quiet styling;
   - measure card Print use before removal or relocation.
3. Reduce first-session mobile wall effect through the existing batch/static-pagination architecture: use a smaller mobile initial client batch or stronger collection landmarks without making crawlable content depend on client state.
4. Improve pagination framing by avoiding repeated page/count wording and preserving crawlable Previous/Next.
5. Improve related printable/collection scoring using actual direct membership, normalized subject/style tokens, parent overlap only where nonzero, and duplicate-cluster suppression. Keep deterministic stable tie-breaking.
6. Introduce first-batch browse diversity only as a deterministic presentation layer; never change membership or frozen canonical fields.
7. Keep the global quick-search modal. Prototype a static client `/search` route only if query/task evidence supports it; keep query states non-indexable and canonical links unchanged.
8. Test a compact Continue browsing component only on detail/end states and only if it increases useful onward navigation.

### Recommendation assessment

| Dimension | Assessment |
|---|---|
| Problem solved | Reduces repetitive mobile controls and improves users’ ability to find a relevant next printable. |
| Why current state is inadequate | A 390 px page renders 48 prominent Print actions across a ~32,000 px document; related results are deterministic but semantically weak; microcopy and page framing are mechanical. |
| Expected user impact | Faster scanning, fewer accidental utility choices, more relevant onward browsing, and clearer search feedback. |
| SEO/revenue/maintainability impact | Better pages/session and internal discovery while preserving crawlable pagination and static export. Related-score rules become auditable. |
| Regression risk | Medium/high: order changes can affect featured content, client batching can hide expected results, and a new search route can create crawl traps if misconfigured. |
| Verification | Card/search/pagination task tests; mobile screenshots and scroll metrics; deterministic snapshots; related relevance sample set; canonical/sitemap diff must be empty. |

### Files likely to change

- `src/components/gallery/ImageCard.tsx`
- `src/components/gallery/GalleryGrid.tsx`
- `src/components/gallery/GallerySearch.tsx`
- `src/components/gallery/Pagination.tsx`
- global search dialog/result components
- related-selection generator/library and its tests
- gallery component styles
- optionally `app/search/page.tsx` **only after evidence and explicit approval**

### Must not change

Printable routes, hub membership, stable IDs, source/generation manifests, sitemap membership, centralized asset URLs, public SVG policy, or static-export compatibility.

### Dependencies, risks, rollback, acceptance

- **Dependencies:** Phase 1 tests and baseline task metrics; Phase 4 action hierarchy for consistent card labels.
- **Risk:** relevance heuristics may encode accidental token bias. Use an editorial benchmark set across animals, seasonal, fantasy/anime, flowers, dinosaurs, and small hubs.
- **Rollback:** restore previous presentation/ranking module without touching IDs or routes.
- **Acceptance:** root placeholder grammatical; alligator benchmark includes subject-relevant options; no duplicate/current hub; 390 px first view accepted; filters/search/pagination retain keyboard use and crawlable URLs; zero canonical/sitemap diff.

## Phase 6 — Editorial and SEO quality

### Scope

#### Title correction workflow

- Extend the deterministic title-quality generator/review workflow to flag dictionary, phrase-order, and suspicious suffix issues.
- Correct high-confidence mechanical errors such as the documented misspellings only through the owned generator and approval manifest/process.
- Route uncertain spelling, numeric suffixes, brand/model terms, and source context to editorial review.
- Preserve the reviewed `publicTitle` base, duplicate `Design N` rules, stable routes, and download filename contract.

#### Hub quality workflow

- Review the 23 indexable hubs below 12 assets and 59 below 20 for distinct user intent and useful inventory—not merely word count.
- Add page-specific support only where actual counts, representative subjects, selection method, and related public hubs make it useful.
- Review `dinosaurs` versus `prehistoric-animals` as a promotion cluster; keep both frozen routes unless a separately approved route policy says otherwise.
- Keep gallery access near the top; supporting content remains below/secondary.
- Preserve the honest non-indexed Easy state until reviewed complexity exists.

#### Technical SEO regression checks

- Enforce unique route-specific titles/descriptions within sensible length guidance without mechanically truncating meaning.
- Verify visible copy, metadata, canonical, JSON-LD, breadcrumbs, alt text, regular sitemap, and image sitemap remain synchronized.
- Keep client search/filter/dialog/format states non-indexable.
- Do not create new long-tail routes without the existing acceptance and metadata-sync gates.

### Recommendation assessment

| Dimension | Assessment |
|---|---|
| Problem solved | Removes visible generated-language defects and makes smaller hubs more helpful without keyword padding. |
| Why current state is inadequate | Uniqueness tests pass despite misspellings, phrase repetition, long titles, formulaic intros, and weakly differentiated small hubs. |
| Expected user impact | More trustworthy labels, better scanning, and useful context for deciding what to print. |
| SEO/revenue/maintainability impact | Improves snippet quality and people-first differentiation; a governed review manifest prevents hand-edit drift. |
| Regression risk | High if a display correction moves a canonical route or if generated copy invents claims. Route-diff and unsupported-claim gates are mandatory. |
| Verification | Editorial sample/sign-off; spelling/boilerplate/claim scanners; zero changes to canonical path/stable ID/taxonomy/sitemap; browser review with gallery still first. |

### Files likely to change

- printable-title generator and its deterministic review inputs/tests
- hub-content generator/editorial source and quality tests
- generated title/content output **only through approved generators**, never hand-edited
- metadata validation and browser-QA reports

### Must not change

Canonical route fields, stable IDs, primary category, hub membership, related IDs as a side effect of title corrections, rejected/deferred hub routing, source filenames, or source images.

### Dependencies, risks, rollback, acceptance

- **Dependencies:** owner/legal rights wording; editorial review capacity; actual runtime inventory.
- **Risk:** scale encourages cookie-cutter copy. Require unsupported-claim, boilerplate, near-duplicate, and keyword-stuffing thresholds plus human sampling.
- **Rollback:** restore the prior generated title/content artifact from version control while retaining review findings; routes remain unchanged.
- **Acceptance:** documented errors fixed through generator; no prohibited leakage; no unsupported age/difficulty/education/therapy claims; every changed hub has distinct useful content and accepted screenshots.

## Phase 7 — Performance and accessibility hardening

### Scope

- Establish CI budgets for first-party assets and lab interactions.
- Capture p75 field CWV by device/page family from the owner-approved source.
- Profile search/filter, modal open/close, PDF generation, and repeated downloads on a representative mid-tier phone.
- Review four eager images on galleries against the actual LCP element and adjust only with evidence.
- Confirm font preload/display behavior and avoid new font variants.
- Resolve undefined custom-property references using existing approved tokens.
- Complete cross-browser keyboard and screen-reader tests for disclosures, search, mobile nav, preview, new export controls, dynamic status, pagination, and no-results.
- Add automated checks for broken images, horizontal overflow, focus loss, unnamed controls, heading structure, and reduced motion, backed by manual review.

### Performance budgets

| Measure | Pre-ad release budget | Ad regression budget |
|---|---:|---:|
| Field p75 LCP | ≤2.5 s, mobile and desktop | no more than +200 ms and remain ≤2.5 s where baseline passes |
| Field p75 INP | ≤200 ms | no more than +50 ms and remain ≤200 ms where baseline passes |
| Field p75 CLS | ≤0.10 | ad-attributable increase ≤0.02; no individual ad shift >0.01 |
| Gallery first-party JS | ≤210 KB gzip | no first-party growth for ad rollout |
| Printable first-party JS | ≤200 KB gzip | no first-party growth for ad rollout |
| Shared CSS | ≤12 KB gzip | no arbitrary ad-theme growth |
| Initial above-fold images | ≤300 KB mobile / ≤600 KB desktop | unchanged by ads |
| Lab total blocking time | ≤200 ms | increase ≤50 ms |
| Long task during search/filter/export | none >200 ms | no ad-created task >200 ms |
| Typical PDF | ≤3 MB | not applicable |
| PDF generation on agreed mid-tier device | p75 ≤2 s | not applicable |
| Broken public images / horizontal overflow | 0 | 0 |

The absolute field thresholds follow current Core Web Vitals guidance; the tighter deltas are project rollout budgets.

### Recommendation assessment

| Dimension | Assessment |
|---|---|
| Problem solved | Provides an empirical quality gate before adding third-party latency and closes interaction/accessibility blind spots. |
| Why current state is inadequate | Static bytes are known, but field CWV is not; structural tests do not validate AT announcements or real task latency. |
| Expected user impact | Faster, steadier pages and reliable keyboard/screen-reader workflows. |
| SEO/revenue/maintainability impact | Protects page experience and creates a monetization regression control; explicit budgets prevent gradual payload creep. |
| Regression risk | Low/medium; over-optimizing against a single lab trace could harm real UX. Use field + lab + task evidence. |
| Verification | CI budget report, field dashboard, four-engine browser matrix, screen-reader record, zero overflow/broken image screenshots. |

### Files likely to change

- performance/accessibility test scripts and CI configuration
- `src/styles/tokens.css`, `src/styles/base.css`, or `src/styles/components.css` only for confirmed token/accessibility defects
- affected components from Phases 3–5
- measurement documentation

### Must not change

Do not mask overflow at `body`, remove focus, replace real assets with placeholder-only acceptance, or move assets into `public/`.

### Dependencies, risks, rollback, acceptance

- **Dependency:** stable feature set from Phases 3–6.
- **Rollback:** performance changes revert individually with before/after traces; accessibility behavior changes require equivalent semantics before rollback.
- **Acceptance:** budgets pass or have an explicit owner-approved exception; manual screenshots override automated pass claims.

## Phase 8 — Conservative advertising staging

### Scope

Harden the existing components; do not create a parallel ad system.

1. Add one central eligibility decision per slot based on page family, breakpoint, launch matrix, consent, configuration, and current visibility.
2. Initialize only eligible, visible/near-viewport units. Do not push CSS-hidden alternative slots.
3. Define empty/unfilled behavior: retain or collapse the reserved well without unexpected content jumps; record the choice and test it.
4. Load the AdSense script only after the required consent/config gate. Prevent duplicate script and duplicate unit initialization on navigation/hydration.
5. Keep stable unique slot IDs and `Advertisement` accessible labels.
6. Preserve reserved safe widths/gaps and no-overlap breakpoints. Do not use body overflow masking.
7. Run official AdSense test ads or the approved non-production method at all target viewports with placeholders on/off and real media.
8. Release only the first matrix below. Expand one slot/page cohort at a time after a measurement window.

### Initial ad rollout matrix

| Page family | Mobile 390 | Tablet 768 | Desktop 1024–1439 | Wide desktop ≥1536 | Initial status |
|---|---|---|---|---|---|
| Home | Existing post-header/post-hero slot | Same | Same | Existing right rail only | Launch candidate after gates |
| Main gallery | Existing lower banner after first batch, outside grid | Same | Same | Existing right rail only | Launch candidate after gates |
| Gallery pagination | Lower banner separated from pager | Same | Same | Right rail only **or hold** until page-1 data | Cautious cohort |
| Hub page 1 | Existing lower banner after first batch, outside grid | Same | Same | Existing right rail only | Launch candidate after gates |
| Hub pagination | Lower banner separated from pager | Same | Same | Right rail only **or hold** until page-1 data | Cautious cohort |
| Printable detail | Lower banner after related content | Same | Same | Same lower banner; no rail | Launch only after export redesign |
| About/Contact/Privacy/Terms/Editorial/Affiliate/Sitemap | None | None | None | None | Hold |
| 404 | None | None | None | None | Hold |

**Disabled initially:** top banner, supporting square, left rail, dual rails, multiple first-screen banners, and all trust/legal placements. Top-banner and post-header-banner remain mutually exclusive in every future experiment.

### Required live-ad evidence per page/viewport

For every matrix cell record:

- slots present in the DOM and slots initialized;
- slots actually displayed/filled and label count;
- DOM/visual order and reserved/filled dimensions;
- pixel distance from navigation, search, filters, pagination, and Print/Download controls;
- zero overlap and horizontal overflow;
- CLS contribution, script/request timing, and LCP/INP change;
- lazy/near-viewport timing;
- empty-slot result;
- accessible label/name;
- content-to-ad balance and whether a unit resembles navigation/download;
- screenshot with placeholders/test ads on and off.

### Recommendation assessment

| Dimension | Assessment |
|---|---|
| Problem solved | Prevents hidden responsive slots, excessive rails, and interaction-ad adjacency from becoming production policy/performance defects. |
| Why current state is inadequate | The initializer targets all live units regardless of visibility; no consent/no-fill/live-creative evidence exists; two rails plus a top banner is unmeasured. |
| Expected user impact | Lower accidental-click risk, less clutter, preserved task focus, and predictable layout. |
| SEO/revenue/maintainability impact | Conservative revenue baseline with measurable expansion; centralized eligibility reduces duplicate slot logic and protects CWV. |
| Regression risk | Very high: third-party scripts, fill variance, consent, breakpoints, and creative size can affect every page. Use phased config/feature flag and instant disable path. |
| Verification | Publisher/CMP gates, official-policy checklist, test-ad matrix, screenshots, DOM/request logs, CWV deltas, and owner sign-off. |

### Files likely to change

- `src/components/ads/AdSenseScript.tsx`
- existing ad slot/component wrapper(s)
- `src/lib/ads/config.ts`
- `src/components/layout/PublicPageShell.tsx`
- `src/styles/components.css` only within frozen placement/token constraints
- page-family layout calls that select existing slots
- environment/config documentation
- advertisement live-mode browser tests and reports

### Must not change

- Stable slot IDs or frozen placement architecture without a separately documented bug decision.
- No ads in navigation, cards, grids, search/filter UI, pagination control groups, or Print/Download rows.
- No new ad component family, fake creative, gradients, borders, shadows, random colors, or live credentials in source.
- No canonical, taxonomy, sitemap, asset, source-image, backend/API, or public-SVG changes.

### Dependencies, risks, rollback, acceptance

- **Dependencies:** all P0 gates, owner/legal review, CMP, verified publisher ID, Phase 7 baseline, and owner acceptance of visual layout.
- **Risk:** invalid traffic, accidental clicks, no-fill whitespace, CLS, third-party main-thread cost, or child-directed misconfiguration.
- **Rollback:** centralized production mode/slot matrix immediately disables the cohort without code/data-route changes; retain reserved-shell behavior only if it does not leave misleading empty UI.
- **Acceptance:** exactly the matrix-intended visible count per viewport; no hidden unit request; no policy-adjacent placement; all performance deltas within budget; owner manually accepts screenshots.

## Phase 9 — Measurement, expansion, and maintenance

### Scope

- Run an initial 14–28 day measurement window per ad cohort, subject to traffic volume.
- Compare against the pre-ad baseline by page family/device, not site-wide averages alone.
- Record task outcomes: card-to-detail, search success, Print/PDF/image completion, pages/session, exits, and errors.
- Record monetization outcomes: fill, viewability, RPM, request coverage, invalid-traffic/policy notices.
- Record quality outcomes: p75 CWV, ad-attributable CLS, resource/main-thread change, complaints, accidental-click indicators.
- Expand only one variable at a time: page family, placement, or viewport—not all three.
- Re-audit policy/trust copy on every analytics/ad vendor or audience-treatment change.
- Quarterly sample title/hub quality and related relevance; do not regenerate routes.

### Recommendation assessment

| Dimension | Assessment |
|---|---|
| Problem solved | Converts ad/discovery choices from taste into reversible experiments and prevents gradual content/test staleness. |
| Why current state is inadequate | Existing reports become stale and contain contradictions because they lack live deployment identity and repeated measurement. |
| Expected user impact | Poor placements or workflows are rolled back before becoming permanent. |
| SEO/revenue/maintainability impact | Revenue changes are evaluated with page experience and task completion; scheduled truth checks reduce operational drift. |
| Regression risk | Medium: small samples can produce false conclusions. Require minimum sample rules and confidence notes. |
| Verification | Versioned decision log with baseline, cohort, sample, deltas, screenshots, outcome, and rollback/expand decision. |

### Rollback and acceptance

- Roll back an ad cohort if it breaches an absolute CWV threshold, exceeds the allowed delta, causes overflow/overlap, produces policy warnings, or materially reduces core task completion.
- Hold rather than expand when samples are insufficient.
- Acceptance is an explicit expand/hold/rollback decision; silence is not approval.

## Consolidated browser acceptance matrix

Every major public UI phase must use real media and intentional fallback states.

| Width | Home | Gallery | Large hub | Small hub | Seasonal | Pagination | 3 printable records | Trust/legal | Sitemap | 404 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 390 | Required | Required | Sample | Sample | Sample | Required | All actions + modal | Required | Sample | Required |
| 768 | Required | Required | Required | Sample | Required | Required | All actions + modal | Required | Sample | Required |
| 1024 | Required | Required | Required | Required | Required | Required | All actions + modal | Required | Required | Sample |
| 1440 | Required | Required | Required | Sample | Required | Required | All actions + modal | Required | Required | Sample |
| 1920 | Required | Required | Required | Sample | Required | Required | All actions + modal | Required | Required | Sample |

For each applicable cell verify:

- production/test-bundle WebP renders; fallback is intentional on forced failure;
- no horizontal overflow or broken icon;
- heading/landmark hierarchy and route-specific metadata;
- mouse/touch and complete keyboard flow;
- focus visibility, restoration, and no focus behind dialogs;
- navigation disclosures and mobile menu/search parity;
- filters, no-results, Show more, and crawlable pagination;
- canonical card navigation and utility action separation;
- PDF/Print/PNG/JPG/WebP status, output decode, filenames, and errors;
- ad DOM/visible/initialized counts, labels, spacing, no-fill, and CLS in ad phase;
- reduced motion and 200%/400% zoom reflow.

The three printable fixtures must cover the sampled production source-dimension variants plus synthetic square/landscape export fixtures. Production does not currently provide three materially different artwork proportions.

## Automated-test additions

### Unit and deterministic data tests

- Page-profile dimensions and safe areas for Letter/A4 and portrait/landscape.
- Auto-orientation fit-area selection and 100/90/75/50 containment.
- Shared PDF/PNG/JPG composition coordinates.
- Direct PDF MIME, magic bytes, page size, filename, and Blob URL cleanup.
- PDF file-size fixture budget and image encoding.
- Format-description truth table.
- Related-score subject/membership benchmarks and deterministic ties.
- Search placeholder grammar for root and representative hubs.
- Title dictionary/phrase-order flags with editorial escape hatch.
- Canonical/stable-ID/route/taxonomy/sitemap diff must remain empty after display-title/content builds.
- Ad eligibility by page family/breakpoint/consent/config; never initialize CSS-hidden alternatives.
- Publisher/readiness/`ads.txt` consistency for the targeted environment.

### Browser tests

- Disclosure computed `appearance`, SVG state, pointer outside, Escape, focus restore, Enter, Space, Tab, current route, and one-open-at-a-time.
- Mobile dialog focus trap, inert shell, body lock, close restore, and `<details>` parity.
- Global search input focus, cap, no result, clear, close/restore, and canonical result links.
- Gallery filter combination, zero result, Show more, static Previous/Next, and back/forward state.
- Card image/title target versus Print utility target.
- Download PDF without Print, then separate Print handoff; all image downloads decode at labeled dimensions.
- Forced SVG/CORS/image failure with intentional fallback and accessible error.
- Ad placeholders/test units on/off: exact visible and initialized counts, unique slot IDs, labels, no overlap/overflow, and distances from interactions.
- Trust live scan for edge scripts, `ads.txt`, canonicals, no localhost/private asset leakage, and conditional policy statements.

### Manual tests that automation must not replace

- Native print dialogs and representative printer drivers.
- iOS/Android download/save behavior.
- VoiceOver, NVDA, and/or JAWS announcement and reading order.
- Visual design acceptance at all five widths with real images.
- Legal/policy review and AdSense account/CMP configuration.
- Ad creative/no-fill behavior with approved test mode.

## Measurement plan

| Objective | Event/metric | Segment | Decision use |
|---|---|---|---|
| Navigation clarity | Disclosure open, destination selection, dismissal path, keyboard failures | viewport/input/page | Validate polish and grouping |
| Search quality | Query, result count band, zero-result, result click, time to selection | modal/local search; page family | Fix ranking/content; decide dedicated route |
| Gallery efficiency | card impressions, detail opens, card Print use, Show more, pagination, scroll depth bands | viewport/hub size | Tune CTA weight and batch size |
| Export success | PDF/Print/PNG/JPG/WebP start, completion signal where reliable, error category, duration | browser/device/paper/orientation | Validate hierarchy and support matrix |
| Discovery depth | related printable/collection clicks, pages/session, return to gallery | source/target relation | Evaluate relevance scoring |
| Page experience | p75 LCP/INP/CLS, LCP element, CLS source | page family/device/ad cohort | Release/rollback gate |
| Resource cost | first/third-party bytes, requests, long tasks, image bytes/cache | page family/device | Enforce budgets |
| Ads | eligible/requested/filled/viewable, slot, RPM, policy/invalid-traffic signals | page family/viewport/cohort | Expand/hold/rollback |

Collect only the minimum approved data, document retention and processors, and update Privacy/consent before collection. Do not use undisclosed measurement to validate the disclosure fix.

## Owner or legal decisions required before implementation

| Decision | Blocks |
|---|---|
| Approved provenance/license and exact permitted-use/free wording | Trust copy, broader promotion, AdSense activation, classroom/homeschool claims |
| General-audience versus child-directed treatment and any section/page tagging | Consent/ads configuration and audience copy |
| Approved Privacy/Terms/Affiliate/Editorial language | Ad/analytics activation |
| Intended AdSense account and `pub-4810616735714570` ownership | `ads.txt`, environment, live ads |
| CMP/provider, regions, and consent mode | AdSense script initialization |
| Cloudflare Browser Insights purpose, processing, and disclosure | Continued measurement and policy wording |
| Supported formats and whether WebP is user-facing | Export hierarchy/copy/tests |
| Letter/A4 default and Auto-orientation behavior | Export UI/composition |
| Initial one-placement ad matrix | Live test-ad staging |
| WCAG 2.2 AA target and supported browser/AT/printer matrix | Release acceptance |
| Analytics event set, retention, and privacy constraints | Product/ad measurement |

## Cross-phase rollback strategy

- Keep phases in separate, reviewable changes; do not combine trust copy, export logic, navigation, taxonomy/content, and ads in one release.
- Use configuration/feature flags for new export hierarchy and ad cohorts; flags must not create alternate indexable URLs.
- Preserve the prior composition/ranking modules until the replacement passes its release window.
- Treat generated artifacts as reproducible outputs; rollback via their owning generator/versioned inputs, never hand editing.
- Require a zero-diff assertion for canonical paths, stable IDs, taxonomy membership, sitemap membership, and asset URLs in every phase not explicitly authorized to alter them.
- Ads need a single immediate disable path independent of a source rollback.
- If a public trust statement becomes inaccurate, disable the dependent service first, then correct and re-review the statement.
- A manual screenshot, printer failure, accessibility failure, or policy warning overrides an automated pass.

## Definition of complete

This plan is complete only when:

- P0 decisions are resolved by the appropriate owner/reviewer, not inferred by engineering;
- current tests and reports describe current production behavior;
- navigation passes visual and keyboard acceptance across engines and widths;
- direct PDF, Print, and image formats are distinct, truthful, decoded, and within quality/performance budgets;
- Letter/A4/orientation/scale work without clipping and without modifying canonical assets;
- gallery/search/related improvements pass task and deterministic route-data gates;
- title/content corrections pass editorial, people-first, unsupported-claim, and frozen-route checks;
- pre-ad performance/accessibility baselines are accepted;
- only the conservative ad matrix is enabled, with consent, visible-slot initialization, no-fill handling, official-policy checks, and owner screenshots;
- post-launch data supports expand/hold/rollback decisions;
- no prohibited files, routes, stable IDs, source images, asset paths, or public SVG policy were changed.

Until those conditions are met, live AdSense expansion and claims of comprehensive launch readiness should remain blocked.
