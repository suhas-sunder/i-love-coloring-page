# Internal-link crawlability implementation

Date: 2026-08-06 (America/New_York)

## 1. Starting branch and HEAD

- Branch: `main`
- Starting HEAD: `f16321c12e871f268d4cf06662c9bc8f8a1ffc6b`
- Upstream: `origin/main`
- Starting divergence: `0` ahead, `0` behind
- Implementation commit: `41cab54a0afe44301cbd1851c843484690f1712b` (`fix: harden internal link crawlability`)

## 2. Starting Git status

The working tree was clean and nothing was staged. The implementation began only after branch, HEAD, upstream, and divergence matched the requested starting contract.

## 3. Files changed

Implementation commit:

- `package.json`
- `pipeline/lib/internal-link-graph.mjs`
- `pipeline/scripts/internal-link-crawlability-browser-qa-runner.cjs`
- `pipeline/scripts/validate-internal-link-crawlability.mjs`
- `pipeline/tests/internal-link-crawlability.test.mjs`
- `src/components/site/PublicPageShell.tsx`
- `src/lib/seo/pageJsonLd.ts`

Documentation evidence commit:

- `reports/2026-08-internal-link-crawlability-implementation.md`
- `pipeline/review/internal-link-crawlability/static-link-graph.json`
- `pipeline/review/internal-link-crawlability/static-link-graph-summary.md`
- `pipeline/review/internal-link-crawlability/browser-qa-results.json`
- `pipeline/review/internal-link-crawlability/production-route-smoke.json`
- `pipeline/review/internal-link-crawlability/production-browser-smoke.json`
- Three compact browser screenshots in the same review directory

The documentation commit hash is reported in the milestone completion response because a Git commit cannot contain its own hash.

## 4. Route inventory

The graph was derived from the fresh static export, not inferred only from source files. It classified 6,916 logical public HTML routes represented by 6,917 physical HTML files. The physical-file difference is the expected shared logical `/404` result represented by generated not-found output.

- Indexable HTML routes: 6,882
- Non-indexable HTML routes: 34
- Printable detail routes: 6,352
- Public hubs including the main gallery: 163
- Hub pagination routes after page one: 392
- Trust pages: 6
- HTML sitemap: 1
- Not-found route: 1

The main gallery has no `/coloring-pages/page/N` family in the accepted architecture. It renders its bounded root inventory while exhaustive printable discovery is provided by hubs and their static pagination. The validator records zero main-gallery pagination routes rather than inventing a new route.

## 5. Graph-extraction architecture

`pipeline/lib/internal-link-graph.mjs` provides a deterministic, dependency-free graph implementation that:

1. Enumerates actual `out/**/*.html` files.
2. Maps physical files to normalized public routes.
3. Tokenizes HTML without executing scripts.
4. Ignores link-like text inside raw `script`, `style`, `textarea`, and `title` contents.
5. Extracts real anchors, canonicals, H1s, element IDs, robots directives, visible breadcrumbs, and JSON-LD `BreadcrumbList` values.
6. Classifies anchor evidence by navigation, footer, breadcrumb, pagination, gallery card, featured card, related content, body content, and HTML sitemap regions.
7. Builds a full in-memory directed graph with raw-href and normalized-target evidence.
8. Compares the graph with generated printable/hub inventories, regular sitemap XML, and image sitemap XML.
9. Runs breadth-first traversal from the home route.
10. Emits only compact summaries and SHA-256 graph digests unless full evidence is explicitly requested.

The validator is QA/build tooling only. It is not imported into the browser application and adds no production bundle weight.

## 6. URL normalization rules

The normalizer handles root-relative links, relative links, absolute production URLs, encoded paths, fragments, queries, duplicate slashes, trailing slashes, and protocol/host variants. It:

- resolves relative paths against the source route;
- removes query and fragment state for graph identity while recording their presence;
- decodes safely without losing valid path meaning;
- normalizes the production origin and the root trailing-slash contract;
- distinguishes routes from static files;
- rejects external, `mailto:`, `tel:`, JavaScript, data, local-host, private-path, malformed, and unsupported targets;
- flags `/page/1`, noncanonical production host/origin forms, public SVG targets, and client-state discovery links;
- never turns a static file into a route node.

## 7. Route-family counts

