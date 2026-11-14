# Search baseline and evidence — 2026-11-13

This is the frozen comparison baseline for the maturity program. Source files are owner-supplied exports, not live connected GSC data:
- Google Search Console: `ilovecoloringpage.com-Performance-on-Search-2026-11-13.zip`, Filter: **Web**, May 11–Nov 10, 2026, 184 dates.
- Bing Search Performance Overview: `ilovecoloringpage.com_SearchPerformanceOverview_All_11_13_2026.csv`, May 13–Nov 10, 2026, 182 dates.

Do not confuse **Web search** with Google Images, which is a major unmeasured opportunity for a coloring-site business. Do not claim a manual action or indexing penalty from impression declines alone. GSC Wizard access was unavailable on 2026-11-13 due to an expired trial; do not propose paying for it automatically.

## Google Web

| Month | Clicks | Impressions |
|---|---:|---:|
| May (partial) | 1 | 47 |
| June | 6 | 236 |
| July | 56 | 2,870 |
| August | 29 | 1,726 |
| September | 7 | 94 |
| October | 6 | 97 |
| November 1–10 | 0 | 14 |
| Total | **105** | **5,084** |

Last 28 dated rows through Nov 10: **1 click / 66 impressions**; previous 28 dated rows **9 clicks / 89 impressions**. July 17–31 generated 47 clicks / 2,624 impressions, a dramatic brief concentration. Time-series investigation must correlate this with deployments, Google indexing, SERP demand, crawling and content changes; do not infer cause from timing alone.

The `Pages.csv` export includes up to 1,000 rows, and the `Queries.csv` export only 332 queries (17 visible query clicks). Row sums are not reliable substitutes for sitewide daily totals because exports have privacy/anonymization and reporting limitations. Top pages over the six-month export included homepage (36 clicks/618 impressions), Plushies hub (7/593), and Crested Gecko printable (5/39). Search queries were diffuse and hyper-specific; brand terms contributed some impressions.

## Bing Search Performance Overview (scope: All in supplied export)

| Month | Clicks | Impressions |
|---|---:|---:|
| May (partial) | 1 | 112 |
| June | 2 | 207 |
| July | 10 | 1,015 |
| August | 3 | 495 |
| September | 8 | 1,333 |
| October | 15 | 24,555 |
| November 1–10 | 5 | 11,338 |
| Total | **44** | **39,055** |

Last 28 dated rows through Nov 10: **13 clicks / 30,525 impressions**, CTR **0.043%**, against 11 clicks/6,440 impressions in prior 28 rows. This is a severe display-to-click mismatch, but Bing's `All` view is not necessarily directly comparable to Google's Web-only filter. Investigate query/page distribution, image vs Web scope where available, countries, positions and SERP appearance before changing snippets.

## Technical/product baseline

- Live production exposes ~6,352 canonical printables and many useful category hubs.
- Live homepage's text extraction shows repeated `Loading preview` messages. This is an **investigation trigger, not proof** that image markup/Google's rendered DOM is broken. Verify raw HTML, rendered DOM, actual `<img src>`, `alt`, image response, crawlable assets and Google URL Inspection if available.
- Production Netlify project `i-love-coloring-page` is sourced from `suhas-sunder/i-love-coloring-page`; latest confirmed October 15 ready deploy `6ad02ce7a3b81b328b9ac0e2`, source commit `3850567fc6c26df17d5c30b8a2d6a5c3c1ef50ec`; Next.js static export generated 6,917 pages and no Netlify Functions.
- The different repo `suhas-sunder/coloringpage` is a starter and **must not** be used for production implementations.
- Owner-protected advertising behavior: `ai-issues/AD-PLACEHOLDER-SAFETY.md` takes precedence over older conflicting descriptions; do not change it in unrelated work.
- Historical August reports are useful leads but not evidence defects still exist; verify current main and immutable preview before each issue.
- Assets are externally hosted; original images are immutable and large generated/binary image sets must not enter Git.

## Baseline collection for each release

Freeze `main` SHA, candidate SHA, Netlify immutable preview, page count, sitemap count, image sitemap count, canonical validation, robots/noindex, GSC Web AND Image if available, Bing source-scope, page/category traffic, device/country split, monetizable sessions/pageviews (if available), AdSense metrics if available, and browser QA. Annotate metric lag, partial months, GSC anonymization, and any site-structure changes. 

A single week's traffic movement never proves causality. Prefer same-length settled comparisons with 4–8 weeks of observation for SEO experiments.
