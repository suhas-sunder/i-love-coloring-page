# Codex run 01: finish the immediate iLoveColoringPage UX and production-safety recovery

**Recommended model:** Sol HIGH (complex shared UI + production/release risk; not a short mechanical job). **Work mode:** long uninterrupted implementation with repeated real-browser verification. You are the implementer; do not return merely a plan.

## Facts and authority

Production repository: `suhas-sunder/i-love-coloring-page`. This is a **Next.js static export** containing the actual ~6,352-page coloring catalog; **DO NOT** use the similarly named `suhas-sunder/coloringpage` repository, which is a starter. Netlify production project `i-love-coloring-page` deploys from `main` automatically. Current initial baseline production/main commit `3850567fc6c26df17d5c30b8a2d6a5c3c1ef50ec`. Revalidate all identities and SHAs before starting.

Read in this order:
1. `AGENTS.md`
2. `ai-issues/AD-PLACEHOLDER-SAFETY.md` (newer owner directive, protected)
3. `ai-issues/COLORING-2027-MATURITY-PROGRAM.md`, `ai-issues/SEARCH-BASELINE-2026-11-13.md` on `planning/2027-maturity-program`.
4. `reports/2026-08-professional-site-audit.md`, `reports/2026-08-comprehensive-change-plan.md`, later August implementation reports, `docs/hub-editorial-model.md`, current tests and route/layout architecture.
5. Actual source and current deployment. Old reports are leads, NOT authority about current code.

The user explicitly says the product is a shell and wants an excellent artwork-first UI/UX, **not the shortest path**, real implementation, full verification, then immediate review-ready branch. Codex must inspect worktree and branch state first. Preserve unrelated changes. The pre-created branch `fasttrack/2026-11-ui-ux-recovery` exists; use it safely or make an appropriately named child/worktree without rewriting it.

## Target result

Create a cohesive, polished, mobile-first visual and functional experience across homepage, collection gallery, nested categories, 1,704-item Plushies example, search/filter/pagination, printable detail pages, actual artwork preview, Print/download, navigation/header/footer, loading/error states and keyboard workflows. Treat every area as an integrated product, not separate one-off aesthetic patches. **A beautiful screenshot that makes the utility less usable is a failure.**

Prioritize **reliability or severe UX defects** before decoration. Scope is presentation/interaction, stable shared primitives and necessary narrowly proven image-rendering fixes. Do not grow the indexed content catalog in this urgent track.

## Research and baseline before editing

- Inventory actual shared components and design tokens, `app/page.tsx`, `app/coloring-pages`, `app/printables`, `src/components`, `src/styles`, `src/lib/coloring`, image resolver, ad slots and pipeline build ownership. Find exact ownership rather than duplicating layout/logic.
- Browse production and create screenshots of representative desktop/tablet/mobile routes at 360, 390, 768, 1280, 1440, light/dark if supported, first load, after filtering, with full interactive states, keyboard focus, with and without ads when safely testable. Include real example printable, high-traffic hubs, deep paginated hub, empty search, failed image, delayed image.
- Read user task expectations for real coloring galleries (parents, teachers and adult users): category discovery, visible artwork, filter/search, preview, print, true download formats, correct paper/scale/orientation, no account wall, relevance of related work. Use public competitors as reference without copying.
- Verify the `Loading preview` text observed in search extraction: check raw HTML, rendered DOM, actual `img src`/alt, hydration/image loads, lazy loading and crawler behavior before claiming a defect. It may only be a benign placeholder. If confirmed, correct the shared underlying behavior rather than hiding the symptom.
- Define an acceptance matrix linking every identified UX issue to a reproducible problem, owner, component(s), desired user behavior, and before/after proof. Avoid subjective assertion as the only evidence.

## Implementation, not just an audit

