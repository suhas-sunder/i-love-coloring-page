# Round 5O Owner Upload Runbook

## A. When API Details Are Needed

API details are needed only after the dry-run passes and only on the local machine. Never paste keys into ChatGPT. Never commit keys.

## B. Required Local Details

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET=i-love-coloring-page`
- `R2_PREFIX=coloring-pages`

## C. Where To Put Them

Use terminal environment variables, or put them in `.env.r2-upload.local`. That file is gitignored.

## D. Dry-Run Command

`node pipeline/scripts/round-5o-upload-clean-bundle-to-r2.mjs --dry-run`

## E. Optional Smoke Upload Command

`node pipeline/scripts/round-5o-upload-clean-bundle-to-r2.mjs --execute --confirm-bucket i-love-coloring-page --confirm-prefix coloring-pages --confirm-file-count 12704 --limit 10 --skip-existing`

## F. Full Upload Command

`node pipeline/scripts/round-5o-upload-clean-bundle-to-r2.mjs --execute --confirm-bucket i-love-coloring-page --confirm-prefix coloring-pages --confirm-file-count 12704 --skip-existing`

## G. Post-Upload Verification Command

`node pipeline/scripts/round-5o-verify-clean-upload-r2.mjs --full --public-base-url https://assets.ilovecoloringpage.com/coloring-pages`

## H. Warnings

- Do not rerun the full upload repeatedly without `--skip-existing`.
- Do not use dashboard upload for the full bundle.
- Do not delete existing objects unless explicitly planned later.
- Do not upload `png/` or `thumbs/`.
- Do not upload the parent folder incorrectly. Upload `pipeline/r2-upload-clean/coloring-pages` to the bucket root.
