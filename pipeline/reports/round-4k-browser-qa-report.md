# Round 4K Browser QA Report

Status: completed_real_media_browser_qa

Local preview commands:
- `python -m http.server 4175 --bind 127.0.0.1 --directory pipeline/r2-upload`
- `$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'; npm run build; npx serve out -l 3005`

## Summary

- Real media rendered: true
- Nested card wrappers present: false
- Random yellow or beige wrappers present: false
- PNG/SVG card action pills visible: false
- Print action visible: true
- Download control visible: true
- Clickable image links present: true
- Bad export titles visible: false
- app/api references present: false
- Local filesystem paths visible: false

## Inspection Pages

- / (desktop): 14 images, 8 image links, 8 Print actions
- /coloring-pages (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/geometric (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/animals (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/plushies (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/mandalas (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/anime-girls (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/chibi (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/fantasy (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/christmas (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/halloween (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/cars (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/prehistoric-animals (desktop): 66 images, 60 image links, 60 Print actions
- /coloring-pages/indoor-plants (desktop): 66 images, 60 image links, 60 Print actions
- / (mobile): 14 images, 8 image links, 8 Print actions
- /coloring-pages (mobile): 66 images, 60 image links, 60 Print actions
- /coloring-pages/animals (mobile): 66 images, 60 image links, 60 Print actions
- /coloring-pages/geometric (mobile): 66 images, 60 image links, 60 Print actions

## Search And Filter Checks

- Search: passed
- Filters: passed

## Screenshots
- pipeline/review/round-4k/screenshots/home-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-geometric-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-animals-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-plushies-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-mandalas-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-anime-girls-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-chibi-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-fantasy-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-christmas-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-halloween-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-cars-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-prehistoric-animals-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-indoor-plants-desktop.png
- pipeline/review/round-4k/screenshots/home-mobile.png
- pipeline/review/round-4k/screenshots/coloring-pages-mobile.png
- pipeline/review/round-4k/screenshots/coloring-pages-animals-mobile.png
- pipeline/review/round-4k/screenshots/coloring-pages-geometric-mobile.png
- pipeline/review/round-4k/screenshots/coloring-pages-fantasy-search-filter-desktop.png
- pipeline/review/round-4k/screenshots/coloring-pages-fantasy-filter-desktop.png

Screenshots are local review artifacts under `pipeline/review/round-4k/screenshots/` and should not be committed.
