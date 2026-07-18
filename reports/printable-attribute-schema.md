# Printable attribute schema

The authoritative model is `RuntimePrintable.attributes`, generated with each canonical printable record by `pipeline/scripts/build-runtime-printables.mjs`. It is not a separate editorial database.

## Provenance rules

- Subjects, styles, patterns, and seasonal values require both an explicit runtime collection assignment and an approved taxonomy-dimension rule.
- Orientation and source dimensions are computed from verified production dimensions.
- Artwork dimensions, print layout, image role, and format capability come from verified asset/configuration records.
- Titles, filenames, route slugs, broad parent hubs, and image-density scores do not independently establish displayed attributes.
- Easy, For Kids, and Detailed for Adults memberships are retained only as unapproved audience/detail candidates. They are never displayed as per-page audience or complexity facts.
- Missing fields remain null or empty and are omitted from visible markup.

The model supports subject, style, pattern, season/holiday, orientation, source/artwork/print dimensions, collection context, truthful format capability, principal-image role, related signals, review status, and field-level provenance. Character-focused, scene-focused, verified detail, and verified audience values remain unsupported until reviewed evidence exists.
