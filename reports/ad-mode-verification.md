# Advertisement mode verification

## Result

Updated August 4, 2026: advertising mode is automatic. Development and tests use noninteractive placeholders; production uses the centralized confirmed publisher and slot map without a project-specific environment switch.

| Mode | Script | Surface | Initialization | Verified behavior |
| --- | --- | --- | --- | --- |
| OFF | Never loaded | No label, container, or reserved space | None | Invalid centralized publisher or slot configuration only. |
| PLACEHOLDER | Never loaded | Stable development-only layout marker | None | Automatic in development and tests. |
| LIVE | Loaded once when the first eligible unit is near the viewport | Explicit mapped slot | Element initialized once | Automatic in production with valid centralized configuration. |

The original disappearing area was a development placeholder rendered unconditionally and then hidden by responsive/hydration conditions; it was not an AdSense fill result. Existing locations remain in `reports/ad-placement-map.csv`. Lower-content and supporting-square placements remain governed by the accepted responsive density policy.
