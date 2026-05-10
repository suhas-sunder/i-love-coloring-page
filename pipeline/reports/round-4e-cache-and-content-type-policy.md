# Round 4E Cache And Content-Type Policy

Generated: 2026-05-10

## Content Types

- SVG files: `image/svg+xml`
- PNG previews: `image/png`
- Thumbnails: `image/png`

## Cache Policy

- Versioned immutable release: `public, max-age=31536000, immutable`
- Unversioned or replaceable release: `public, max-age=86400, stale-while-revalidate=604800`

The publish manifest uses the immutable policy because it is intended for a versioned release prefix. If deployment uses unversioned paths, use the conservative policy instead.

## Safety

- Downloads should use safe public filenames from the CDN-relative path.
- Local absolute paths must never appear in browser-visible URLs or filenames.
- Quarantined assets must not be published.
- User uploads and unapproved paths must not use this public asset mechanism.
