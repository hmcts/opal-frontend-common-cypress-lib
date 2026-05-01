#!/usr/bin/env node
import { findTestsMissingEpicCli } from '../metadata/metadata-cli';

try {
  process.exitCode = findTestsMissingEpicCli();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
