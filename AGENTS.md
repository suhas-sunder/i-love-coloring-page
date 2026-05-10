# Codex Project Rules

This repository is the foundation for a future Next.js coloring page website. The current round is discovery and workflow setup only.

## Source Image Safety

- Original source images are immutable.
- Never overwrite, rename, move, or delete files inside the source images folder.
- Never edit files in `images/` directly.
- Never commit files from `images/`; original and generated coloring page images are CDN-hosted assets, not repository assets.
- Never commit the nested `ilovesvg/` repo; it stays local as a reference implementation for conversion logic.
- Never commit generated coloring page image assets, SVG bakeoff outputs, PNG previews, contact sheets, or review panels unless a later prompt explicitly changes the storage policy.
- Never run the full 8,000-image corpus, or any full source corpus, through conversion unless a later prompt explicitly asks for it.
- Always work in small batches first.
- Always produce manifests and reports for inventory, conversion, review, and production decisions.
- Always quarantine questionable images instead of silently approving or deleting them.
- Future production, export, gallery, sitemap, and metadata scripts must consume `pipeline/manifests/round-3a-approved-source-images.json` or a later approved-source manifest. They must not directly glob `images/` for production inputs.
- Round 2 flagged images are rejected for now.
- Round 3A rejected images are rejected for now.
- Rejected images may only be restored by an explicit future approval/update manifest.
- When uncertain, reject for now.
- High-risk category does not mean automatic rejection.
- Human-adjacent category does not mean automatic rejection.
- Category membership may increase scrutiny but must not be used as the only rejection reason.
- Warning images are still eligible unless they have concrete rejection-level issues.
- Most source images have already been manually reviewed and should be treated as mostly valid.
- Future source QA should approve by default unless a concrete defect is identified.
- New source QA rejection counts above 500, excluding previously blocked Round 2 images, require diagnostic failure mode.
- Future production, export, gallery, sitemap, and metadata scripts should use the latest approved-source manifest, currently `pipeline/manifests/round-3a1-approved-source-images.json`, unless replaced by a later approved manifest.
- Future blocked-source logic should use the latest blocked-source manifest, currently `pipeline/manifests/round-3a1-blocked-source-images.json`, unless replaced by a later blocked manifest.
- Production exporters must validate every input against the latest approved-source manifest before processing.
- Blocked images must never be processed unless restored by an explicit later approval manifest.
- Warning images remain eligible for conversion when they are present in the approved-source manifest; preserve warning metadata instead of treating warnings as rejection.
- Production dry-run outputs must stay under `pipeline/production/dry-run/` and out of any Next.js `public/` folder.
- Full production export outputs must stay under `pipeline/production/full/` and out of any Next.js `public/` folder until Round 4 explicitly decides the public asset strategy.
- Future Next.js builds must consume generated metadata and data files instead of importing thousands of image files directly into React components.
- Category and gallery pages may be indexable; individual image pages must not be created as indexable pages.
- Final asset IDs must be deterministic and collision-safe.
- Duplicate original filenames cannot be trusted as unique IDs.
- Duplicate filenames are not duplicate images by themselves; keep same-name images when content differs and use deterministic collision-safe output IDs.
- Only exact duplicate image content may be excluded as a duplicate, and source files must still never be deleted or moved.

## Human And Humanoid QA

- Human and humanoid categories require stricter anatomy review.
- Treat categories such as anime girls, chibi, people, princess, fairy, mermaid, superhero, fantasy, mythology, and similar subjects as higher risk.
- Conversion quality must prioritize clean coloring-page output:
  - readable subject
  - clean outlines
  - no messy speckles
  - no broken-looking geometry
  - no obvious anatomy defects
  - no warped hands
  - no extra fingers
  - no extra toes
  - no extra limbs
  - no confusing malformed details

## Pipeline Rules

