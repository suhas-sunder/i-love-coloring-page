# Public-file decision record

Decision and application date: 2026-07-21

The three files were inspected before the owner questionnaire and were untracked. The owner then approved their removal. No other public file was changed by this decision.

| File | Inspected state | Owner decision | Applied result | Export result |
| --- | --- | --- | --- | --- |
| `public/ads.txt` | One syntactically plausible but unverified Google publisher declaration; local exports copied it; live route returned 404 | Remove and keep absent | Removed; not staged or tracked | `out/ads.txt` absent |
| `public/favicon.ico` | Valid 16x16, 32x32, and 48x48 ICO with a blue legacy mark conflicting with purple IL branding | Remove and use tracked IL icon | Removed; `app/icon.svg` retained | `out/favicon.ico` absent; `out/icon.svg` present |
| `public/robots.txt` | Stale WordPress-era policy, bot-specific blocks, and only the image-sitemap reference | Remove and use `app/robots.ts` | Removed; generated implementation unchanged | Generated `out/robots.txt` allows public content and references both sitemaps |

## Safety result

- Publisher identifier published: no
- Publisher identifier treated as verified: no
- LIVE advertising enabled: no
- AdSense script or slot added: no
- Conflicting legacy icon published: no
- Stale robots policy published: no
- Three public/noindex hub decisions preserved: yes

The files were never tracked, so Git cannot restore them. The approved decisions are preserved in this report and the final owner-input/readiness configuration.