Work in manageable commits on the fast-track branch, with each change functional and tested before the next. Do as many real, coherent improvements as the underlying evidence supports. Reuse component abstractions, tokens and accessibility helpers rather than patching route by route. Examples of potential areas **only if confirmed**:
- Stronger artwork-first homepage and category discovery, with visual hierarchy that foregrounds useful printables rather than long mechanical text blocks.
- Clear, proportional card image previews; readable art and title; concise separate Print/download affordances; avoid a 48-card 32,000px mobile scroll of identical oversized actions.
- Better gallery filters/search, sensible mobile filter disclosure, clear results count and reset; no hidden or unusable controls; better deep pagination.
- Printable pages where the artwork, format/size, printing and downloading are immediately understandable. Confirm actual output bytes/format/page dimensions, not labels alone.
- Unified header, navigation, breadcrumbs and useful related content; links lead to meaningful category/canonical routes.
- Good image-loading, empty/error/offline states; non-blocking fallback, appropriate priority for above-the-fold visual media.
- Real focus styles, accessible controls, correct role/label semantics, accurate print descriptions, no unexpected horizontal overflow; stable layouts across 360–1440px.
- Clear user feedback on download/print states without dead buttons or fake progress.

Do not waste cycles on arbitrary decorative redesign, generic gradient/cards, unsupported editorial marketing, or SEO-text padding. Document why each visual direction better supports a specific task. Reconcile typography/color tokens with existing design contracts before changing them.

## Non-negotiable safety

- **No changes to advertising lifecycle, loading, fill detection, placeholder global suppression, or ad layout during this generic UI work.** See protected October 14 directive. Do not cover actual creatives with overlays or controls. If improving adjacent UI would affect ads, leave that part and flag a separate owner decision.
- Frozen canonicals, IDs, one indexable printable page per approved runtime asset, source-image immutability, approved/blocked image manifests, static export, image sitemap and public WebP/internal SVG remain intact. No mass conversion, bulk asset generation or binary commits.
- No sitemap/robots/noindex/redirect changes, page-count explosion, invented activity claims, SEO title rewrite, paid service, ad trial, environment variable or credential change in fast-track.
- No edits to unrelated paths, no silent lockfile upgrades. Protect existing user's modifications and `ai-issues`.
- Preserve current print/save/download behavior and precise output semantics; if output was previously broken, prove regression before changing underlying generation.

## Acceptance and release packaging

Run actual applicable commands from `package.json`, including `typecheck`, `build`, `verify:release`, `validate:static-routes`, `validate:image-sitemap`, `validate:crawl`, `validate:internal-links`, `validate:accessibility`, `validate:page-layout`, `validate:payload`, `qa:visual-polish`, `qa:cross-browser-accessibility`, `qa:paper-profiles` and affected unit tests. Use dedicated local/preview outputs and do not run unnecessary full source image conversion. Some tools may require prerequisites; discover and run correctly instead of skipping silently.
- Browser matrix must include Chromium and WebKit where available, desktop and mobile, keyboard and touch simulation. Check dark mode only if the product supports it.
- Capture before/after real screenshots (no mocks masquerading as live), browser console/network failures, a11y results, representative manual print/output files and exact page sizes, any performance or bundle delta.
- Verify ad-shell stacking and non-overlap with actual safe staging conditions. Do not claim live-AdSense safety from a mock or placeholder-only test; describe coverage limitations honestly.
- Check production `main` has not changed before handoff. If it has, rebase/reconcile without force and re-run impacted gates.

## Git delivery

- Commit **to the dedicated fasttrack branch only**, in logical changes; push that branch and open/update a **DRAFT PR into `main`**.
- No merge, no push to main, no production deployment or automated approval. An immutable Netlify preview at exact branch SHA is required if hosting safely provides one; if unavailable, report blocker and screenshots from equivalent local build.
- Create/update `ai-issues/FASTTRACK-UX-REVIEW.md` in the branch with issue-by-issue evidence, before/after screenshots URLs/paths, tested routes/widths, release SHA, confirmed acceptance and outstanding exceptions. Do not assert completion because a high-level report exists.
- Iterate on browser/owner-found defects until genuine acceptance or a proven blocker; keep unrelated good work moving if one item is blocked.
- Record exact source files changed, output artifacts, test commands and pass/fail, new/fixed regressions, canonical/sitemap/ad checks, rollback SHA and precise instructions for owner approval of the PR.

Do not optimize for fastest completion, smallest change count, or an arbitrary “good enough” screenshot. Optimize for a coherent, properly engineered, thoroughly verified site while keeping this **urgent** branch independent of the later year's editorial release train.