- Use `pipeline/manifests/` for machine-readable inventory and decision records.
- Use `pipeline/reports/` for human-readable round reports.
- Use `pipeline/samples/` only for explicit small-batch sample material.
- Use `pipeline/bakeoffs/` for temporary preset comparison outputs.
- Use `pipeline/review/anatomy/`, `pipeline/review/conversion/`, `pipeline/review/duplicates/`, and `pipeline/review/manual-signoff/` for review artifacts.
- Use `pipeline/production/assets/`, `pipeline/production/thumbs/`, and `pipeline/production/data/` only after preset policy and QA rules are locked.
- Keep generated media under `pipeline/samples/`, `pipeline/bakeoffs/`, `pipeline/review/`, `pipeline/production/assets/`, and `pipeline/production/thumbs/` out of Git by default.
- Do not put processed production images in a Next.js `public/` folder until a later prompt explicitly approves the final asset policy.

## Public Site Structure

- The public Next.js site should use hub and gallery pages, not one indexable page per image.
- Use public SEO hubs such as `/coloring-pages`, `/coloring-pages/animals`, `/coloring-pages/christmas`, and other category hubs when there is enough quality content and search intent.
- Optional subhub pages are allowed only when there is enough quality content and distinct user intent.
- Individual images should exist as static assets and metadata records, not separate indexable HTML pages.
- Future coloring app or dashboard routes should be kept separate from public SEO gallery pages.
- Original source folders are not the final public website taxonomy.
- Public hub pages must be generated from approved production metadata and descriptive filenames, not raw folders alone.
- Images may belong to multiple public hubs when the filename, subject, style, theme, or metadata supports that assignment.
- Hub pages must be useful, distinct, and supported by enough approved production assets.
- Do not create thin SEO pages, duplicate singular/plural routes, or keyword-stuffed hub variants.
- Do not create indexable per-image pages.
- Final public route planning should use the approved hub taxonomy, not raw category folders.
- The Next.js build should consume the Round 4A hub taxonomy and image-to-hub maps.
- Next.js gallery pages must consume Round 4A and Round 4B generated data, not raw folders.
- Phase 2 hubs must stay out of the sitemap until a later prompt explicitly promotes them.
- Section-only topics must stay non-indexable and should be represented only as sections, filters, or internal data.
- Do not copy production assets into `public/` unless a later asset-hosting prompt explicitly asks for it.
- Asset URL logic must stay centralized in the coloring asset resolver.
- Large hub pages must use pagination or limited initial rendering.
- Public gallery UI should be structured and useful, not a raw asset dump.

## Public Gallery Visual System

- The Round 4C design system is the source of truth for public gallery UI.
- The public gallery uses the light "Indigo Paper" shell.
- Future online coloring workspace routes may use a separate dark shell, but that workspace shell is not part of the public gallery shell.
- Do not introduce ad hoc colors, fonts, spacing, radius, shadows, outlines, or button styles.
- Approved public gallery colors, typography, spacing, radii, and component rules live in `pipeline/manifests/round-4c-design-system.json`, `pipeline/manifests/round-4c-typography.json`, and `pipeline/manifests/round-4c-component-rules.json`.
- CSS implementation should stay centralized in `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/layout.css`, and `src/styles/components.css`.
- No gradients.
- No decorative outlines.
- No resting-state borders on layout surfaces.
- No shadows except the approved button micro-shadow.
- Visible `:focus-visible` treatment is mandatory for interactive controls.
- Do not hide keyboard focus.
- No nested cards.
- Do not add unnecessary background colors.
- Use semantic HTML.
- Use native buttons and links instead of div-based fake controls.
- Gallery media must resolve through the centralized asset resolver.
- No per-image indexable pages.
- Do not copy production assets into `public/`.
- Large hub pages must use limited rendering or pagination.
- Any new public page must declare page type, indexability status, metadata strategy, and component variants used.

## Conversion Workflow

- Do not choose a winning preset until a later bakeoff round compares outputs.
- Reuse I Love SVG conversion logic only after inspecting the real scripts, routes, utilities, presets, packages, and commands.
- Treat any batch converter as an adapter around known conversion utilities, not as permission to process the full corpus.
- Prefer deterministic JSON metadata and static asset paths for the eventual gallery.
