# Round 4A Content Architecture Report

Generated: 2026-05-10

## Production Data State

- Production assets manifest exists: yes
- Gallery data manifest exists: yes
- Category data manifest exists: yes
- Quarantine manifest exists: yes
- Successful assets analyzed: 6557
- Quarantined assets excluded: 9
- Warning assets retained as internal metadata only: 5336
- Source and generated asset paths traceable: yes

## Why Raw Folders Are Not The Final Architecture

The 29 source folders are production input organization, not public navigation. The filenames contain richer user intent signals such as specific subjects, styles, holidays, scenes, and difficulty cues. Round 4A therefore uses folders as one input signal, then normalizes filename terms and scores hubs by asset depth, clarity, overlap risk, and user value.

## Cluster Summary

- Total unique normalized subject tokens: 84
- Total hub candidates generated: 183
- Phase 1 hub count: 65
- Phase 2 backlog count: 67
- Section-only topic count: 41
- Rejected candidate count: 10

## Strongest Subject Clusters

| Subject | Assets | Categories |
| --- | --- | --- |
| Plushies | 1704 | anime-girls, chibi, holiday, mandala-geometry-patterns, plushie |
| Patterns | 1469 | chibi, christmas, gardening, holiday, mandala, mandala-geometry-patterns, sea-life, st-patricks-day |
| Mandalas | 1461 | mandala, mandala-geometry-patterns, st-patricks-day |
| Chibi | 910 | anime-girls, chibi, fantasy |
| Anime Girls | 905 | anime-girls, chibi |
| Holidays | 844 | chibi, christmas, holiday, mandala-geometry-patterns |
| Fantasy | 769 | anime-girls, chibi, dragons, fantasy, homes, mandala-geometry-patterns, midieval, mythology |
| Flowers | 403 | anime-girls, chibi, fantasy, flowers, indoor-plants, insects, mandala-geometry-patterns, reptiles |
| Christmas | 332 | christmas, gardening, holiday, indoor-plants, mandala-geometry-patterns |
| Animals | 310 | animals, animals-playing-cards, anime-girls, chibi, christmas, fantasy, holiday, mandala, mandala-geometry-patterns |
| Halloween | 305 | anime-girls, chibi, holiday, mandala-geometry-patterns |
| Dragons | 303 | anime-girls, chibi, christmas, dragons, fantasy, flowers, holiday, indoor-plants, mandala-geometry-patterns, midieval, mythology, plushie, reptiles, sea-life, st-patricks-day |
| Dogs | 280 | animals, anime-girls, chibi, christmas, dogs, holiday, mandala-geometry-patterns, plushie |
| Mythology | 268 | anime-girls, dragons, fantasy, mythology |
| Vehicles | 267 | mandala-geometry-patterns |
| Birthday | 211 | anime-girls, holiday, mandala-geometry-patterns |
| Plants | 210 | gardening, indoor-plants, insects |
| Medieval Fantasy | 194 | anime-girls, chibi, midieval |
| Cars | 193 | anime-girls, mandala-geometry-patterns |
| Birds | 190 | anime-girls, birds, chibi, dinosaurs, fantasy, flowers, holiday, indoor-plants, mandala-geometry-patterns, midieval, plushie |

## Strongest Style Clusters

| Style | Assets | Categories |
| --- | --- | --- |
| Plushies | 1704 | anime-girls, chibi, holiday, mandala-geometry-patterns, plushie |
| Patterns | 1469 | chibi, christmas, gardening, holiday, mandala, mandala-geometry-patterns, sea-life, st-patricks-day |
| Mandalas | 1461 | mandala, mandala-geometry-patterns, st-patricks-day |
| Geometric | 1459 | mandala, mandala-geometry-patterns |
| Fantasy | 989 | anime-girls, chibi, dragons, fantasy, homes, mandala-geometry-patterns, midieval, mythology |
| Chibi | 910 | anime-girls, chibi, fantasy |
| Anime | 903 | anime-girls |
| Cute | 375 | anime-girls, chibi, dogs, holiday, mandala-geometry-patterns, plushie, reptiles |
| Medieval Fantasy | 194 | anime-girls, chibi, midieval |
| Kawaii | 88 | anime-girls, chibi, christmas, holiday, mandala-geometry-patterns, plushie |
| Classic | 24 | homes, mandala-geometry-patterns |
| Cartoon | 13 | chibi, gardening, insects, mandala-geometry-patterns, sea-life |
| Abstract | 3 | mandala-geometry-patterns |

