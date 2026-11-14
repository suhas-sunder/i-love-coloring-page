# Fast-track UX audit ledger

Baseline: `3850567fc6c26df17d5c30b8a2d6a5c3c1ef50ec`, clean fast-track branch, 2026-11-13 owner date. Production browser evidence: `pipeline/review/fasttrack/before/`. No production mutations. Advertising requests blocked during automated browsing; this does not establish live-ad safety.

| Problem / evidence | Family / shared owner | User impact and correction | Verification |
|---|---|---|---|
| Decoded 341px WebP has computed opacity 0 without JS | All artwork / AssetImage and CSS | Images depend on hydration despite real SSR markup. Keep native images visible independently of React load state; retain failure replacement. | JS-disabled Chrome/WebKit, delayed/cached/failed media, real CDN |
| Main library stops at 48, no pager or Show more | Gallery / GallerySearch | Cannot browse the advertised full library without inventing a query. Extend existing intent-loaded data with bounded unfiltered continuation. | 48→96 unique canonical cards; fetch failure/retry; no initial catalog hydration |
| Deep Plushies page 36 has no local search/filter | Pagination / HubPageContent | Must return to page one to find another subject. Reuse scope-aware explorer on paginated collections. | Full 1,704-item query on last page; reset returns original 24; crawlable Previous/Next |
| Featured block puts eight cards before local search; 390px Animals page ~19,467px | Hub / RotatingFeaturedGrid, shared CSS | Excess scrolling before task controls. Make featured artwork a bounded, keyboard-accessible horizontal shelf; add direct gallery jump. | 360–1440 screenshots, focus scroll, actual media |
| Home at 390px ~11,034px; six full-height category tiles plus repeated explanatory copy | Home / HubCard, hero | Discovery feels like another long image directory. Compact illustrated category rows and real canonical artwork in introduction; concise task-oriented copy. | Before/after first screen, all category destinations, no featured duplication |
| No sorting; query/filter state lost after navigation/remount | Explorer | Returning from artwork loses discovery context. Session-local scoped state, explicit reset and stable alphabetical/relevance choices. | Back/reload, different collection isolation, storage denied, empty/reset, deterministic ties |
| Collection fetch has no timeout | GallerySearch | Slow/offline request can leave matching results loading indefinitely. Bound request and offer explicit retry, preserve static content. | Stalled request, retry, unmount cleanup |
| Detail image is static low-resolution preview without inspect action | Printable / shared preview dialog | Cannot inspect lines without discovering Print opens a preview. Add an explicit enlarge action and zoom, using existing internal conversion only on intent. | Keyboard/touch, high-resolution raster, close focus restore, error retry |
| Detail facts/download rows dominate mobile; repeated empty status gap | Printable / actions, CSS | Output choice is verbose and hierarchy inconsistent. Group secondary image formats, concise default paper guidance, flatter action workspace. | Format truth, actual bytes, no nested surfaces, mobile actions |
| Brand becomes only “IL” at 390px; footer is undifferentiated links | Shared header/footer | Weak orientation and supporting discovery. Keep a compact readable wordmark; group existing footer destinations. | 360px/reflow, accessible navigation names, route preservation |
| Filter Done removes focused element; active filters are only a comma list | GalleryFilters / explorer | Keyboard focus loss and cumbersome individual removal. Return focus to trigger; offer labeled removable selections. | Keyboard Done/Escape, mobile draft/apply/cancel |

## Source conflicts resolved

- October protected ad directive and current AGENTS contract supersede old placeholder/build-switch and ad rollout recommendations. Ad code, placements, lifecycle and suppression remain KEEP.
- August 6 default-only printable correction supersedes the earlier paper-controls implementation. Public outputs stay Letter portrait; A4/orientation/scale remain internal tests.
- August already fixed one-column mobile galleries, direct PDF, compression, related ranking and search placeholder grammar. Those are not claimed as new repairs.
- Large catalog and existing route/indexability architecture remain unchanged. No title/content expansion or taxonomy work.

## Research used for task design

Read-only reference review: [Monday Mandala animal index](https://mondaymandala.com/animal-coloring-pages/) emphasizes subject destinations and printable documents; [Just Color mandalas](https://www.justcolor.net/coloring-mandalas/) offers visible sorting and artwork selection; [Crayola categories](https://www.crayola.com/free-coloring-pages) separates featured discovery from a category index. These support clear subject entry points, inspectable art, bounded browsing and explicit output choices. No artwork, copy, unsupported audience/difficulty labels or licensing claims are copied.
