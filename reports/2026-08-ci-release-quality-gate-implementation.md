# Deterministic CI and release-quality gate implementation

Date: August 6–7, 2026

## Executive result

The repository now has one authoritative release command, `npm run verify:release`, and one secure read-only GitHub Actions workflow, `.github/workflows/release-quality-gate.yml`. The workflow checks out the exact revision, installs from `package-lock.json`, builds once, runs the full suite once, runs the accepted post-build validators, preserves the two known nonblocking diagnostics as visible failures, verifies protected contracts, and fails if governed generators leave tracked or untracked drift.

The first Linux executions exposed three portability defects that the Windows baseline could not reveal: an unavailable ignored media bundle was being interpreted as broken images, and two whole-build byte aggregates were being committed even though Next output differs across operating systems. Those defects were corrected without weakening budgets, tests, protected hashes, or the final cleanliness check.

## 1–3. Starting state and workflow inventory

- Starting branch: `main`
- Starting HEAD: `2b4445f1d616384e5b68b41ff24cf4d5c21dbd4a`
- Upstream: `origin/main`
- Starting divergence: 0 ahead, 0 behind
- Starting status: clean; ignored `.next/` and `out/` were not treated as tracked drift
- Existing workflow inventory: no `.github` workflow existed at the starting revision
- Final workflow inventory: one workflow, `Release Quality Gate`, at `.github/workflows/release-quality-gate.yml`

## 4. Files changed

Implementation and corrective commits changed only release infrastructure, deterministic validation inputs, and governed generated reports:

- `.github/workflows/release-quality-gate.yml`
- `package.json`
- `pipeline/lib/performance-accessibility-quality.mjs`
- `pipeline/lib/release-quality-gate.mjs`
- `pipeline/manifests/crawl-indexation-validation.json`
- `pipeline/manifests/image-sitemap-xml-validation.json`
- `pipeline/manifests/performance-image-byte-fixture.json`
- `pipeline/manifests/trust-ads-readiness.json`
- `pipeline/reports/crawl-indexation-validation.md`
- `pipeline/reports/image-sitemap-xml-validation-report.md`
- `pipeline/scripts/build-trust-ads-readiness.mjs`
- `pipeline/scripts/run-release-quality-gate.mjs`
- `pipeline/scripts/validate-internal-link-crawlability.mjs`
- `pipeline/tests/performance-accessibility.test.mjs`
- `pipeline/tests/release-quality-gate.test.mjs`
- `reports/related-printable-quality.md`
- `reports/related-printable-samples.csv`

No application component, route, source image, public asset, dependency lockfile, Netlify directive, advertising implementation, or printable implementation changed.

## 5–6. Runtime, lockfile, and package-manager contract

- Authoritative Node major: 22, inherited from the unchanged `netlify.toml` contract and enforced by release preflight
- GitHub Actions Node: 22 through `actions/setup-node`
- Local lab runtime: Node 25.9.0 and npm 10.9.0 on Windows 10 x64; this is a local portability check, not the authoritative production runtime
- Install command: `npm ci`
- Package cache: npm download cache only, keyed through `package-lock.json`; `node_modules` is not cached
- Starting and final lockfile SHA-256: `1c23c36c97e0ae9dc3a09302aa57f23d93818d16906e991a32e77fbaef6c3106`
- Dependency and package-version changes: none
- Local clean-install result: 137 packages installed in 35.361 seconds; the pre-existing npm audit result reported four high-severity findings and was not altered or concealed by this milestone

## 7–9. Release-command architecture, stages, and duplicate-work audit

`pipeline/scripts/run-release-quality-gate.mjs` is the cross-platform orchestrator. It invokes npm through the current Node process and npm CLI path rather than a shell, forwards termination signals, preserves child exit codes, records timings, and has a strict clean-tree default. `--allow-dirty` exists only for local pre-commit simulation and compares final status with the explicitly accepted starting status.