## Strongest Holiday And Theme Clusters

| Theme | Assets | Categories |
| --- | --- | --- |
| Holidays | 844 | chibi, christmas, holiday, mandala-geometry-patterns |
| Fantasy | 707 | dragons, fantasy, midieval |
| Christmas | 332 | christmas, gardening, holiday, indoor-plants, mandala-geometry-patterns |
| Halloween | 305 | anime-girls, chibi, holiday, mandala-geometry-patterns |
| Garden | 266 | anime-girls, birds, chibi, fantasy, flowers, gardening, homes, insects, mandala-geometry-patterns, sea-life |
| Mythology | 246 | mythology |
| Birthday | 211 | anime-girls, holiday, mandala-geometry-patterns |
| Sushi | 161 | anime-girls, mandala-geometry-patterns |
| Ocean | 154 | anime-girls, fantasy, reptiles, sea-life |
| Dungeon | 99 | chibi, fantasy, midieval |
| Bakery | 93 | mandala-geometry-patterns |
| Forest | 74 | anime-girls, chibi, fantasy, gardening, holiday, homes, insects, mandala-geometry-patterns, midieval, mythology, nature, reptiles |
| Prehistoric | 68 | dinosaurs |
| Mountain | 33 | anime-girls, birds, chibi, dogs, fantasy, holiday, homes, mandala-geometry-patterns, mythology, plushie |
| Moon | 30 | anime-girls, chibi, fantasy, holiday, indoor-plants, mandala-geometry-patterns, mythology, plushie |
| Snow | 27 | anime-girls, birds, chibi, christmas, fantasy, gardening, holiday, homes, mandala-geometry-patterns, plushie |
| Castles | 25 | chibi, fantasy, mandala-geometry-patterns, midieval, st-patricks-day, world-landmarks |
| St. Patrick's Day | 20 | st-patricks-day |
| River | 15 | chibi, fantasy, mandala-geometry-patterns, mythology, reptiles |
| Star | 15 | anime-girls, chibi, christmas, fantasy, holiday, indoor-plants, mandala-geometry-patterns, plushie |

## Cross-Folder Hub Examples

| Hub | Assets | Source folders |
| --- | --- | --- |
| Coloring Pages | 6557 | mandala-geometry-patterns (1453), anime-girls (903), chibi (898), holiday (642), fantasy (528), plushie (355), mythology (246), birds (165), flowers (163), midieval (161), sea-life (145), indoor-plants (129), insects (111), christmas (101), reptiles (98), gardening (80), animals-playing-cards (71), dinosaurs (68), dogs (67), world-landmarks (47) |
| Plushies Coloring Pages | 1704 | holiday (507), plushie (355), mandala-geometry-patterns (329), anime-girls (321), chibi (192) |
| Mandalas Coloring Pages | 1461 | mandala-geometry-patterns (1453), mandala (6), st-patricks-day (2) |
| Fantasy Coloring Pages | 1310 | fantasy (528), mythology (246), midieval (161), chibi (128), anime-girls (123), holiday (40), mandala-geometry-patterns (28), plushie (20), dragons (18), reptiles (7), christmas (2), homes (2), indoor-plants (2), st-patricks-day (2), flowers (1), gardening (1), sea-life (1) |
| Chibi Coloring Pages | 910 | chibi (898), fantasy (10), anime-girls (2) |
| Anime Girls Coloring Pages | 905 | anime-girls (903), chibi (2) |
| Holidays Coloring Pages | 874 | holiday (642), christmas (101), chibi (93), st-patricks-day (20), mandala-geometry-patterns (12), anime-girls (4), gardening (1), indoor-plants (1) |
| Christmas Coloring Pages | 332 | holiday (228), christmas (101), gardening (1), indoor-plants (1), mandala-geometry-patterns (1) |

