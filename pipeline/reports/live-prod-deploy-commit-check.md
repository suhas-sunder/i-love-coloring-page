# Live Production Deploy Commit Check

- Expected commit behavior: 08fd170
- Production deploy current: fail
- Includes local preview fix behavior: fail
- Homepage count is 6,352: fail
- Custom asset base present: fail
- localhost absent: pass
- r2.dev absent: pass
- Live sitemap current: fail
- Non-root pages reachable: fail
- Netlify deployment stale: pass
- Blockers: Live production does not appear to serve commit 08fd170 behavior. Owner action required: verify Netlify production branch is version-4, publish directory is out, then trigger a fresh deploy from the latest version-4 commit.
