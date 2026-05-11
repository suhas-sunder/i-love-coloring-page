# Round 4S Ad Visibility Proof

- Why placeholders were hard to see before: Round 4R made the shell too quiet by using a paper-soft background and muted label, so manual review could miss the enabled placeholders.
- Placeholders hidden when flag off: true
- Placeholders visible when flag on: true
- Required pages have visible Advertisement labels: true
- Placeholder-off visible Advertisement labels: 0
- No ad-caused horizontal overflow: true
- Live ad code present: false
- Publisher or client IDs present: false

Visible Advertisement label counts by page type:
```json
{
  "home": {
    "mobile-390": 3,
    "mobile-430": 3,
    "tablet-768": 3,
    "landscape-1024": 3,
    "desktop-1440": 3,
    "wide-1920": 5,
    "ultra-2560": 5
  },
  "galleryLanding": {
    "mobile-390": 3,
    "mobile-430": 3,
    "tablet-768": 3,
    "landscape-1024": 3,
    "desktop-1440": 3,
    "wide-1920": 5,
    "ultra-2560": 5
  },
  "hubPage": {
    "mobile-390": 3,
    "mobile-430": 3,
    "tablet-768": 3,
    "landscape-1024": 3,
    "desktop-1440": 3,
    "wide-1920": 5,
    "ultra-2560": 5
  }
}
```

Screenshot roots:
- pipeline/review/round-4s/screenshots/ad-placeholders-on
- pipeline/review/round-4s/screenshots/ad-placeholders-off
