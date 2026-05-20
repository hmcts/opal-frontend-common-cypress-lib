# Changelog

All notable changes to this package will be documented in this file.

## [Unreleased]

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
