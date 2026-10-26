# OPAL Frontend Common Cypress Library

Shared Cypress runner, reporting, browser, and metadata tooling for OPAL frontend applications.

Package name:

```text
@hmcts/opal-frontend-common-cypress
```

Repository name:

```text
opal-frontend-common-cypress-lib
```

## Scope

This package centralises reusable Cypress infrastructure only:

- Cypress runner CLI argument handling
- report path resolution and report build commands
- consumer-project binary resolution for Cypress/reporting peers
- Jira metadata validation and placeholder resolution
- Cucumber duplicate-scenario and unused-step analysis
- Jira test-key extraction from Cypress specs and feature files

It deliberately does not move application-specific Cypress specs, selectors, fixtures, intercepts, step definitions, Jenkinsfiles, or `cypress.config.ts`.

All binaries run from `process.cwd()`, so they scan and write against the consuming repository.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or later
- [Yarn](https://yarnpkg.com/) v4.x (Berry)

### Install Dependencies

```bash
yarn
```

## Install In A Consumer Repository

```bash
yarn add --dev @hmcts/opal-frontend-common-cypress
```

Consumers must keep their Cypress/reporting packages installed in the application repository. This package declares them as peer dependencies so it uses the same Cypress toolchain as the consuming app.

## Binaries

```text
opal-cypress-runner
opal-cypress-build-component-report
opal-cypress-build-cucumber-report
opal-cypress-check-new-tests-jira-metadata
opal-cypress-check-test-metadata
opal-cypress-extract-jira-test-keys
opal-cypress-find-duplicate-scenarios
opal-cypress-find-tests-missing-epic
opal-cypress-find-tests-with-multiple-epics
opal-cypress-find-unused-steps
opal-cypress-resolve-placeholder-jira-epics
```

## Consumer Script Examples

Keep the existing script names in `opal-frontend` and `opal-rm-frontend`; change only the script bodies.

```json
{
  "scripts": {
    "test:functional": "opal-cypress-runner functional --browser chrome",
    "test:smoke": "opal-cypress-runner smoke --browser chrome",
    "test:component": "opal-cypress-runner component --component --output-dir component-output",
    "build:component-report": "opal-cypress-build-component-report --suite component --output-dir component-output",
    "build:cucumber-report": "opal-cypress-build-cucumber-report --suite functional --output-dir functional-output",
    "check:cypress-metadata": "opal-cypress-check-test-metadata",
    "check:new-tests:jira-metadata": "opal-cypress-check-new-tests-jira-metadata --feature-root cypress/e2e/functional/opal/features --exclude-file cypress/e2e/functional/opal/features/reciprocalMaintenance/dummyTest.feature",
    "find:duplicate:scenarios": "opal-cypress-find-duplicate-scenarios --root cypress/e2e/functional/opal/features",
    "find:unused:steps": "opal-cypress-find-unused-steps --exclude-path-fragment manualAccountCreation --exclude-path-fragment manual-account-creation",
    "extract:jira:test-keys": "opal-cypress-extract-jira-test-keys --output matches.csv"
  }
}
```

Default report directories:

```text
functional -> functional-output
smoke      -> smoke-output
component  -> component-output
```

Use `--output-dir` if a consumer already writes to a different folder.

## Switching Between Local and Published Versions

This follows the same local tarball workflow as the other OPAL common libraries.

To use a published version in a consuming project:

```bash
yarn add --dev @hmcts/opal-frontend-common-cypress
```

To test local changes in a consumer repository:

1. Build and pack this library:

   ```bash
   yarn pack:local
   ```

   This creates a local `.tgz` artifact in this repository root, for example `hmcts-opal-frontend-common-cypress-0.0.3.tgz`.

2. In the consuming project, point an environment variable at this repository root:

   ```bash
   export COMMON_CYPRESS_LIB_PATH="[INSERT PATH TO COMMON CYPRESS LIB REPOSITORY ROOT]"
   ```

3. Add or update a consumer helper script to install the tarball from that path. The consumer script should mirror the existing `import:local:*` pattern used for the UI and Node common libs.

4. To switch back to the published version, reinstall `@hmcts/opal-frontend-common-cypress` from npm.

## Runner CLI

Examples:

```bash
opal-cypress-runner functional --browser chrome --headed
opal-cypress-runner smoke --browser=electron --spec "cypress/e2e/**/*.feature"
opal-cypress-runner component --component --output-dir component-output
```

Common options:

```text
--browser <name>
--headed
--headless
--spec <glob>
--config <key=value>
--env <key=value>
--base-url <url>
--output-dir <dir>
--component
--e2e
--dry-run
```

Parallel mode delegates to the consumer repository's `cypress-parallel` install:

```bash
opal-cypress-runner functional --parallel --threads 4 --script cypress:run --specs-dir cypress/e2e
```

## Extended tests

Mark functional scenarios and component tests with `@extendedTest`, keeping existing Jira and release tags.
A feature-level tag or component `describe` tag applies to its nested tests.

```gherkin
@extendedTest
Scenario: An extended journey
  # Existing steps
```

```ts
it('checks an extended case', { tags: [...existingTags, '@extendedTest'] }, () => {
  // Existing assertions
});
```

The runner includes extended tests by default. Set `EXCLUDE_EXTENDED_TESTS=true` to exclude them from functional and component runs:

```sh
EXCLUDE_EXTENDED_TESTS=true opal-cypress-runner functional
EXCLUDE_EXTENDED_TESTS=true opal-cypress-runner component
```

The runner passes a private CLI marker only to its Cypress child process. The library helper combines the exclusion with the resolved Cypress configuration, preserving configured, environment and CLI selectors.
Parallel consumers must use runner-backed `test:functional:leaf` and `test:component:leaf` scripts, as OPAL does:

```json
{
  "test:functional:leaf": "opal-cypress-runner functional --serial --no-reports --no-reset",
  "test:component:leaf": "opal-cypress-runner component --serial --no-reports --no-reset"
}
```

Component exclusion requires a Cypress version supporting `--expose` and `@cypress/grep` v6 registration in the consumer support file.
Functional selection uses the Cucumber preprocessor's `TAGS` environment option.
CLI options accept both JSON objects and comma-separated `key=value` values. Both `--env` / `-e` and `--expose` / `-x` are supported.
Explicit CLI `grepTags` or `grep-tags` values take precedence over inherited component selectors, including an empty selection.
Set `EXCLUDE_EXTENDED_TESTS=false` (or leave it unset) for manual and nightly runs that should include extended tests.
Consumer Jenkinsfiles own PR-label decisions such as `extendedTests`; this library does not query GitHub.
For the OPAL frontend, use the following policy:

| Execution | `EXCLUDE_EXTENDED_TESTS` | Extended tests |
| --- | --- | --- |
| PR without `extendedTests` | `true` | Excluded |
| PR with `extendedTests` | `false` | Included in the selected suite |
| Master pipeline | `true` | Excluded |
| Scheduled or manually triggered nightly | `false` | Included in the selected suite |
| Local runner | Unset | Included in the selected suite |

Existing release, tag, folder, and skip selectors still apply. The label includes extended tests alongside ordinary
selected tests; it does not select only extended tests.

Direct `cypress open` and `cypress run` commands do not interpret `EXCLUDE_EXTENDED_TESTS`, so they include extended
tests even if that variable is set. Explicit user tag selections and skipped tests still apply.
Register the library helper at the start of **both** E2E and component `setupNodeEvents` callbacks, before the
Cucumber or grep plugins register:

```ts
import { applyExtendedTestSelection } from '@hmcts/opal-frontend-common-cypress';

// Inside each setupNodeEvents(on, config) callback:
applyExtendedTestSelection(config);
// Register existing Cypress plugins, then return config as usual.
```

The helper acts only on the private runner marker, removes that marker, and otherwise leaves the config untouched.
It does not read `EXCLUDE_EXTENDED_TESTS` from the environment. Direct Cypress commands therefore continue to
include extended tests even when that pipeline flag is present. Smoke-suite selection is unchanged.
Later CLI selector aliases, including empty values, override earlier occurrences. Both spellings of each resolved
selector are rewritten together so an inherited alias cannot bypass the exclusion.

## Metadata Tags

Metadata checks support Jira epic tags in feature files and Cypress specs:

```gherkin
@jiraEpic(OPAL-123)
Scenario: Pay a fine
```

```ts
/**
 * @jiraEpic OPAL-123
 */
it('pays a fine', () => {});
```

Placeholder epics can be resolved from a JSON mapping:

```json
{
  "PLACEHOLDER_PAYMENTS": "OPAL-123"
}
```

```bash
opal-cypress-resolve-placeholder-jira-epics --mapping cypress/jira-epic-placeholders.json --write
```

## Development

```bash
yarn
yarn test
yarn typecheck
yarn build
yarn pack:check
yarn pack:local
```

## Publish The Library

Once changes have been approved and merged into `main`, publish a new version by creating a GitHub release:

1. Increment the version in `package.json`.
2. Commit and push the change to `main`.
3. Create a new GitHub release in `hmcts/opal-frontend-common-cypress-lib` using a tag that matches the package version, for example `v0.0.2` or `0.0.2`.
4. The release workflow builds, validates the package shape, and publishes to npm using trusted publishing.

## Release Checklist

Before creating a GitHub release tag:

1. Update `package.json` to the intended version.
2. Add a `CHANGELOG.md` entry under `## [Unreleased]` describing user-visible changes.
3. Run:

   ```bash
   yarn test
   yarn typecheck
   yarn build
   yarn pack:check
   ```

4. Confirm the bin entries in `package.json` are intentional and backwards-compatible.
5. Create a GitHub release with a tag matching `package.json` version.
