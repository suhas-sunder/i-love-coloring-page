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

## Conversion Workflow

- Do not choose a winning preset until a later bakeoff round compares outputs.
- Reuse I Love SVG conversion logic only after inspecting the real scripts, routes, utilities, presets, packages, and commands.
- Treat any batch converter as an adapter around known conversion utilities, not as permission to process the full corpus.
- Prefer deterministic JSON metadata and static asset paths for the eventual gallery.
