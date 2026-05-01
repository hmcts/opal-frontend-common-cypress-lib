#!/usr/bin/env node
import { checkTestMetadataCli } from '../metadata/metadata-cli';

try {
  process.exitCode = checkTestMetadataCli();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
