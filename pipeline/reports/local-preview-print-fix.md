# Local Preview Print Fix

- Root cause: The print popup wrote a preparing page before SVG conversion and did not replace it when conversion failed or stalled.
- Print works: true
- PNG download works: true
- JPG download works: true
- WebP download works: true
- SVG download absent: true
- No uncaught Promise rejections observed: true