| Route family | Logical routes |
| --- | ---: |
| Home | 1 |
| Main gallery | 1 |
| Main-gallery pagination | 0 |
| Hub page one | 162 |
| Hub pagination | 392 |
| Printable detail | 6,352 |
| Trust page | 6 |
| HTML sitemap | 1 |
| Not found | 1 |
| **Total** | **6,916** |

## 8. Node and edge counts

Final graph:

- Logical HTML nodes: 6,916
- Physical HTML files: 6,917
- Indexable nodes: 6,882
- HTML bytes parsed: 535,825,645
- Static internal anchor edges: 334,452
- Unique source-to-target route edges: 214,370
- Duplicate internal anchor evidence: 120,082
- Static-file anchors: 0
- Node digest: `8972dd9024f6df7809bc3a3e473fe6a3738e7e507c87c860b4b4308ba13154da`
- Edge digest: `b9c0fe61c0e86753d0755d77ddaa98981b066933d5d3c02d13ff3b4fa7efaf15`
- Evidence digest: `6dc9964fa004c1f5aff27ae5bc5343624efcf79c1d40544b0f6b29582cfaf988`

## 9. Initial broken-link findings

The first trusted baseline found zero broken visible internal links. Parser false positives found during harness development were corrected in the tooling rather than treated as application defects. Final count remained zero.

## 10. Initial orphan findings

The initial graph found zero orphaned indexable routes. All 6,352 printable routes and every indexable hub were reachable from normal static HTML links. Final count remained zero.

## 11. Initial weak-link findings

The initial graph found zero routes reachable only through the HTML or XML sitemap. Every indexable route had ordinary non-sitemap discovery. Final count remained zero.

## 12. Initial dead-end findings

The initial graph found zero public dead-end routes under the project policy. Final count remained zero.

## 13. Click-depth distribution

Depth from `/` across the normalized static graph:

- Minimum: 0
- Median: 3
- p90: 7
- p95: 10
- Maximum: 36
- Deepest route: `/coloring-pages/plushies/page/36`

The maximum follows the deliberately sequential hub-pagination contract. Each page has valid previous/next links and every printable on those pages receives a primary-hub inbound link; no route depended on JavaScript-only discovery.

## 14. Printable inbound-link distribution

Content-region inbound sources per printable:

- Minimum: 1
- Median: 10
- p90: 20
- p95: 25
- Maximum: 221

All 6,352 printables have at least one content inbound link and at least one inbound link from their primary hub sequence. Missing output, content inbound, and primary-hub inbound counts were all zero.

## 15. Hub inbound-link distribution

Inbound sources per hub:

- Minimum: 6
- Median: 129
- p90: 815
- p95: 1,454
- Maximum: 6,914

No indexable hub was orphaned or sitemap-only.

## 16. Gallery and pagination findings

The main gallery contains 121 static internal anchors and 67 unique internal targets in the generated export, including 96 gallery-card anchors. Its primary card destinations are crawler-visible without hydration.

There is no main-gallery page-two route. The production probe of `/coloring-pages/page/2` correctly returned 404. Adding that route would have changed the accepted public-route architecture and was neither needed nor authorized.

## 17. Hub pagination findings

The validator checked 159 paginated hub sequences covering 521 page-one and paginated pages. It verified membership coverage, stable page ordering, page-one canonical form, and previous/next continuity. Failures: zero.

## 18. Breadcrumb findings

The initial baseline found 554 structured/visible breadcrumb mismatches:

- 162 hub page-one routes
- 392 hub pagination routes

The visible breadcrumb began with Home, but hub `BreadcrumbList` JSON-LD began with Coloring Pages. The visible links themselves were correct and resolvable. After correcting the authoritative JSON-LD helper, 6,906 pages with breadcrumb contracts were checked and failures were zero.

## 19. Related-link findings

All 6,352 printable related-content regions were checked. Every related printable and related hub destination resolved to an approved route, with zero invalid or client-only targets. Production Chrome and Edge navigation through a related printable also passed.

## 20. Navigation and footer findings

Navigation and footer links were extracted from every generated HTML route and classified separately from content discovery. No unresolved destination, noncanonical path, duplicate ID contract, public SVG target, or client-only primary-discovery dependency was found. The accepted navigation inventory was not changed.

## 21. HTML sitemap findings

