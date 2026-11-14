# iLoveColoringPage: 2026–2027 product maturity and controlled release program

**State:** program staged, not production authorized. **Production repo:** `suhas-sunder/i-love-coloring-page`; never use the older `suhas-sunder/coloringpage` starter. **Netlify:** `i-love-coloring-page`; main auto-deploys. **Baseline:** [SEARCH-BASELINE-2026-11-13.md](SEARCH-BASELINE-2026-11-13.md).

## Mission

Make this an outstanding **artwork-first, fast, browsable, printable, ad-supported coloring-page product** for real users: parents, teachers, children with adult supervision, and adult coloring enthusiasts. Build for organic discovery and trust, not mass page generation. Site maturity matters more than hitting an artificial launch deadline. Completing the build and staging work is distinct from publishing it.

The large existing catalog is legitimate by design. Do **not** infer spam from URL count or blindly prune assets. Evaluate actual artwork uniqueness/quality, search intent, indexing, crawlability, duplication, usefulness and rights separately. Google has no safe numerical quota of weekly posts; the controlled pace is for editorial quality, attribution, site stability and detectability, not a claimed algorithmic threshold.

## Protected contracts (hard gates)

1. Read `AGENTS.md`, `ai-issues/AD-PLACEHOLDER-SAFETY.md`, existing architecture and pipeline reports first. Resolve discrepancies against live code; record why.
2. Source images remain immutable; approved-source and blocked-source manifests control production. No bulk conversion, generated binaries in Git, silent restoration of blocked images, unauthorized deletion or source movement.
3. Frozen `/printables/{primary-category}/{clean-slug}-{stable-id}` canonicals, stable IDs and category ownership must not change incidentally. Preserve image sitemap, static-export architecture, asset resolver, no public SVG and public WebP preview contract.
4. **Ad account safety outranks cosmetic UI.** The October 14 owner's global placeholder-suppression directive is protected. Never change/fix placeholders, lifecycle, ad loading, first-filled detection or overlay behavior as part of generic UI work. Any explicit ad-system change requires separate owner authorization and production-representative real-ad tests. No increased accidental-click or intrusive-ad risk.
5. Existing ads/CMP/privacy/analytics are not to be silently reconfigured. No paid services, feature trials, DNS, Netlify plan/production settings or new secrets without permission.
6. Preservation of indexable HTML, actual artwork and working downloads/printing is mandatory.

## Workstreams and sequencing

### FT: Urgent UI/UX and confirmed critical defects (start immediately, separate fast-track branch)

- Audit browser-rendered homepage, all-category gallery, niche hub, deep paginated hub, printable detail, print preview/download, mobile search/filters, navigation, light/dark if present, and actual live ads at 360/390/768/1280/1440 px. Capture **before** screenshots and identify concrete severe friction or visual deficiencies.
- Define the real user tasks and prove task completion: find a topic quickly; recognize artwork at a glance; reach a good image; choose paper/size/output; preview; print/download; return to a relevant collection.
- Implement coherent shared UI primitives/tokens and meaningful art-first visual hierarchy. Fix navigation, discovery/filter flow, card density, preview loading/fallbacks, mobile interactions, touch targets, focus, and action labels **only where actual defects are demonstrated**. Do not substitute a generic SaaS dashboard or add distracting decorative elements.
- Validate that all art thumbnails and detail images are genuinely visible when loaded, that placeholders do not hide artwork, and that UI controls never cover ads. Respect performance and CLS.
- Fast-track deliverable: `fasttrack/2026-11-ui-ux-recovery` containing **implemented**, tested changes, draft PR, immutable Netlify preview and manual-review screenshots. Expedite owner approval; **no direct push to main without review**. A documentation-only report is NOT completion.
- If a proven broken functionality/security/SEO issue is urgent, isolate it from cosmetic UI work with independent evidence and rollback.

### T: SEO/indexing/rendering root-cause investigation (parallel, no speculative bulk edits)

- Investigate July Google peak and late August–November loss with exact day-level GSC exports, deploy/change chronology, page-query/country/device segments, canonical changes, sitemap evolution, robots/noindex/redirects, status codes and Google/Bing crawl/index logs where permitted.
- Distinguish Google **Web** from **Image** search; current export covers Web only. Verify actual image sitemap entries, `<img src>` crawlability, assets/CORS/HTTP, alt, dimensions, descriptive context, image vs art PDF indexing and URL Inspection samples with controls.
- Bing's post-September impression surge with near-zero CTR needs query/page, source-scope, geography/rank and SERP verification, not a sitewide meta rewrite from aggregate CTR.
- Sample at least ~40 across winners, losers, zero-impression printables, parent hubs, deep paginated hubs, mobile, niche art types and content families. Preserve evidence, classify CONFIRMED / LIKELY / UNKNOWN, and prioritize fixes.
- No indexable page explosion, blanket noindex, mass redirects, canonical changes or deletion without item-level evidence/owner gate.

### UX: Deep product completion (build on feature branches, stage for later controlled release)

- User-task and audience research; design system with reusable components, polished color/type, mobile-first gallery, excellent visual previews, artwork-first discovery, smart categories/search/filters/sort, clear print/download flows, print profiles and content-linked discovery.
- Adult vs child/educator browsing and accessibility with real inclusive copy. No unsupported health/education/therapeutic claims. Make interfaces straightforward, not gamified filler.
- Functional tests plus real browser and actual export/file quality checks, responsive screenshots, keyboard/screen reader review, performance budgets.
- Existing August implementation reports may claim parts are done; verify actual behavior and fix what remains, do not duplicate blindly.

