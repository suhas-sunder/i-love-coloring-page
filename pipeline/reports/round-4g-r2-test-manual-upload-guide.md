# Round 4G R2 Test Manual Upload Guide

Generated: 2026-05-10

## What To Upload

Upload the local test bundle at:

```text
pipeline/r2-upload-test/coloring/test-v1
```

The expected bucket object prefix is:

```text
coloring/test-v1
```

Use one of these layouts:

- Upload `pipeline/r2-upload-test/coloring` to the bucket root, which creates `coloring/test-v1/...` object keys.
- Or upload the contents of `pipeline/r2-upload-test/coloring/test-v1` into an already selected `coloring/test-v1` R2 prefix.

Do not upload `pipeline/r2-upload-test/coloring/test-v1` into an already selected `coloring/test-v1` prefix, because that creates `coloring/test-v1/coloring/test-v1/...`.

## Environment Value

```bash
NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://assets.example.com/coloring/test-v1
```

This value must point at the public R2 custom-domain base plus prefix. Do not point it at the private S3 API endpoint. Do not use `r2.dev` as the intended production URL.

## Verify After Upload

Run:

```powershell
node pipeline\scripts\round-4g-verify-r2-test-urls.mjs --live
```

Then preview the static app against the same public base URL:

```powershell
$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='https://assets.example.com/coloring/test-v1'; npm run build; npx serve out
```

## Pages To Open

- /coloring-pages - root gallery includes approved production items
- /coloring-pages/animals - assigned to this hub
- /coloring-pages/beetles - included in the first-page preview set
- /coloring-pages/chibi - assigned to this hub
- /coloring-pages/chibi-flowers - included in the first-page preview set
- /coloring-pages/crabs - included in the first-page preview set
- /coloring-pages/cute - included in the first-page preview set
- /coloring-pages/dinosaurs - included in the first-page preview set
- /coloring-pages/dogs - assigned to this hub
- /coloring-pages/easy - included in the first-page preview set
- /coloring-pages/fairies - included in the first-page preview set
- /coloring-pages/fantasy - included in the first-page preview set
- /coloring-pages/fantasy-creatures - included in the first-page preview set
- /coloring-pages/flowers - included in the first-page preview set
- /coloring-pages/for-kids - included in the first-page preview set
- /coloring-pages/forest - included in the first-page preview set
- /coloring-pages/garden - included in the first-page preview set
- /coloring-pages/garden-flowers - included in the first-page preview set
