#!/usr/bin/env node
/**
 * @file CLI entry point for validating Jira metadata on covered Cypress tests.
 */
import { checkNewTestsJiraMetadataCli } from '../metadata/jira-metadata-policy-cli';

try {
  process.exitCode = checkNewTestsJiraMetadataCli();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
