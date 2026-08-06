# Advertisement fill/fallback verification

## Result

Superseded August 4, 2026: advertising no longer has an OFF, PLACEHOLDER, development, test, or production mode. Eligible pages always emit the same configured real units and hidden neutral fallback siblings.

| Page state | Script and real units | Fallback | Transition |
| --- | --- | --- | --- |
| Pending | Real units are visible to AdSense and the script loads once | Hidden | Initial route state |
| Fallback | Requests remain observable; unresolved/unfilled surfaces do not overlap the fallback | Visible at approved responsive placements | All initialized units unfilled, script/init failure, or timeout |
| AdSense present | Verified filled or optimized units remain available | Hidden everywhere for the route lifecycle | Official `filled` or `unfill-optimized` plus a visible non-zero Google-managed surface |

`data-ad-status` is authoritative, but raw status alone is not accepted as visible-content evidence. `data-adsbygoogle-status` remains diagnostic only. A blank optimized unit keeps its own fallback hidden without globally suppressing other eligible fallbacks. The active manual six-position layout and fixed-header dimensions are recorded in `reports/2026-08-ad-layout-finalization.md`.
