# Live-production differences

The live site remains intentionally untouched. It currently differs from this repair in three high-confidence areas:

1. Live production emits advertisement placeholder markup; the local production default is now OFF.
2. Live printable markup declares source dimensions for a smaller WebP; local markup declares 341×512 and prevents upscaling.
3. Live has no build-revision marker, so same-revision verification across routes is impossible until a later approved deployment.

Live snapshots:

- /: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=6ddbad7a
- /coloring-pages: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=67fdf50e
- /coloring-pages/animals: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=1b62c75a
- /coloring-pages/detailed-for-adults: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=4400f449
- /coloring-pages/mandalas: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=5bc77526
- /coloring-pages/geometric: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=f8ec608a
- /printables/fantasy/fantasy-abyss-wyrm-7a01eb3636: status=200, ads=12, loading-preview=true, revision-marker=false, cache=public,max-age=0,must-revalidate, sha=39f9ee6d
- /robots.txt: status=200, ads=0, loading-preview=false, revision-marker=false, cache=public, max-age=31536000, must-revalidate, sha=b8807be4

Local snapshots:

- /: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=5e1692f5
- /coloring-pages: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=646751a6
- /coloring-pages/animals: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=dc0e9ca8
- /printables/fantasy/fantasy-abyss-wyrm-7a01eb3636: status=local, ads=0, loading-preview=true, revision-marker=true, cache=n/a, sha=67917ba4
