# Live-production differences

The live site remains intentionally untouched. It currently differs from this repair in three high-confidence areas:

1. Live production emits advertisement placeholder markup; the local production default is now OFF.
2. Live printable markup declares source dimensions for a smaller WebP; local markup declares 341×512 and prevents upscaling.
3. Live has no build-revision marker, so same-revision verification across routes is impossible until a later approved deployment.

Live snapshots:

- /: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=21fed294
- /coloring-pages: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=3c2b64c3
- /coloring-pages/animals: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=f60c3d4d
- /coloring-pages/detailed-for-adults: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=762f3bef
- /coloring-pages/mandalas: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=f59ab982
- /coloring-pages/geometric: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=c348d170
- /printables/fantasy/fantasy-abyss-wyrm-7a01eb3636: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=27705615
- /robots.txt: status=200, ads=0, loading-preview=false, revision-marker=false, cache=public, max-age=31536000, must-revalidate, sha=b8807be4

Local snapshots:

- /: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=a5879536
- /coloring-pages: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=405c7dae
- /coloring-pages/animals: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=eef25fec
- /printables/fantasy/fantasy-abyss-wyrm-7a01eb3636: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=3e3b4977
