# Live Routing Fix Actions

- Root cause: Local static export is current and routeable, while live production is stale or misrouted at Netlify/domain level.
- Routing config changed: false
- App logic changed: false
- Local issue found: false
- Live issue found: true
- Owner action required: true
- Self-redirect fixed locally: true
- Live self-redirect still observed: true

## Owner Actions

- Verify Netlify is deploying the version-4 branch.
- Trigger a fresh Netlify deploy from the latest version-4 commit.
- Confirm the Netlify publish directory is out.
- Clear or replace the stale deploy if needed.
- Check domain redirect settings for apex and www.
- Verify the deployed commit SHA matches the latest pushed version-4 commit before rerunning live QA.
