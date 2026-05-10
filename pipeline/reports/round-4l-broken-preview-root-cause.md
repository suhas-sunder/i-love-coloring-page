# Round 4L Broken Preview Root Cause

Run ID: round-4l-preview-rendering-repair

## Root Cause

The reported broken previews came from a stale preview build using the temporary R2 test asset base instead of the full local media base. That build produced valid-looking image tags, but many of those URLs pointed at assets that were not present in the temporary 30-record R2 test upload.

Round 4L also found a rendering flaw in AssetImage: a failed or pre-hydration image could expose the browser's native broken-image state before the React error fallback replaced it.

Current audit status: Audited preview paths resolve to local full-bundle files and AssetImage hides failed or loading image elements.

Root cause code: `resolved`

## Evidence

- Audited local media files exist.
- Audited local HTTP PNG URLs returned 200.
- A public asset base URL is configured for the local build environment.

## Determination

- Bad generated data path: false
- Bad resolver path joining: false
- Missing png/svg/thumbs root: false
- Source image path leak: false
- Old Round 4G prefix: false
- AssetImage fallback ready: true
- AssetImage broken-alt text avoided: true

The required local preview base for this round is:

```powershell
$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'
```
