# Cache and deployment audit

- Framework: Next.js 16 static export. No ISR, backend route, server action, route cache, or runtime fetch cache is used for public pages.
- Runtime data is imported at build time. A new app bundle can only serve old generated records if those files were stale at build input time.
- No service worker or application cache registration was found.
- Live HTML generally returned `public, max-age=0, must-revalidate`; `robots.txt` was observed with a year-long cache policy.
- Netlify rules now make hashed Next assets immutable, HTML immediately revalidated, crawl files immediately revalidated, and `build-revision.json` no-store.

## Revision verification

Every build writes `/build-revision.json` with commit revision, commit date, branch/context, runtime hub/printable counts, and a SHA-256 fingerprint of generated runtime data. After deployment approval, fetch this file through the production domain and compare it with the deployed commit and the hashed Next chunk references on the homepage plus several inner routes. A missing marker is a failed verification, not proof that routes match.

Live response evidence:

- /: cache=public,max-age=0,must-revalidate, edge=DYNAMIC, revision marker=false
- /coloring-pages: cache=public,max-age=0,must-revalidate, edge=DYNAMIC, revision marker=false
- /coloring-pages/animals: cache=public,max-age=0,must-revalidate, edge=DYNAMIC, revision marker=false
- /coloring-pages/detailed-for-adults: cache=public,max-age=0,must-revalidate, edge=DYNAMIC, revision marker=false
- /coloring-pages/mandalas: cache=public,max-age=0,must-revalidate, edge=DYNAMIC, revision marker=false
- /coloring-pages/geometric: cache=public,max-age=0,must-revalidate, edge=DYNAMIC, revision marker=false
- /printables/fantasy/fantasy-abyss-wyrm-7a01eb3636: cache=public,max-age=0,must-revalidate, edge=DYNAMIC, revision marker=false
- /robots.txt: cache=public, max-age=31536000, must-revalidate, edge=REVALIDATED, revision marker=false
