# Correct repository image framing

The framing audit used the verified local export and actual CDN WebP responses. No source artwork was edited and no derivative was generated.

## Inventory result

- Approved runtime records: 6,352
- Verified portrait records: 6,352
- Verified landscape records: 0
- Verified square records: 0

Landscape and square acceptance cases are therefore unavailable in the current approved runtime inventory. They are reported as unsupported rather than simulated with unrelated media.

## Diagnosis

The representative public WebPs render at 341 by 512 pixels and are placed in orientation-aware 2:3 printable-card frames. The tested principal images also render at their 341 by 512 natural size. The browser showed no upscaling, distortion, cropping, unintended side band, or layout shift.

The previously reported tiny-portrait problem is not present in the correct repository. The active 2:3 gallery frame, `object-fit: contain`, stable intrinsic dimensions, and portrait media role account for the improvement. Intentional source whitespace and external line-art borders remain intact. Container padding did not introduce a competing blank band.

## Samples

| Sample | Route | Purpose | Browser result |
| --- | --- | --- | --- |
| Cats Playing Cards | `/printables/animals/cats-playing-cards-c22648db9b` | External artwork border and marks near edges | Border preserved; no clipping; natural 341 by 512 WebP rendered at 341 by 512 |
| Mandala Geometry Patterns Animal Mandala Fox | `/printables/animals/mandala-geometry-patterns-animal-mandala-fox-3e8e80a2fd` | Detailed portrait line art | Detail remained crisp; no upscaling or distortion |
| Holiday Halloween Dracula In Coffin With Bats Coloring Page | `/printables/bats/holiday-halloween-dracula-in-coffin-with-bats-4397409e48` | Intentional source whitespace | Whitespace remained balanced and was not mistaken for frame padding |
| Anime Girl Ankylosaurus Hoodie Plushie: Design 1 | `/printables/anime-girls/anime-girl-ankylosaurus-hoodie-plushie-c819919e77` | Variant-title principal image | Principal WebP was the 341 by 512 natural image, not a thumbnail composition |
| Fantasy Abyss Wyrm | `/printables/fantasy/fantasy-abyss-wyrm-7a01eb3636` | Detailed fantasy principal image | Natural and rendered dimensions matched at 341 by 512 |

Screenshots are under `pipeline/review/correct-repo-prompt-4/screenshots/after/`, using the `framing-` filenames for the three edge-condition examples.
