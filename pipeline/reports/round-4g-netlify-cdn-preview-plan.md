# Round 4G Netlify CDN Preview Plan

Generated: 2026-05-10

## Static App

The app remains frontend-only. `next.config.mjs` uses static export, Netlify publishes `out`, and media URLs resolve through `NEXT_PUBLIC_COLORING_ASSET_BASE_URL`.

## Preview Command

```powershell
$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='https://assets.example.com/coloring/test-v1'; npm run build; npx serve out
```

Open the pages listed in the manual checklist and confirm:

- image previews render from the R2 custom domain
- Download PNG uses the public PNG URL
- Download SVG uses the public SVG URL
- Print uses the configured public media URL
- no request is made to `app/api/coloring-assets`
- no production media is copied into `public/`

The preview can also be used in Netlify by setting `NEXT_PUBLIC_COLORING_ASSET_BASE_URL` to the same public custom-domain test prefix.
