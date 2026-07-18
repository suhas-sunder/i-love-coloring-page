# Production readiness status

- Ordinary technical build validation: PASS
- Production readiness: BLOCKED
- Remaining owner/legal/account/external gates: 9
- LIVE advertising enabled: no
- Unverified ads.txt paths detected but not modified: public/ads.txt, out/ads.txt

`npm run build` validates and exports the static application without requiring invented owner facts. `npm run verify:production-readiness` adds the nine external/owner/legal/account gates and is expected to fail until verified inputs are supplied.