| Order | Stage | Required | Artifact dependency |
| ---: | --- | :---: | --- |
| 1 | Repository preflight | Yes | Source tree |
| 2 | Type validation | Yes | Source tree |
| 3 | Production build | Yes | Type-valid source |
| 4 | Full tests | Yes | Fresh `.next/` and `out/` |
| 5 | Static routes | Yes | Fresh export |
| 6 | Accessibility | Yes | Fresh export |
| 7 | Crawl and indexation | Yes | Fresh export |
| 8 | Internal links | Yes | Fresh export |
| 9 | Image sitemap | Yes | Fresh export |
| 10 | Export safety | Yes | Fresh export |
| 11 | Public page layout | Yes | Fresh export |
| 12 | Refinement contracts | Yes | Fresh export |
| 13 | Public punctuation | Yes | Fresh export |
| 14 | Accepted payload budgets | Yes | Fresh build/export |
| 15 | Client bundle analysis | Yes | Fresh build/export |
| 16 | Technical production readiness | Yes | Fresh export |
| 17 | Historical aggregate JavaScript diagnostic | Diagnostic | Fresh build/export |
| 18 | External owner-readiness diagnostic | Diagnostic | Fresh export and owner state |
| 19 | Protected contracts | Yes | Governed manifests and export fixture |
| 20 | Generated-output cleanliness | Yes | Complete run |

The build occurs once and the full primary test command occurs once. Focused validation is reached through the full suite or post-build validators; the gate does not recursively call itself. The historical raw JavaScript aggregate and unresolved owner/legal/account readiness remain visible as diagnostic exit 1 results but cannot turn a technical pass into a false production-readiness claim.

## 10–16. Workflow security and execution policy

