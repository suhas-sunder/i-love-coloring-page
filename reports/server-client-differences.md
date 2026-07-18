# Server/client rendering differences

## Live production

- /: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=21fed294
- /coloring-pages: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=3c2b64c3
- /coloring-pages/animals: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=f60c3d4d
- /coloring-pages/detailed-for-adults: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=762f3bef
- /coloring-pages/mandalas: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=f59ab982
- /coloring-pages/geometric: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=c348d170
- /printables/fantasy/fantasy-abyss-wyrm-7a01eb3636: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=27705615
- /robots.txt: status=200, ads=0, loading-preview=false, revision-marker=false, cache=public, max-age=31536000, must-revalidate, sha=b8807be4

The live Fantasy route server HTML contains the WebP image, but historically exposed an empty image alt, source-size dimensions, a “Loading preview” status, and only the PNG action. Hydration added JPG/WebP controls without changing the underlying preview URL. This was a semantic and declared-dimension parity defect; the principal image itself was not wholly client-only.

## Local production-style export

- /: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=a5879536
- /coloring-pages: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=405c7dae
- /coloring-pages/animals: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=eef25fec
- /printables/fantasy/fantasy-abyss-wyrm-7a01eb3636: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=3e3b4977

After `npm run build`, rerun `npm run audit:site-quality` to refresh local-vs-live hashes. The current code makes the principal image source, alt, physical dimensions, and format source deterministic at render time; client capability detection still controls whether optional conversion buttons are enabled.