The HTML sitemap contains 168 governed inventory links within 184 total internal anchors. All approved public hubs and trust/discovery destinations expected by its contract resolve. It did not become the sole inbound source for any indexable route. Failures: zero.

## 22. XML and image sitemap findings

- Regular sitemap URLs: 6,520
- Image sitemap printable/image pairs: 6,352
- Missing/extra route associations: 0
- Public SVG image locations: 0
- Sitemap validation failures: 0

Production returned HTTP 200 for both XML files. A bounded production range request to the first image-sitemap asset returned HTTP 206, `image/webp`, valid RIFF/WEBP magic, and the expected public asset host.

## 23. Anchor-text findings

The validator checks empty accessible names, malformed text, internal identifier/path leakage, filename leakage, nested interactive anchors, and duplicate-ID consequences. Final anchor-text failures: zero. Local rendered-browser checks also found zero empty anchor names across the 224-check matrix.

## 24. Corrections implemented

Only one application defect was corrected: hub structured breadcrumbs now prepend Home so JSON-LD matches the visible breadcrumb hierarchy. A non-content deployment marker, `data-link-graph-version="static-crawl-v1"`, was added to the existing public page shell for bounded deployment verification.

No routes, links, memberships, taxonomies, page inventories, sitemaps, or content blocks were added or removed.

## 25. Source ownership of corrections

- `src/lib/seo/pageJsonLd.ts` remains the single owner of hub breadcrumb JSON-LD and received the Home item correction.
- `src/components/site/PublicPageShell.tsx` already owns public-shell deployment markers and received the graph-version marker.
- Graph extraction and validation live under `pipeline/`, outside application runtime ownership.

No generated output was hand-edited.

## 26. Before-and-after graph metrics

| Metric | Initial trusted baseline | Final |
| --- | ---: | ---: |
| Logical nodes | 6,916 | 6,916 |
| Indexable nodes | 6,882 | 6,882 |
| Static internal anchors | 334,452 | 334,452 |
| Unique route edges | 214,370 | 214,370 |
| Broken links | 0 | 0 |
| Orphans | 0 | 0 |
| Sitemap-only routes | 0 | 0 |
| Dead ends | 0 | 0 |
| Noncanonical edges | 0 | 0 |
| Client-only discovery findings | 0 | 0 |
| Pagination failures | 0 | 0 |
| Breadcrumb failures | 554 | 0 |
| Related-link failures | 0 | 0 |
| HTML/XML/image sitemap failures | 0 | 0 |
| Anchor-text failures | 0 | 0 |

The application change intentionally altered structured breadcrumb bytes, not visible route edges.

## 27. Performance of graph tooling

Final measured local run:

- Runtime: 65,600.79 ms
- Approximate peak JavaScript heap: 797,065,448 bytes
- Heap growth during run: 791,397,680 bytes
- HTML parsed: 535,825,645 bytes
- Compact JSON evidence: 12,136 bytes
- Markdown summary: 858 bytes

The first trusted baseline ran in 62,260.58 ms with an approximate 795,078,440-byte peak. The validator keeps the full graph transiently in memory and commits only summaries/digests, avoiding a multi-megabyte edge dump.

## 28. Accessibility results

Static and rendered checks confirmed useful link names, one H1, visible keyboard focus, no duplicate IDs, no nested interactive anchors, valid breadcrumb links, and no horizontal overflow. The deterministic Chrome interaction check focused an anchor named `ILI Love Coloring Page`; the production Chrome and Edge smoke focused an anchor named `Home`. No application console errors or keyboard navigation failures were observed.

## 29. Browser matrix

Local generated-export QA:

- Browsers: Chrome `151.0.7922.76`; Edge `151.0.4129.59`
- Coverage note: both are Chromium-based
- Widths: 390, 768, 1024, 1,440, 1,920, 2,400, and 3,440 CSS pixels
- Routes: 16 per width/browser, including home, main gallery, large/small/seasonal/paginated hubs, five printables from different primary categories, trust pages, sitemap, and 404
- Matrix checks: 224/224
- Failures: 0
- Interaction checks: pagination, printable breadcrumb, HTML sitemap link, and keyboard focus passed
- Horizontal overflow, malformed links, public SVG links, duplicate IDs, and console failures: 0

