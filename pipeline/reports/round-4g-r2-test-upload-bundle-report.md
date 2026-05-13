# Round 4G R2 Test Upload Bundle Report

Generated: 2026-05-10

## Decision

Cloudflare R2 Standard Storage is the selected initial generated-media storage target for the frontend-only Netlify gallery. Netlify continues to serve the static app from `out`, while R2 stores generated SVG, PNG preview, and thumbnail media behind a public custom domain.

R2 was selected because it keeps generated media out of the app repository and build context, supports CDN-backed public URLs, and matches the Round 4E object-storage plus CDN direction. The long-term strategy is not `public/` media and not an app API media route, because both would couple thousands of generated files to the static frontend deployment.

## Scope

This round prepares only 30 selected image records, not the full 6557 image record set. Each selected record includes its SVG, PNG preview, and thumbnail file.

## Bundle

- Local folder: `pipeline/r2-upload-test/coloring/test-v1`
- Upload prefix: `coloring/test-v1`
- Media files prepared: 90
- SVG files: 30
- PNG preview files: 30
- Thumbnail files: 30
- Total bytes represented: 14995691
- Requested materialization mode: hardlink
- Observed materialization mode: hardlink
- Linked files: 90
- Copied files: 0

## Folder Structure

```text
pipeline/r2-upload-test/coloring/test-v1/
  svg/
  png/
  thumbs/
```

## Object Key Structure

- coloring/test-v1/png/anime-girls/anime-girl-summoning-jutsu-cute-dinosaur-plushies-e958c58eca.png
- coloring/test-v1/png/anime-girls/anime-girl-summoning-jutsu-cute-dragon-plushies-3f2c634dbf.png
- coloring/test-v1/png/chibi/chibi-enchanted-forest-fairy-dancing-in-flower-ring-c4cb5961c2.png
- coloring/test-v1/png/chibi/chibi-flowers-crocus-kawaii-908b17edf5.png
- coloring/test-v1/png/chibi/chibi-flowers-delphinium-fairy-e2952ac2c0.png
- coloring/test-v1/png/chibi/chibi-flowers-tulip-garden-68470e6363.png

Public URL structure:

```text
https://assets.example.com/coloring/test-v1/svg/<category>/<filename>.svg
https://assets.example.com/coloring/test-v1/png/<category>/<filename>.png
https://assets.example.com/coloring/test-v1/thumbs/<category>/<filename>-thumb.png
```

Set `NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://assets.example.com/coloring/test-v1` for this test once the files are uploaded and the R2 custom domain is active. The private S3 API endpoint and `r2.dev` are not the intended production media URLs.

## Selected Records

