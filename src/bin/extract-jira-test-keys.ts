#!/usr/bin/env node
/**
 * @file CLI entry point for extracting Jira test keys from Cypress test sources.
 */
import { extractJiraTestKeysCli } from '../metadata/jira-test-key-cli';

try {
  process.exitCode = extractJiraTestKeysCli();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