Production Chrome and Edge each passed Home to collection, collection card to printable, breadcrumb return, pagination Next/Previous, related printable, Back/Forward, and keyboard focus at 1,440 px. No console errors, horizontal overflow, or ad/link overlap occurred. Ad network requests were blocked only in this deterministic navigation smoke; no ad was clicked.

Evidence:

- `pipeline/review/internal-link-crawlability/browser-qa-results.json`
- `pipeline/review/internal-link-crawlability/chrome-390-animals.png`
- `pipeline/review/internal-link-crawlability/chrome-1024-pagination.png`
- `pipeline/review/internal-link-crawlability/chrome-1440-animals.png`
- `pipeline/review/internal-link-crawlability/production-browser-smoke.json`

## 30. Advertising regression results

- `npm run test:ad-layout-finalization`: 19/19 passed
- `npm run test:ad-fill-fallback`: 19/19 passed
- `npm run test:printable-ad-flow-correction`: 61/61 passed
- `npm run test:trust-ads-readiness`: 12/12 passed
- Export-safety scan: 69,561 files, zero prohibited-route ad findings
- Production preserved `data-ad-layout-version="manual-six-v2"`
- Trust, sitemap, and 404 production samples contained no prohibited ad wrappers
- No advertising source or configuration file changed

## 31. Printable-output regression results

`npm run test:export` passed 19/19. It retained default Letter portrait byte identity, one-page PDF geometry, lossless `/FlateDecode`, shared profile geometry, filenames, and existing PNG/JPG/WebP behavior. Printable source/output code did not change.

## 32. Protected-contract results

- Protected printable records: 6,352 unchanged
- Protected hash: `4fc394e39aa4d8e2b0e2e96ebbc586d00c91e5e18479748b72dbb6075e77bed6`
- Canonical paths, stable IDs, asset IDs, primary categories, hub memberships, related IDs, sitemap memberships, generated titles, generated hub content, and public asset URLs: unchanged
- Source images: unchanged
- Dependencies and lockfile: unchanged
- Netlify directives and environment configuration: unchanged
- `ads.txt`: unchanged

## 33. Commands and exact results

| Command | Result |
| --- | --- |
| `npm run test:internal-links` | 5/5 passed |
| `npm run test:crawl` | 8/8 passed |
| `npm run test:canonical` | 8/8 passed |
| `npm run test:gallery-discovery-quality` | 8/8 passed |
| `npm run test:editorial-seo` | 27/27 passed |
| `npm run test:discovery-ux` | 12/12 passed |
| `npm run test:performance-accessibility` | 7/7 passed |
| `npm run test:printable-ux-correction` | 27/27 passed |
| `npm run test:export` | 19/19 passed |
| `npm run test:ad-layout-finalization` | 19/19 passed |
| `npm run test:ad-fill-fallback` | 19/19 passed |
| `npm run test:printable-ad-flow-correction` | 61/61 passed |
| `npm run test:trust-ads-readiness` | 12/12 passed |
| `npm run test:route-preservation` | 1/1 passed |
| `npm run typecheck` | Passed |
| `npm test` | 221/221 passed in 238.8 s |
| `npm run build` | Passed; 6,920/6,920 pages; 6,352 protected records |
| `npx next build` | Passed during isolated build verification; 6,920 pages |
| `npm run validate:internal-links -- --write-evidence` | Passed; zero graph defects |
| `npm run qa:internal-links` | 224/224 browser matrix checks passed |
| `npm run validate:static-routes` | Passed; 7 valid routes returned 200 and 8 invalid routes returned 404 |
| `npm run validate:export-safety` | Passed; 69,561 files; zero findings |
| `npm run validate:image-sitemap` | Passed |
| `npm run validate:refinement` | Passed |
| `git diff --check` | Passed |

During setup, a first background build attempt collided with another still-running Windows build process after two intentionally short command timeouts. That detached process finished without producing the required fresh `out/`. No application change was made to conceal it. A clean single foreground `npx next build` and the final normal `npm run build` both succeeded. The initially stale build output was removed using validated repository-local paths.

Generators rewrote known readiness/report artifacts during verification. The following noise was restored to exact HEAD each time: trust-ad readiness JSON, image-sitemap validation JSON/report, and related-printable report/CSV. No advertising or generated-data change remained.

## 34. Commit and push results

