# Round 3A AI Error Taxonomy

Generated: 2026-05-09

This taxonomy defines the conservative source-image QA checklist for Round 3A. It is adapted for printable coloring-page line art. It does not claim automatic detection is perfect. Automation can find some metadata and image-statistics risks, but subtle AI-art problems still require manual review.

## Decision Rule

When uncertain, reject for now. A rejected image may only return to future processing through an explicit approval/update manifest.

## Human And Humanoid Anatomy

- extra fingers
- missing fingers
- fused fingers
- malformed hands
- thumbs on the wrong side
- extra toes
- missing toes
- malformed feet
- extra limbs
- missing limbs
- disconnected limbs
- broken joints
- impossible arm or leg bends
- malformed face/head/body structure
- mismatched eyes
- strange mouth or teeth
- malformed ears
- head/body proportion problems

Round 3A handling: human-adjacent categories are rejected for now because this round does not perform manual anatomy review.

## Animal And Creature Anatomy

- extra legs
- missing legs
- malformed paws, claws, hooves, wings, tails, horns, ears, beaks, or eyes
- asymmetric wings where symmetry is expected
- impossible creature structure unless clearly stylized and intentional
- merged body parts

Round 3A handling: automation can only flag indirect risks such as broken silhouettes, clutter, density, and crop problems. Ambiguous animal anatomy remains a manual review concern.

## General AI Artifacts

- objects melting into each other
- confusing object boundaries
- broken silhouettes
- tangled linework
- line clutter that makes coloring difficult
- random extra shapes that do not belong
- pseudo-text or garbled lettering
- visible watermark, signature, username, logo, or text remnants
- repeated pattern artifacts
- inconsistent style within one image
- overly dense detail with no clear colorable regions
- low-quality crop
- subject cut off awkwardly
- important subject parts too close to the edge
- unreadable focal subject
- weird background geometry
- impossible perspective
- inconsistent decorative elements, for example mismatched earrings, buttons, bows, clothing seams, jewelry, ornaments, or accessories
- details that look polished at a glance but do not make sense when inspected

## Coloring-Page Suitability

- not enough clean white space
- lines too faint
- lines too noisy
- overly thick filled areas
- broken outlines
- heavy speckling
- muddy details
- tiny enclosed areas that would be frustrating to color
- subject not immediately readable
- output likely to feel unprofessional to a user

## Automation Limits

The Round 3A script uses conservative checks: Round 2 flags, non-PNG detection, source readability, inventory size matching, duplicate filename review, human-adjacent category blocking, line density, edge/crop risk, component clutter, and minimum dimensions. It does not reliably detect exact hand, foot, face, animal limb, or perspective defects. Those remain manual review responsibilities.
