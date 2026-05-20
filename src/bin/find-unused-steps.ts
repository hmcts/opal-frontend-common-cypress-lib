#!/usr/bin/env node
/**
 * @file CLI entry point for reporting unused Cypress Cucumber step definitions.
 */
import { findUnusedStepsCli } from '../cucumber/cucumber-cli';

try {
  process.exitCode = findUnusedStepsCli();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