- Implementation commit: `41cab54a0afe44301cbd1851c843484690f1712b` — `fix: harden internal link crawlability`
- Implementation push: accepted by `origin/main` (`f16321c..41cab54`)
- Push timestamp: `2026-08-06T21:21:35.8117125-04:00`
- Post-push divergence: `0` ahead, `0` behind
- Documentation evidence commit: the commit containing this report, with final hash recorded in the completion response

No force push or manual deployment was used.

## 35. Netlify deployment timeline

- Push: `2026-08-06T21:21:35.8117125-04:00`
- No production request was sent during the required initial quiet period.
- Quiet-period confirmations: `21:22:45.6973183`, `21:23:54.5855449`, and `21:25:01.5731986` America/New_York.
- First post-quiet request: immediately after `21:25:01`; the command runner truncated its response capture, so it was treated as inconclusive and no deployment claim was made from it.
- Conclusive poll: `2026-08-06T21:27:40.3327159-04:00` — HTTP 200, marker present.
- First conclusive marker timestamp: `2026-08-06T21:27:40.3327159-04:00`
- Push-to-conclusive-marker duration: approximately 6 minutes 5 seconds

Polling stopped as soon as the marker was conclusively captured. No manual deployment or platform-setting change occurred.

## 36. Production marker verification

Route: `https://www.ilovecoloringpage.com/coloring-pages/animals`

- HTTP status: 200
- Marker: `data-link-graph-version="static-crawl-v1"`
- HTML bytes at marker poll: 197,490
- New JavaScript asset observed: `/_next/static/chunks/0n35cz-_9zsnr.js`
- Existing runtime marker retained: `data-runtime-optimization-version="client-split-v1"`
- Existing advertising marker retained: `data-ad-layout-version="manual-six-v2"`

## 37. Production link-smoke results

A bounded HTTP sample covered 16 HTML routes: home, main gallery, large/small/seasonal hubs, hub page two, five printable categories, Privacy, Terms, About, HTML sitemap, and a 404. All 16 returned their expected status, carried the deployment marker, and had one H1. Sampled canonicals matched linked route forms; the home canonical intentionally uses the origin without a trailing slash. Sampled anchors contained no `/page/1`, public SVG, localhost, private-machine, or query-state route defects.

The accepted architecture has no main-gallery pagination route; a direct production probe of `/coloring-pages/page/2` returned the expected 404. Hub pagination at `/coloring-pages/animals/page/2` returned 200 and Next/Previous navigation passed.

Production root artifacts:

- `robots.txt`: 200, plain text, both regular and image sitemaps declared
- `sitemap.xml`: 200, XML, 6,520 URLs
- `image-sitemap.xml`: 200, XML, 6,352 image entries, zero SVG entries
- Sample public WebP: 206 range response, `image/webp`, valid RIFF/WEBP magic
- `/ads.txt`: 200, `text/plain`, exact 58-byte record, no BOM

Production Chrome and Edge browser flows resolved a home collection link, a gallery printable card, a breadcrumb, pagination Next/Previous, and a related printable, then verified Back/Forward and keyboard focus. Console errors, horizontal overflow, and ad/link overlap were zero. Evidence is in `pipeline/review/internal-link-crawlability/production-route-smoke.json` and `production-browser-smoke.json`.

## 38. Remaining Firefox, WebKit, Safari/iOS, screen-reader, and real-device checks

Chrome and Edge results are Chromium coverage, not independent engine coverage. Remaining manual gates:

- Firefox current stable at representative mobile and desktop widths
- Playwright WebKit, accurately described as WebKit rather than real Safari hardware
- Real Safari on macOS and iOS
- NVDA/Firefox, JAWS/Chrome, and VoiceOver/Safari link and breadcrumb reading order
- Physical mobile reflow and touch navigation
- Low-memory device validation for the offline graph tool is optional; it is not shipped to users

## 39. Protected-boundary confirmation

This phase did not change or add canonical routes, printable slugs, stable IDs, asset IDs, primary categories, taxonomy, hub membership, related IDs, sitemap membership, generated titles, generated hub content, source images, public asset URLs, public SVG policy, printable output, PDF/image composition, advertising behavior, `ads.txt`, trust-page meaning, dependencies, environment variables, Netlify directives, deployment configuration, analytics, Cloudflare, DNS, AdSense account settings, consent systems, or external services.

No manual deployment, force push, external-service modification, or ad click occurred.
