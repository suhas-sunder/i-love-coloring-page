# Advertisement fill/fallback verification

## Result

Superseded August 4, 2026: advertising no longer has an OFF, PLACEHOLDER, development, test, or production mode. Eligible pages always emit the same configured real units and hidden neutral fallback siblings.

| Page state | Script and real units | Fallback | Transition |
| --- | --- | --- | --- |
| Pending | Real units are visible to AdSense and the script loads once | Hidden | Initial route state |
| Fallback | Requests remain observable; unresolved/unfilled surfaces do not overlap the fallback | Visible at approved responsive placements | All initialized units unfilled, script/init failure, or timeout |
| AdSense present | Filled or optimized units remain available | Hidden everywhere for the route lifecycle | Any `filled` or `unfill-optimized` result |

`data-ad-status` is authoritative. `data-adsbygoogle-status` remains diagnostic only. Existing locations remain in `reports/ad-placement-map.csv`; the accepted responsive density policy is unchanged.
