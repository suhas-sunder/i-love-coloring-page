# Round 4Q Ad Visibility Report

- Placeholders visible when enabled: true
- Placeholders hidden when disabled: true
- Label text visible when enabled: true
- Placement count changed: false
- Styling changed: true
- Live ad code added: false
- No ad inside nav: true
- No ad inside gallery grid: true
- No ad beside Print/Download controls: true

Placeholder-off preview command:
`$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'; Remove-Item Env:NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS -ErrorAction SilentlyContinue; npm run build; npx serve out -l 3005`

Placeholder-on preview command:
`$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'; $env:NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS='1'; npm run build; npx serve out -l 3005`