## Multiple Folders Feeding One Hub

- Coloring Pages: mandala-geometry-patterns, anime-girls, chibi, holiday, fantasy, plushie, mythology, birds, flowers, midieval, sea-life, indoor-plants, insects, christmas, reptiles, gardening, animals-playing-cards, dinosaurs, dogs, world-landmarks
- Plushies Coloring Pages: holiday, plushie, mandala-geometry-patterns, anime-girls, chibi
- Mandalas Coloring Pages: mandala-geometry-patterns, mandala, st-patricks-day
- Fantasy Coloring Pages: fantasy, mythology, midieval, chibi, anime-girls, holiday, mandala-geometry-patterns, plushie, dragons, reptiles, christmas, homes, indoor-plants, st-patricks-day, flowers, gardening, sea-life
- Chibi Coloring Pages: chibi, fantasy, anime-girls
- Anime Girls Coloring Pages: anime-girls, chibi
- Holidays Coloring Pages: holiday, christmas, chibi, st-patricks-day, mandala-geometry-patterns, anime-girls, gardening, indoor-plants
- Christmas Coloring Pages: holiday, christmas, gardening, indoor-plants, mandala-geometry-patterns

## One Folder Splitting Into Multiple Useful Hubs

- animals: Animals Coloring Pages (1524), Coloring Pages for Kids (1338), Dogs Coloring Pages (284), Whales Coloring Pages (40), Insects Coloring Pages (180), Sea Life Coloring Pages (236)
- animals-playing-cards: Coloring Pages (6557), Animals Coloring Pages (1524), Playing Cards Coloring Pages (86), Coloring Pages for Kids (1338), Cats Coloring Pages (58)
- anime-girls: Coloring Pages (6557), Plushies Coloring Pages (1704), Fantasy Coloring Pages (1310), Chibi Coloring Pages (910), Anime Girls Coloring Pages (905), Holidays Coloring Pages (874)
- birds: Coloring Pages (6557), Animals Coloring Pages (1524), Plants Coloring Pages (658), Garden Coloring Pages (266), Birds Coloring Pages (190), Buildings Coloring Pages (156)
- chibi: Coloring Pages (6557), Plushies Coloring Pages (1704), Fantasy Coloring Pages (1310), Chibi Coloring Pages (910), Anime Girls Coloring Pages (905), Holidays Coloring Pages (874)
- christmas: Coloring Pages (6557), Fantasy Coloring Pages (1310), Holidays Coloring Pages (874), Christmas Coloring Pages (332), Animals Coloring Pages (1524), Plants Coloring Pages (658)
- dinosaurs: Coloring Pages (6557), Animals Coloring Pages (1524), Birds Coloring Pages (190), Prehistoric Animals Coloring Pages (221), Cats Coloring Pages (58), Dinosaurs Coloring Pages (190)
- dogs: Coloring Pages (6557), Animals Coloring Pages (1524), Coloring Pages for Kids (1338), Easy Coloring Pages (1302), Cute Coloring Pages (375), Dogs Coloring Pages (284)
- dragons: Fantasy Coloring Pages (1310), Mythology Coloring Pages (268), Playing Cards Coloring Pages (86), Fantasy Creatures Coloring Pages (575), Fantasy Dragons Coloring Pages (67)
- fantasy: Coloring Pages (6557), Fantasy Coloring Pages (1310), Chibi Coloring Pages (910), Mythology Coloring Pages (268), Animals Coloring Pages (1524), Plants Coloring Pages (658)

## URL Structure Recommendation

Use `/coloring-pages` for the root gallery hub and `/coloring-pages/[hubSlug]` for public hubs. Keep routes shallow, stable, readable, and based on normalized hub slugs rather than raw folder names.

## Sitemap And Indexing Strategy

Include the root gallery and Phase 1 hub routes in the initial sitemap. Phase 2 hubs should remain backlog routes until Round 4B or later explicitly promotes them. Section-only topics should be anchors or filter sections inside larger hubs, not indexable pages. Individual image pages must not be indexable routes.
