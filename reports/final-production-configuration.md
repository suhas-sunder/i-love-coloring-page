# Final production configuration

Inspection date: 2026-07-21

No deployment or provider-account mutation was performed.

## Verified repository configuration

| Item | Verified value | Status |
| --- | --- | --- |
| Canonical production URL | `https://www.ilovecoloringpage.com` | Verified in server identity and exported metadata |
| Canonical hostname | `www.ilovecoloringpage.com` | Verified; apex currently redirects to `www` |
| Framework | Next.js 16.2.6 static export | Verified |
| Build command | `npm run build` | Verified |
| Output directory | `out` | Verified |
| Netlify Node version | 22 | Verified in `netlify.toml` |
| Local validation runtime | Node 25.9.0, npm 10.9.0 | Diagnostic only |
| Package-manager pin | None | Not configured |
| Advertising architecture | Environment-independent real units with status-driven fallback siblings | Verified in the fill/fallback milestone |
| Site URL default | `https://www.ilovecoloringpage.com` | Verified |
| Asset base default | `https://assets.ilovecoloringpage.com/coloring-pages` | Verified |
| Revision diagnostic | `out/build-revision.json` | Generated locally |
| Regular sitemap | `/sitemap.xml` | Generated and validated |
| Image sitemap | `/image-sitemap.xml` | Generated and validated |
| Robots policy | `app/robots.ts` | Sole source; generated output references both sitemaps |

## Headers and cache policy

- General HTML and mutable paths: `public, max-age=0, must-revalidate`
- Hashed `/_next/static/*`: `public, max-age=31536000, immutable`
- `/build-revision.json`: `no-store`
- Robots, both sitemaps, and search data: `max-age=0, must-revalidate`
- Current live robots response still showed an older one-year cache setting, confirming that production is not current.

No repository redirect rule is present. Current apex-to-`www` and HTTPS behavior is provided externally and was observed on the live host.

## Environment boundary

Public defaults are safe without hosting variables. Optional public overrides are documented for site URL, asset base, and site name. The ignored local asset override was inspected by variable name only. R2 upload credentials are ignored, external to the frontend build, and were not printed or copied.

Production must keep:

- canonical site URL on the `www` host
- asset base on the approved custom asset domain
- the centralized public AdSense publisher and five slot identifiers unchanged

Advertising uses no project-specific environment variables and does not branch on the runtime environment. Eligible pages emit the same real units and hidden fallbacks in local, test, and production builds.

No secret belongs in static output.

## Asset-domain verification

Representative requests using production Origin `https://www.ilovecoloringpage.com`:

| Asset | Status | MIME | CORS | Cache |
| --- | ---: | --- | --- | --- |
| Animals Alligator WebP | 200 | `image/webp` | Exact production origin allowed | One-year immutable |
| Animals Alligator SVG | 200 | `image/svg+xml` | Exact production origin allowed | One-year immutable |

This supports the current public preview and browser-side print/conversion design. Original artwork was not modified.

## Unresolved deployment configuration

The following cannot be inferred from repository files:

- Exact Netlify site
- Netlify production branch
- Git-connected automatic, Git-connected manual, or manual-upload mechanism
- Authorized account operator
- Current production deploy ID or commit SHA
- Known-good rollback deploy
- Rollback method

The deployment checkpoint has been cancelled, so these facts are not being requested. They remain documented because the repository does not contain a local Netlify link state, deployment command, rollback command, or GitHub Actions workflow that could support a production-validation claim. Their absence does not block the authorized repository commit and push.

## Current production revision

The live revision diagnostic returns 404 and the live UI predates the current build. Exact live SHA is unknown. Remote `main` is not proof of the deployed revision.
