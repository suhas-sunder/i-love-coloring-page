# Metadata review status

Generated from the immutable runtime printable inventory. This is a review queue, not a publishing system: no candidate is promoted into visible metadata by this command.

- Printable routes: 6352
- Routes with candidate metadata: 2768
- Field-level candidates: 5512
- Underlying collection-label values: 5553
- Imported per-field decisions: 0
- Automatic promotion (State A): 0

## Current disposition

| State | Candidate fields | Handling |
| --- | ---: | --- |
| C. VISUAL OR EDITORIAL REVIEW REQUIRED | 2768 | Reviewer inspects the artwork and policy context; collection membership alone is insufficient. |
| B. RULE-BASED REVIEWABLE | 2744 | Reviewer confirms or rejects the bounded rule candidate. |

## Guardrails

- Each decision must name one asset ID and one field; wildcard and bulk imports are rejected.
- Decisions are written only to the version-controlled manifest. A separate approved implementation step is required before any public field changes.
- The local review UI is under `pipeline/review/` and is ignored by Git; it does not create a public route.
- Audience and detail attributes remain `null` in runtime data until a separately reviewed implementation deliberately applies approved decisions.
