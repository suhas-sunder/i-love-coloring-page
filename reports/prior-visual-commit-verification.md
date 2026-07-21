# Prior visual commit verification

Commit `09690fe44fb741958a0ca5add9505e27ef7732a0` exists in the verified repository and is an ancestor of current HEAD. Its presence was treated only as a source lead. Browser output from the verified local export supplied the acceptance evidence.

## Claimed file groups

The commit changed 53 paths:

- Public visual implementation: `src/styles/components.css` and `src/components/site/GlobalSearchDialog.tsx`.
- Supported commands and safeguards: `package.json`, `pipeline/scripts/build-metadata-review-workflow.mjs`, and `pipeline/scripts/validate-refinement-contracts.mjs`.
- Active tests: `pipeline/tests/metadata-review-workflow.test.mjs` and `pipeline/tests/refinement-contracts.test.mjs`.
- Historical test archive: 27 former round snapshot tests moved to `pipeline/tests/historical/` with `.disabled` suffixes, plus the archive README.
- Generated decision data: `pipeline/manifests/metadata-review-decisions.json` and `pipeline/manifests/trust-ads-readiness.json`.
- Reports: the visual, framing, advertising, metadata-review, legacy-test, readiness, performance, browser-QA, and implementation-priority reports added or updated by that commit.

All claimed files are present at current HEAD. None of the two visual implementation files was deleted, bypassed, or reverted by commit `46ee135`.

## Active wiring

- `src/styles/components.css` is part of the production stylesheet imported by the application layout.
- `SiteHeader` is rendered by `app/layout.tsx` on public routes.
- `GlobalSearchDialog` is lazy-loaded from `SiteHeader` and rendered in both desktop and mobile search states.
- `MobileNav` is rendered by `SiteHeader` and consumes the shared navigation model.
- `HubCard` is rendered on the homepage, gallery landing page, child-collection modules, and related-collection modules.
- Printable gallery cards and `PrintableDetailPage` are present on public hub and canonical printable routes.
- The archived `.disabled` files are absent from the supported `npm test` command.

## Browser verification

Confirmed visible from the verified `out/` export:

- Portrait-first collection cards and 2:3 printable-card frames.
- Search Close control in the top heading row.
- Compact mobile search sheet with body scroll locking and one internal scroll region.
- Full-viewport mobile navigation with focus on the Close control.
- Narrow trust-page reading measure.
- Trigger-relative Categories and Seasonal disclosures at roomy desktop widths, with a compact viewport-centered fallback.

## Defect found during independent verification

The Seasonal disclosure was still trigger-centered at 1152px and 1280px. Its right edge reached 1169px in a 1152px viewport and 1297px in a 1280px viewport, creating approximately 18 CSS pixels of horizontal overflow and visibly clipping the count column.

The correction anchors the roomy-desktop Seasonal panel to the trigger's right edge and retains the viewport-centered fallback at widths up to 1100px. Fresh after-browser measurements show zero horizontal overflow at 1024, 1152, 1280, 1366, 1440, and 1920 CSS pixels.

## Disposition

- Files no longer used: none among the public visual implementation paths.
- Code paths bypassed: none found.
- Prior changes visible in browser: card framing, search layout, trust measure, Categories layout, and mobile modal foundations.
- Prior changes not accepted without correction: Seasonal positioning at intermediate desktop widths.
