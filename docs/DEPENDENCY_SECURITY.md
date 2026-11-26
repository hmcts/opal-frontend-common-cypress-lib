# Dependency security

This guide describes dependency investigation and remediation for `@hmcts/opal-frontend-common-cypress`. Keep dated findings and verification evidence in a separate retained review pack. Human review and the repository's release process remain required before integration or publication.

## Sources of truth and package boundary

- [package.json](../package.json) declares Node support, the Yarn pin, dependency/peer ranges, verification scripts, exports and CLI entries.
- [yarn.lock](../yarn.lock) records the resolved graph; [.yarnrc.yml](../.yarnrc.yml) selects the linker.
- [README](../README.md) describes consumer setup and development/release checks.
- [CI workflow](../.github/workflows/npm_build.yml) declares its runtime and checks; [pack validation](../scripts/validate-pack-shape.cjs) checks the publish surface.
- [Renovate configuration](../.github/renovate.json) records bot rules. [Security exceptions](SECURITY_EXCEPTIONS.md) records authorised risk decisions, if any.

This is a TypeScript/Node Cypress helper library. Compilation emits JavaScript and declarations into `dist`. Consumers supply Cypress, reporting tools and TypeScript through peer dependencies. Inspect the actual packed manifest and files; development classification alone does not establish shipping exposure. A library lockfile update changes this checkout's tooling graph, while consumers resolve their own lockfiles and peers. There is no SSR service or Docker image target in this repository.

Use Corepack with the manifest-pinned Yarn release and a Node version supported by the scripts and CI. Record effective versions rather than assuming a prepared default overrides `packageManager`. Check inherited registry, release-age, engine and peer constraints. Do not install a machine-wide runtime, raise the public Node floor or bypass security controls as an implicit fix.

## Capture and interpret the baseline

Record the revision, branch, dirty state and file hashes before work; preserve unrelated changes. Read applicable repository guidance and policy. Record the active skill/resource hash, available agent/model settings and UTC start/end timestamps. Retain exact commands, working directory, runtime, stdout, stderr and exit status outside application source.

Discover workspaces and audit filters. Capture both scopes:

```sh
corepack yarn npm audit --all --recursive --environment production --json
corepack yarn npm audit --all --recursive --json
```

`--all` selects all workspaces; `--recursive` includes transitive dependencies. The complete scope includes development dependencies. Inspect `npmAuditExcludePackages`, `npmAuditIgnoreAdvisories`, registry configuration and release-age controls. Account for every filter; suppression is not removal.

Interpret the pinned Yarn version's report schema. Empty, malformed, partial or error-only JSON is not proof of a clean audit. When successful JSON output is empty, inspect the matching implementation and repeat the same scope without `--json`; require an explicit no-findings completion, successful exit and no errors. Preserve failures even when a retry succeeds. Classify deprecations separately from security advisories.

The checked-in workflow and scripts do not currently run a dependency audit or contain an audit wrapper. Record this enforcement gap as separate work; CI success alone does not establish audit coverage. If a wrapper is introduced, verify its workspace/scope selection, pinned schema and treatment of registry/parser failures. A false pass is an enforcement defect, not a security result.

## Trace and select supported fixes

For every canonical advisory, record its authoritative source, severity, affected/patched ranges, every resolved version and parent path, owning direct dependency and actual exposure. Use `corepack yarn why <package> -R --json`, lockfile descriptors and installed/parent manifests together. Consider runtime, test/build, native installation, packed artifact and consumer exposure separately; graph presence does not prove exploitability.

Inspect relevant existing bot diffs and the first failing CI stage when accessible. Distinguish scanner failure, enforcement defects, vulnerability findings and upgrade incompatibility. Verify current authoritative package metadata and release notes before choosing a patch.

Prefer supported direct/parent releases. A scoped `corepack yarn up -R <package>` is appropriate when current parent ranges permit patched versions; inspect every resulting descriptor change. Preserve supported Node/peer ranges and module/API compatibility. Unsupported cross-major resolutions need specific compatibility evidence, accountable ownership, tracking and a removal condition; absent evidence remains a review blocker. Do not treat fewer audit records as compatibility proof.

Do not regenerate suppression baselines, weaken thresholds or add exceptions to obtain a pass. Remove only verified resolved suppression entries when a baseline exists. No repository-specific exception approval authority is documented in the checked-in guidance; maintainers must establish the applicable policy and decision maker before accepting any future proposal. See the [exception register](SECURITY_EXCEPTIONS.md).

## Verify and retain review evidence

Use the repository's required checks:

```sh
corepack yarn install --immutable
corepack yarn test
corepack yarn typecheck
corepack yarn build
corepack yarn pack:check
```

Run tests, build and packing sequentially because build/prepack clean shared output. Inspect diagnostics as well as exit codes. Repeat both audit scopes and trace every target occurrence after a coherent fix. Count distinct canonical advisories, with raw records, affected versions and deprecations separately. Report fully resolved, remaining and new advisories; keep production separate from the complete graph. A finding is resolved only after all affected copies disappear and equivalent fresh scans corroborate removal.

Inspect the actual packed manifest, export targets, declarations, CLI files and shipping allowlist. Exercise representative packed imports/helpers and available consumer checks. Record the Node/OS/browser/native paths actually tested; newer-Node unit tests do not establish minimum-runtime or downstream Cypress compatibility. Never infer image or deployment verification from a local build.

Retain the review pack outside source when no established location exists: run identity, skill hashes, inputs/diff, findings/routes, compatibility decisions, raw captures, counts, verification ledger, exception status, review actions and suggested PR text. Preserve temporary raw evidence in review storage before cleanup. Keep secrets and sensitive request data out of public summaries. Mark human review, remote CI, consumer checks, publication and deployment separately according to observed evidence. Docker, CI and bot changes require separately authorised scope.