| Asset ID | Title | Category | Hubs | Warnings |
| --- | --- | --- | --- | --- |
| anime-girls__anime-girl-summoning-jutsu-cute-dinosaur-plushies__e958c58eca | Anime Girl Summoning Jutsu Cute Dinosaur Plushies | anime-girls | root, animals, anime-girls, cute | warning |
| anime-girls__anime-girl-summoning-jutsu-cute-dragon-plushies__3f2c634dbf | Anime Girl Summoning Jutsu Cute Dragon Plushies | anime-girls | root, anime-girls, cute, easy | warning |
| chibi__chibi-enchanted-forest-fairy-dancing-in-flower-ring__c4cb5961c2 | Chibi Enchanted Forest Fairy Dancing In Flower Ring | chibi | root, chibi, chibi-flowers, easy | warning |
| chibi__chibi-flowers-crocus-kawaii__908b17edf5 | Chibi Flowers Crocus Kawaii | chibi | root, chibi, chibi-flowers, easy | warning |
| chibi__chibi-flowers-delphinium-fairy__e2952ac2c0 | Chibi Flowers Delphinium Fairy | chibi | root, chibi, chibi-flowers, easy | warning |
| chibi__chibi-flowers-tulip-garden__68470e6363 | Chibi Flowers Tulip Garden | chibi | root, chibi, chibi-flowers, easy | warning |
| chibi__chibi-holiday-halloween-tombstone-with-wilted-flowers-coloring-page__dbdec0dd78 | Chibi Holiday Halloween Tombstone With Wilted Flowers Coloring Page | chibi | root, chibi, chibi-flowers, easy | warning |
| chibi__chibi-holiday-halloween-trick-or-treat-dog-in-cute-costume-coloring-page__79fa5d8c2d | Chibi Holiday Halloween Trick Or Treat Dog In Cute Costume Coloring Page | chibi | root, animals, chibi, cute | warning |
| holiday__holiday-christmas-plushie-prehistoric-triceratops-family__b942c6ee0e | Holiday Christmas Plushie Prehistoric Triceratops Family | holiday | root, animals, christmas, dinosaurs | warning |
| holiday__holiday-christmas-prehistoric-kawaii-triceratops__9689527143 | Holiday Christmas Prehistoric Kawaii Triceratops | holiday | root, animals, christmas, dinosaurs | warning |
| indoor-plants__indoor-plants-spider-plant__24e5529d0b | Indoor Plants Spider Plant | indoor-plants | root, animals, indoor-plants, insects | none |
| mandala-geometry-patterns__mandala-geometry-patterns-plushie-cute-baby-dragon__fe1a69ef1f | Mandala Geometry Patterns Plushie Cute Baby Dragon | mandala-geometry-patterns | root, cute, detailed-for-adults, easy | warning |
| mandala-geometry-patterns__mandala-geometry-patterns-plushie-cute-dinosaur__d5d6d04105 | Mandala Geometry Patterns Plushie Cute Dinosaur | mandala-geometry-patterns | root, animals, cute, detailed-for-adults | warning |
| mandala-geometry-patterns__mandala-geometry-patterns-plushie-cute-unicorn__17a29a8e15 | Mandala Geometry Patterns Plushie Cute Unicorn | mandala-geometry-patterns | root, cute, detailed-for-adults, easy | warning |
| mandala-geometry-patterns__mandala-geometry-patterns-plushie-dragon-animals__bc2052aae7 | Mandala Geometry Patterns Plushie Dragon Animals | mandala-geometry-patterns | root, animals, detailed-for-adults, fantasy | warning |
| mandala-geometry-patterns__mandala-geometry-patterns-plushie-pegasus-animals__3068e80aa3 | Mandala Geometry Patterns Plushie Pegasus Animals | mandala-geometry-patterns | root, animals, detailed-for-adults, fantasy | warning |
| mandala-geometry-patterns__mandala-geometry-patterns-plushie-prehistoric-triceratops-animal__8412f3b319 | Mandala Geometry Patterns Plushie Prehistoric Triceratops Animal | mandala-geometry-patterns | root, animals, detailed-for-adults, dinosaurs | warning |
| mandala-geometry-patterns__mandala-geometry-patterns-plushie-puppy-dog-halloween__e6b03b733b | Mandala Geometry Patterns Plushie Puppy Dog Halloween | mandala-geometry-patterns | root, animals, detailed-for-adults, dogs | warning |
| mandala-geometry-patterns__mandala-geometry-patterns-sushi-cartoon-snow-crab-roll__37bf46950d | Mandala Geometry Patterns Sushi Cartoon Snow Crab Roll | mandala-geometry-patterns | root, animals, crabs, detailed-for-adults | warning |
| mandala-geometry-patterns__mandala-geometry-patterns-sushi-cartoon-spider-roll__5c40f77da3 | Mandala Geometry Patterns Sushi Cartoon Spider Roll | mandala-geometry-patterns | root, animals, detailed-for-adults, easy | warning |
| mandala-geometry-patterns__mandala-geometry-patterns-vehiacle-planes-kc-46-pegasus__fcc7a92159 | Mandala Geometry Patterns Vehiacle Planes Kc 46 Pegasus | mandala-geometry-patterns | root, detailed-for-adults, fantasy, fantasy-creatures | warning |
| mandala-geometry-patterns__mandala-geometry-patterns-vehicle-cars-classic-volkswagen-beetle__5efd045f2e | Mandala Geometry Patterns Vehicle Cars Classic Volkswagen Beetle | mandala-geometry-patterns | root, animals, beetles, cars | warning |
| mandala-geometry-patterns__mandala-geometry-patterns-vehicle-cars-classic-volkswagen-beetle-car__879b59fd65 | Mandala Geometry Patterns Vehicle Cars Classic Volkswagen Beetle Car | mandala-geometry-patterns | root, animals, beetles, cars | warning |
| mythology__mythology-griffin__a1782cca68 | Mythology Griffin | mythology | root, fantasy, fantasy-creatures, griffins | warning |
| mythology__mythology-mermaid__476a074c92 | Mythology Mermaid | mythology | root, fantasy, fantasy-creatures, mermaids | warning |
| plushie__plushie-baby-dragon__5ed6730a4b | Plushie Baby Dragon | plushie | root, cute, easy, fantasy | none |
| plushie__plushie-baby-dragon-family__f216d18d8b | Plushie Baby Dragon Family | plushie | root, cute, easy, fantasy | none |
| plushie__plushie-blue-whale__17d0990688 | Plushie Blue Whale | plushie | root, animals, cute, easy | none |
| plushie__plushie-prehistoric-triceratops__cfbd98566a | Plushie Prehistoric Triceratops | plushie | root, animals, cute, dinosaurs | none |
| plushie__plushie-puppy-dog__4a35ced072 | Plushie Puppy Dog | plushie | root, animals, cute, dogs | none |
