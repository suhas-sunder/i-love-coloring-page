# Production readiness status

- Ordinary technical build validation: PASS
- Production readiness: BLOCKED
- Remaining owner/legal/account/external gates: 6
- Status-coordinated live advertising in the default build: yes
- Verified ads.txt paths: public/ads.txt, out/ads.txt

`npm run build` validates and exports the static application without requiring invented owner facts. `npm run verify:production-readiness` adds the remaining external, owner, legal, and account gates and is expected to fail until they are resolved.
