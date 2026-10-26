# Changelog

All notable changes to this package will be documented in this file.

## [Unreleased]

## [0.0.5] - 2026-10-26

- Compose exclusions with resolved Cypress configuration through a runner-only marker and consumer setup helper.
- Normalise selector aliases in CLI order, honour empty overrides, and rewrite both selector spellings consistently.
- Export `applyExtendedTestSelection(config)` for consumer setup callbacks; direct Cypress runs continue to ignore the pipeline exclusion flag.

## [0.0.4] - 2026-10-26

- Preserve nested JSON, arrays, and escaped quoted strings when merging Cypress options.
- Preserve dotted Cypress option names alongside functional and component tag selections.
- Honour CLI component tag aliases over inherited selectors and merge Cypress `-e` / `-x` short options without dropping other values.
- Add runner-only `@extendedTest` exclusion for functional and component pipeline runs via `EXCLUDE_EXTENDED_TESTS=true`.
- Preserve existing CLI tag selections and pass the policy through parallel leaf runners while leaving direct Cypress runs unchanged.

## [0.0.3] - 2026-05-19

- Add `opal-cypress-check-jira-test-metadata` for Jira metadata policy validation.
- Keep `opal-cypress-check-test-metadata` as a compatibility alias for existing consumers.
- Add `opal-cypress-extract-jira-test-keys` to extract Jira test keys from Cypress specs and feature files.
- Add `opal-cypress-find-duplicate-scenarios` to detect duplicate Cucumber scenarios.
- Add `opal-cypress-find-unused-steps` to detect unused step definitions.

## [0.0.2] - 2026-05-05

- Fix Cucumber report helper resolution for `@badeball/cypress-cucumber-preprocessor` versions that hide `package.json` behind package exports.

## [0.0.1] - 2026-05-01

- Initial shared Cypress CLI package for OPAL frontend applications.