- Triggers: pull requests targeting `main` and pushes to `main` when at least one changed path is outside `reports/**` and `pipeline/review/**`; manual `workflow_dispatch` remains unconditional
- Excluded triggers: no `pull_request_target`, schedule, repository dispatch, or write-back workflow
- Permissions: explicit `contents: read`; no write permission
- Runner: `ubuntu-24.04`
- Timeout: 35 minutes
- Concurrency: workflow plus pull-request number or branch ref; a newer revision cancels its superseded in-progress run
- Checkout: `actions/checkout` v6.1.0 pinned to `d23441a48e516b6c34aea4fa41551a30e30af803`, with `persist-credentials: false`
- Node setup: `actions/setup-node` v6.5.0 pinned to `249970729cb0ef3589644e2896645e5dc5ba9c38`
- Pinning references were checked against the official [checkout release](https://github.com/actions/checkout/releases/tag/v6.1.0), [setup-node release](https://github.com/actions/setup-node/releases/tag/v6.5.0), and [GitHub security-hardening guidance](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-third-party-actions)
- Deployment prohibition: no deploy step, Netlify command, Cloudflare command, artifact publication, commit, or repository write-back
- Secret boundary: no `${{ secrets.* }}` reference and no new repository secret
- Environment boundary: no project-specific or advertising environment variable; no new environment variable of any kind
- External boundary: no branch-setting, Netlify, Cloudflare, DNS, AdSense-account, consent-platform, analytics, or other external-service modification

## 17–18. Generator determinism and drift behavior

The governed build regenerates runtime printables, title assignments, public content, search data, image-sitemap data/XML, navigation counts, revision diagnostics, trust readiness, punctuation output, and related-quality evidence. The gate snapshots `git status --porcelain=v1 --untracked-files=all` before work and compares it afterward. Any new or changed path fails with the exact before/after status and a compact diff stat; the gate never rewrites, reverts, or commits generated output.

Linux revealed two invalid tracked readiness measurements. `staticJavascriptBytes` and `totalBytes` represented raw build aggregates rather than stable contracts and varied with platform-specific Next output. Both were removed from the committed trust manifest. Stable counts, protected hashes, route contracts, per-route accepted budgets, and technical readiness remain enforced. Focused tests now assert that these volatile fields cannot return.

The performance audit also now distinguishes public-URL validity from local media availability. A compact 17-image byte fixture covers approved eager WebP resources when the ignored R2 upload bundle is absent in CI. Unmeasured images do not receive a fabricated zero-byte pass, and broken public URL checks still run against the authoritative runtime catalog.

## 19–22. Local simulation, timings, duration, and memory

The final exact pre-commit simulation command was:

`npm run verify:release -- --allow-dirty`

It passed in 921.639 seconds.

| Stage | Exit | Duration |
| --- | ---: | ---: |
| Repository preflight | 0 | 0.345s |
| Type validation | 0 | 9.645s |
| Production build | 0 | 439.791s |
| Full tests | 0 | 319.050s |
| Static routes | 0 | 0.502s |
| Accessibility | 0 | 0.398s |
| Crawl and indexation | 0 | 6.834s |
| Internal links | 0 | 81.730s |
| Image sitemap | 0 | 0.319s |
| Export safety | 0 | 39.256s |
| Public page layout | 0 | 0.434s |
| Refinement contracts | 0 | 0.264s |
| Public punctuation | 0 | 10.085s |
| Accepted payload budgets | 0 | 0.737s |
| Client bundle analysis | 0 | 1.979s |
| Technical production readiness | 0 | 2.839s |
| Historical aggregate JavaScript diagnostic | 1, diagnostic | 3.880s |
| External owner-readiness diagnostic | 1, diagnostic | 2.896s |
| Protected contracts | 0 | 0.211s |
| Generated-output cleanliness | 0 | 0.442s |

The internal-link validator was the highest explicitly instrumented stage: maximum RSS 1,202,499,584 bytes and approximate peak heap 820,901,968 bytes. This is a local stage measurement, not a whole-pipeline or hosted-run peak-memory claim. GitHub Actions did not expose reliable per-process peak memory through the selected no-dependency workflow.

## 23–31. Verification results

- Focused release-gate tests: 16/16 passed
- Focused trust/readiness tests after final portability correction: 12/12 passed
- Full primary suite: 237/237 passed, 0 failed
- Typecheck: passed
- Production build: passed
- Static output: 6,920 pages
- Protected runtime printables: 6,352
- Protected printable-record hash: `4fc394e39aa4d8e2b0e2e96ebbc586d00c91e5e18479748b72dbb6075e77bed6`
- Default US Letter PDF: 613,584 bytes; accepted SHA-256 `8bab1edb0e18f90800974c16be753d2448a20c6b0a104fbc92e7df774ec82bca`; existing byte identity preserved
- Export suite: 19/19 passed
- Internal links: 6,916 graph nodes and 334,452 edges; no orphan, broken-target, canonical, or sitemap-contract finding
- Client bundle: accepted route-level budgets passed; the legacy raw aggregate diagnostic remains above its historical threshold and is reported separately
- Accepted performance/accessibility budgets: passed, including the CI-portable eager-image fixture path
- Advertising/trust regression: passed; advertising implementation and trust-page meaning were unchanged
- `/ads.txt`: exact one-line, 58-byte UTF-8 record, no BOM or duplicate: `google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0`

## 32. Implementation commits and pushes

| Commit | Message | Purpose |
| --- | --- | --- |
| `cf2e138290857705d5680b8ef2ee4319096f660e` | `ci: add deterministic release quality gate` | Workflow, orchestrator, tests, package scripts, stable generator outputs |
| `f583b9d76655d9448243475169ce22c1beb7a212` | `fix: make image performance budgets CI-portable` | CI-safe eager-image byte fixture and missing-bundle behavior |
| `76ebd9d8d5db73dccdd116cb1dfb410c2d247a58` | `fix: remove cross-platform readiness drift` | Remove volatile aggregate JavaScript bytes |
| `10c568e2eef07de1257c598540484b863461d944` | `fix: remove platform-specific readiness totals` | Remove volatile whole-export byte total |

Every commit was pushed normally to `origin/main`; no force push occurred.

## 33–37. GitHub Actions evidence and CI-only corrections

The final authoritative implementation run is [GitHub Actions run 31149149648](https://github.com/suhas-sunder/i-love-coloring-page/actions/runs/31149149648) for exact SHA `10c568e2eef07de1257c598540484b863461d944`. It was triggered by a push, started at 04:59:49 UTC, completed at 05:09:57 UTC, and concluded `success`.

| GitHub Actions step | Conclusion | Duration |
| --- | --- | ---: |
| Set up job | success | <1s |
| Check out repository | success | 6s |
| Set up Node.js 22 | success | 1s |
| Install locked dependencies | success | 11s |
| Run deterministic release quality gate | success | 9m44s; internal total 583.763s |
| Post Node cleanup | success | 3s |
| Post checkout cleanup | success | 1s |
| Complete job | success | <1s |

The complete job duration was 10m08s. Within the gate, the Linux build took 146.396s, the 237-test suite took 329.859s, internal links took 61.961s, export safety took 12.667s, all required stages exited 0, the two documented diagnostics exited 1, and generated cleanliness passed in 0.237s.

The preceding failures were retained as evidence rather than rerun blindly:

1. [Run 31144513920](https://github.com/suhas-sunder/i-love-coloring-page/actions/runs/31144513920), SHA `cf2e138`: 235 passed, 1 failed, 1 skipped before the correction. The broken-public-images budget reported 281 because CI intentionally lacks the ignored R2 media bundle. Correction: authoritative URL validation plus an exact-byte eager-image fixture.
2. [Run 31146115519](https://github.com/suhas-sunder/i-love-coloring-page/actions/runs/31146115519), SHA `f583b9d`: all substantive stages passed; final cleanliness found one changed `staticJavascriptBytes` line. Correction: remove the cross-platform raw aggregate and prohibit its return.
3. [Run 31147671350](https://github.com/suhas-sunder/i-love-coloring-page/actions/runs/31147671350), SHA `76ebd9d`: all substantive stages passed; final cleanliness found one changed `totalBytes` line. Correction: remove the whole-export byte aggregate and prohibit its return.

Failure evidence remains compact: GitHub’s step log contains the original command output, while the orchestrator prints stage name, command, exit code, duration, exact final status drift, and diff stat. No full static export, `.next`, `out`, source media, browser profile, or full CI log is uploaded.

## 38. Netlify deployment timeline

- Final corrective push: 2026-08-07 04:59:47 UTC
- First production revision check after the three-minute quiet period: 05:03:17 UTC; previous revision `76ebd9d8d5db73dccdd116cb1dfb410c2d247a58`
- Second check: 05:04:34 UTC; final revision `10c568e2eef07de1257c598540484b863461d944`
- Final deployment duration: 4 minutes 47 seconds from push
- Runtime-data SHA-256 before and after: `d916a37223dc9bcf329c599402302146ef1726561fa5029066766f627f6da5b9`
- Deployment mechanism: the existing automatic Netlify integration; no manual deployment or configuration change

## 39. Production smoke result

At 05:05:55 UTC, cache-busted, no-cache requests returned:

| Route | HTTP | Content type | Result |
| --- | ---: | --- | --- |
| `/` | 200 | HTML UTF-8 | Current assets and `manual-six-v2` layout marker |
| `/coloring-pages/animals` | 200 | HTML UTF-8 | Current layout marker |
| `/printables/animals/animals-alligator-4feec8505a` | 200 | HTML UTF-8 | Current layout marker; printable route intact |
| `/privacy` | 200 | HTML UTF-8 | No ad-layout wrapper |
| `/ads.txt` | 200 | text/plain UTF-8 | Exact 58-byte authorized-seller record |
| `/sitemap.xml` | 200 | application/xml | 810,504 bytes |
| `/image-sitemap.xml` | 200 | application/xml | 2,475,010 bytes |

Homepage asset evidence included `/_next/static/chunks/0yrq3v8z903t-.css`, `/_next/static/chunks/0n35cz-_9zsnr.js`, `/_next/static/chunks/0pqt~8bl3ukh4.js`, and `/_next/static/chunks/07lhk_q6pmm3r.js`.

A bounded JavaScript-enabled in-app Chromium smoke on the animals hub found one visible H1, one `main` landmark, the expected page title, no horizontal overflow at 1,265 CSS pixels, one centralized AdSense script, six eligible rendered units for that measured layout, and no captured console errors. No advertisement was clicked. This verifies a single Chromium environment only; it is not cross-engine or physical-device evidence.

## 40. Remaining manual coverage

- Firefox and Playwright WebKit rendering
- Real Safari and Safari/iOS
- NVDA, JAWS, VoiceOver, and TalkBack task flows
- Physical Android and iOS performance/reflow
- Native print dialog behavior and printer-specific output
- Physical printer line-art and paper handling
- Owner-managed branch-protection configuration

## 41. Suggested branch-protection check

Owner action: require `Release Quality Gate / Deterministic release verification` on protected `main` changes after confirming the exact check name in repository settings. This milestone did not modify branch settings.

## 42. External-change confirmation

No deployment workflow, application dependency, package version, environment variable, repository secret, write permission, branch setting, Netlify directive, Cloudflare setting, DNS setting, AdSense account setting, consent setting, analytics integration, manual deployment, or other external-service change was introduced. No ad was clicked. Application behavior, routes, printables, generated editorial content, advertising behavior, and public assets remain unchanged.

## 43. Documentation-only trigger-policy optimization

On August 7, 2026, the workflow trigger was narrowed with native `paths-ignore` filters for exactly two documentation/evidence roots: `reports/**` and `pipeline/review/**`. The same filters apply to pushes to `main` and pull requests targeting `main`; `workflow_dispatch` remains available without a path condition. No file-extension-wide pattern is used.

The ownership review retained CI for `.github/**`, `AGENTS.md`, `app/**`, `src/**`, `public/**`, `pipeline/lib/**`, `pipeline/scripts/**`, `pipeline/tests/**`, `pipeline/manifests/**`, `pipeline/reports/**`, package and lock files, Next/TypeScript configuration, `netlify.toml`, `.gitignore`, and every mixed change containing at least one path outside the two ignored roots. This follows GitHub's documented rule that `paths-ignore` skips a run only when every changed path matches an ignored pattern: [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore).

Concrete baseline evidence came from documentation-only commit `62d59c10012f49a1ee3b6723ff4256d5859cf2a1`, which changed only this repository's report/evidence surfaces yet launched successful release-gate run `31207036798`. The optimized implementation commit `ef8f9b59a4cef22ad7406437c01971037357dec8` changed the workflow and its focused tests, correctly launched run `31208732187`, and completed successfully from 18:49:40 to 19:00:38 UTC. Its deterministic gate step passed from 18:50:11 to 19:00:33 UTC.

Local verification passed 17/17 focused release-gate tests, 254/254 full primary tests, TypeScript validation, and `git diff --check`. Tests cover report-only, review-evidence-only, combined ignored-root, mixed source/documentation, workflow, governance, generated-data, validation, package, and configuration changes. They also prohibit broad Markdown/JSON exclusions.

The documentation/evidence commit containing this section is the live all-ignored-path verification case. Its resulting SHA and the bounded GitHub Actions API observation are recorded in the milestone completion response because the commit identifier does not exist until this evidence is committed. No branch-protection setting was changed; owners should account for GitHub's documented pending-check behavior if this workflow is configured as a required pull-request check.
