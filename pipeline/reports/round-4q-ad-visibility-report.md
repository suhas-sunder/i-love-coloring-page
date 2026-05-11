# Round 4Q Ad Visibility Report

- Placeholders visible when enabled: true
- Placeholders hidden when disabled: true
- Label text visible when enabled: true
- Placement count changed: true
- Styling changed: true
- Header/banner visible when enabled: true
- Mobile/small-screen banner visible when enabled: true
- Left and right rails visible on wide desktop: true
- Rail safe gap from content: true
- Side rails hidden on tablet and mobile: true
- Live ad code added: false
- No ad inside nav: true
- No ad inside gallery grid: true
- No ad beside Print/Download controls: true

Total ad count by page type and viewport:
- home: total 5, desktop 3, wide desktop 5, tablet 3, mobile 3
- galleryLanding: total 5, desktop 3, wide desktop 5, tablet 3, mobile 3
- hubPage: total 5, desktop 3, wide desktop 5, tablet 3, mobile 3

Recommended future AdSense units:
- ilcp-coloring-pages-header-banner
- ilcp-coloring-pages-inline-after-featured
- ilcp-coloring-pages-inline-lower
- ilcp-home-header-banner
- ilcp-home-inline-after-hero
- ilcp-home-inline-lower
- ilcp-hub-header-banner
- ilcp-hub-inline-after-gallery
- ilcp-hub-inline-lower
- ilcp-rail-left-desktop
- ilcp-rail-right-desktop

Placeholder-off preview command:
`$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'; Remove-Item Env:NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS -ErrorAction SilentlyContinue; npm run build; npx serve out -l 3005`

Placeholder-on preview command:
`$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'; $env:NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS='1'; npm run build; npx serve out -l 3005`
