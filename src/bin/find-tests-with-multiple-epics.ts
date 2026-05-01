#!/usr/bin/env node
import { findTestsWithMultipleEpicsCli } from '../metadata/metadata-cli';

try {
  process.exitCode = findTestsWithMultipleEpicsCli();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
