# Historical test modernization

The baseline ordinary suite contained 57 failing phase-snapshot assertions across 27 milestone files. They encoded superseded markup, permanent production ad placeholders, obsolete More-menu behavior, PNG-only download stages, and exact component-source fragments.

## Decision

- Rewritten or retired from the ordinary suite: 57 obsolete assertions.
- Physical test files deleted: 0. Historical round evidence remains available for provenance.
- Current ordinary-suite entry point now runs authoritative behavioral suites for canonical routes, crawl/indexation, assets, rendering, downloads, ads, taxonomy, navigation/search, printable content, trust pages, and accessibility.
- Owner/legal/account readiness is not converted into a passing unit assertion. It remains a separate failing `verify:production-readiness` command.

The CSV companion maps each affected historical test file, old expectation, classification, replacement assertion, and retained coverage. No accessibility, canonical, robots, sitemap, SSR image, asset-role, count, ad-mode, truthful-format, taxonomy, or overlap safeguard was removed.
