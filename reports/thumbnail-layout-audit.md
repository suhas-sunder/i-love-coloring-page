# Thumbnail layout audit

Measured 150 representative WebP files (one per hub where available) using a grayscale line-art threshold; originals were not modified.

- Average canvas whitespace: left 0.000371, right 0.000587, top 0.019115, bottom 0.03763 as fractions of canvas.
- Homepage/collection preview frames used a 4:3 landscape ratio around predominantly 341×512 portrait previews with `object-fit: contain`. This frame mismatch created large visible side wells even when artwork bounds were reasonable.
- Some whitespace is intentionally baked into printable page composition and must remain in downloads/print output.
- Cropping the source or applying an aggressive cover rule could clip line art and is deferred.

Representative measurements:

| Route | Canvas | Detected bounds | L | R | T | B | Optical offset X/Y |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| /printables/animals/animals-alligator-4feec8505a | 341×512 | 0,8,340,511 | 0 | 0 | 0.015625 | 0 | -0.001466/0.006836 |
| /printables/anime-girls/anime-girl-air-balloon-1f6b5be7bc | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/animals/mandala-geometry-patterns-bakery-animal-shaped-cookies-02c4796fed | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/bats/holiday-halloween-dracula-in-coffin-with-bats-4397409e48 | 341×512 | 0,37,340,427 | 0 | 0 | 0.072266 | 0.164063 | -0.001466/-0.046875 |
| /printables/animals/holiday-christmas-animals-bears-be6558c950 | 341×512 | 0,10,340,466 | 0 | 0 | 0.019531 | 0.087891 | -0.001466/-0.035156 |
| /printables/animals/anime-girl-summoning-killer-bees-646adb9f40 | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/animals/anime-girl-summoning-jutsu-beetles-13ee413203 | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/animals/anime-girl-birds-duck-5c61314642 | 341×512 | 0,5,340,511 | 0 | 0 | 0.009766 | 0 | -0.001466/0.003906 |
| /printables/anime-girls/anime-girl-birthday-cake-a75fa3e263 | 341×512 | 0,5,340,511 | 0 | 0 | 0.009766 | 0 | -0.001466/0.003906 |
| /printables/animals/plushie-prehistoric-brachiosaurus-35dc7192a9 | 341×512 | 0,13,340,500 | 0 | 0 | 0.025391 | 0.021484 | -0.001466/0.000977 |
| /printables/bridges/chibi-dungeon-adventure-bridge-over-lava-906729f5e5 | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/anime-girls/anime-girl-journaling-at-home-4243797a12 | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/animals/animals-butterflies-016ffbb0de | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/bakery/mandala-geometry-patterns-bakery-vanilla-cupcakes-803a7220cc | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/anime-girls/anime-girl-driving-race-car-driving-07de9e75de | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/buildings/st-patricks-day-irish-castle-on-hilltop-862176e869 | 341×512 | 0,55,340,417 | 0 | 0 | 0.107422 | 0.183594 | -0.001466/-0.039063 |
| /printables/animals/anime-girl-cat-hoodie-plushie-62ed67bd39 | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/anime-girls/anime-girl-chess-50e94b303e | 341×512 | 0,2,340,511 | 0 | 0 | 0.003906 | 0 | -0.001466/0.000977 |
| /printables/anime-girls/anime-girl-chibi-bear-summon-443fa88c61 | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/animals/chibi-animals-pets-dogs-afghan-hound-d9a83b6ec9 | 341×512 | 0,19,340,495 | 0 | 0 | 0.037109 | 0.03125 | -0.001466/0.001953 |
| /printables/chibi/chibi-enchanted-forest-fairy-dancing-in-flower-ring-c4cb5961c2 | 341×512 | 0,0,340,477 | 0 | 0 | 0 | 0.066406 | -0.001466/-0.03418 |
| /printables/christmas/christmas-holiday-advent-calendar-a1245c4617 | 341×512 | 0,16,340,490 | 0 | 0 | 0.03125 | 0.041016 | -0.001466/-0.005859 |
| /printables/animals/holiday-christmas-dogs-german-shepherd-5779fc20a7 | 341×512 | 0,5,340,419 | 0 | 0 | 0.009766 | 0.179688 | -0.001466/-0.085938 |
| /printables/cows/plushie-cow-fc41be5b71 | 341×512 | 0,6,340,507 | 0 | 0 | 0.011719 | 0.007813 | -0.001466/0.000977 |
| /printables/animals/chibi-plushie-crab-0a927497b6 | 341×512 | 0,10,340,507 | 0 | 0 | 0.019531 | 0.007813 | -0.001466/0.004883 |
| /printables/anime-girls/anime-girl-cute-teddy-bear-plushie-9e3171aa9b | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/animals/holiday-christmas-animals-deer-1ad8990dcd | 341×512 | 0,17,340,495 | 0 | 0 | 0.033203 | 0.03125 | -0.001466/0 |
| /printables/animals/mandala-geometry-patterns-animal-mandala-fox-3e8e80a2fd | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/animals/anime-girl-brachiosaurus-hoodie-plushie-73442e8b67 | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/animals/prehistoric-diplodocus-9808941cbd | 341×512 | 0,16,340,491 | 0 | 0 | 0.03125 | 0.039063 | -0.001466/-0.004883 |
| /printables/animals/animals-dog-18819a83c1 | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/animals/animals-dolphins-06e09058c7 | 341×512 | 0,12,340,511 | 0 | 0 | 0.023438 | 0 | -0.001466/0.010742 |
| /printables/animals/holiday-christmas-animals-dragons-b1e9ada7ea | 341×512 | 0,0,340,444 | 0 | 0 | 0 | 0.130859 | -0.001466/-0.066406 |
| /printables/animals/birds-ducks-1dbebbc6d6 | 341×512 | 0,22,340,498 | 0 | 0 | 0.042969 | 0.025391 | -0.001466/0.007813 |
| /printables/animals/animals-eagles-9c48219eed | 341×512 | 0,7,340,511 | 0 | 0 | 0.013672 | 0 | -0.001466/0.005859 |
| /printables/animals/animals-elephants-44cfe62b98 | 341×512 | 0,17,340,511 | 0 | 0 | 0.033203 | 0 | -0.001466/0.015625 |
| /printables/anime-girls/anime-girl-summoning-fairy-plushies-0c86dd4c47 | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/anime-girls/anime-girl-centaur-standoff-d462b8fcc6 | 341×512 | 0,0,340,511 | 0 | 0 | 0 | 0 | -0.001466/-0.000977 |
| /printables/dragons/fantasy-angry-volcano-dragon-2d2fb81a98 | 341×512 | 0,10,340,493 | 0 | 0 | 0.019531 | 0.035156 | -0.001466/-0.008789 |
| /printables/animals/sea-life-coral-reef-fish-c022c371ac | 341×512 | 0,9,340,511 | 0 | 0 | 0.017578 | 0 | -0.001466/0.007813 |
