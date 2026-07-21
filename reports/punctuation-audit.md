# Public punctuation audit

This safeguard scans first-party public-content sources and every textual exported public file. It detects the Unicode character, common misencoding, HTML entities before and after decoding, and serialized JavaScript escape forms. Third-party dependencies, build caches, binaries, and local review artifacts are excluded.

| Phase | Source findings | Export findings | Total |
| --- | ---: | ---: | ---: |
| Before correction | 4 | 13179 | 13183 |
| After correction | 0 | 0 | 0 |

The after count must be zero. The command fails when it is not.

- Regenerate source/output report: `npm run audit:punctuation`
- Enforce after-build result: `npm run validate:punctuation`
