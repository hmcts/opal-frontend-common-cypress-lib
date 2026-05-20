#!/usr/bin/env node
/**
 * @file CLI entry point for reporting duplicate Gherkin scenario names.
 */
import { findDuplicateScenariosCli } from '../cucumber/cucumber-cli';

try {
  process.exitCode = findDuplicateScenariosCli();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