### C: Existing-catalog editorial and image quality (no destructive bulk operations)

- Inventory page quality and taxonomy from **approved** manifests. Identify duplicates by exact content and meaningful visual similarity, erroneous names, malformed descriptions/characters, broken images, missing print files, poor thumbnails, irrelevant keywords and questionable rights.
- Make curated collection hubs clear and useful, not template-introduction farms. Favor useful existing assets, high-demand subjects, differentiated artwork and related-collection navigation.
- Human/humanoid and age-sensitive art require visual/manual QA; quarantine real defects, never auto-reject all a category.
- Machine-readable quality ledger: asset ID, canonical, owner/hub, rights/provenance review, metadata quality, art QA, print QA, indexation status, recommendation, reviewer, decision date. No source image mutation.
- Existing canonical URLs and existing good art remain intact unless a precise gated repair has been approved.
- New content only after the relevant query/user need and artistic value are demonstrated. Keep cohorts small for review and attribution; quantity alone is never success.

### R: Release train (2027)

**Build first, release gradually.** Build and test a complete coherent set of improvements on isolated integration/feature branches; stage one **independent, reviewable release branch** per approved weekly package (or clearly documented dependency chain). DO NOT dump the completed integration branch onto main. DO NOT pre-create 52 empty weekly branches.

Use ISO 2027 weeks W01–W52 as **candidate windows**, not forced release obligations. First planned gate: W01 (Jan 4–10, 2027); if incomplete, HOLD and begin on the first subsequently approved window. Each package should be small, coherent, reversible, useful and not dominated by mass content. A content-free UX/performance/SEO package is valid. Publish only owner-approved packages; never silently auto-merge.

**Illustrative planned sequencing, refined after the code and site audit:**

| Windows | Candidate program |
|---|---|
| 2026 immediate | FT critical visible UX + proven defects, separately tested and manually approved for expedited release |
| W01–W04 | UI foundation, homepage/discovery, mobile controls and preview reliability |
| W05–W08 | printable detail/preview/print/download experience and related-navigation coherence |
| W09–W12 | technical SEO/rendering/image discovery fixes with measured safeguards |
| W13–W16 | category-hub structure, deeper browsing and internal navigation |
| W17–W20 | artwork metadata and exact-quality fixes on existing catalog |
| W21–W24 | category-specific editorial improvements; limited, meaningful new art only if approved |
| W25–W28 | real-browser accessibility and mobile completion; performance/CLS |
| W29–W32 | teacher/family practical workflows, if audience evidence supports |
| W33–W36 | adult coloring discovery and printer workflow, if evidence supports |
| W37–W40 | image-search presentation and differentiated art clusters |
| W41–W44 | search/filters and content QA refinements |
| W45–W48 | intent-led seasonal improvements, well ahead of peak demand; no reactive dumps |
| W49–W52 | durability, performance, search quality, final review, 2028 backlog |

This is an **allocation of capacity**, not authorization to invent or publish 52 changes. Every week can produce HOLD/OBSERVE/NO RELEASE if gates fail.

### Weekly release mechanics

- Feature/integration work can be broad **before** release; release itself is narrow. Branch naming: `release/2027-WNN-short-scope`, draft PR → main, explicitly exact SHA and baseline parent. Avoid unrelated work, preserve original changes and no force-push to main.
- Before publication: content ledger and diff, per-family route count, added/removed/redirected canonicals, changed sitemap/image-sitemap counts, deterministic build, all relevant tests, no sensitive files or binary dump; immutable Netlify preview at exact SHA; cross-browser and 360/390/768/1280/1440 screenshots; print/download file checks; ad placeholder/live ad protected checks; SEO indexability/metadata; performance/CLS and a rollback plan.
- No preview analytics/AdSense billing/live creative leakage where production-isolation policy disallows it. Verify previews before allowing crawlers, ads or production-like instrumentation.
- Owner signs off exact artifact/commit; only then merge to main, which auto-deploys. Observe deployment ready, live pages/ads/indexability/print checks and regression alarms. If broken, rollback to known-good commit promptly.
- One coherent change in flight for SEO attribution. Cool-off on recently modified SEO pages; no repeated title churn or sitewide rewrites without evidence.
- Track GSC Web/Image separately, Bing source, impressions/CTR/rank by query/page, search sessions, pageviews, ad RPM and revenue where already available. Prioritize Tier 1 US/CA/UK/AU but never devalue legitimate global demand. Report no-traffic/no-revenue early rather than manufacturing success.
- Do not mark release successful merely because Netlify says `ready`. Real task and production checks are required.

## Program exit criteria

A visually coherent and responsive artwork-first site whose main user tasks are demonstrably easy; correct and reliable print/download files; indexable canonical art and images; strong accessible discovery/navigation; truthful provenance, privacy and ads; verified no-overlay ad-safety invariant; high-quality editorial curation of existing catalog; stable CI with representative browser acceptance; no accidental mass content publication; a sustainable release/measurement discipline. Search traffic and AdSense outcomes are measured but cannot be guaranteed.

## Owner review record

Every package must provide: problem and evidence, user-visible before/after, changed files, release SHA, tested routes and browser widths, tests/pass/fail, added/removed canonicals, ad checks, SEO risk, performance impact, preview URL, rollback SHA, timing/cooling-off, and explicit recommendation `RELEASE` or `HOLD`. `HOLD` is the default when evidence or acceptance is missing.
