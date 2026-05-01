#!/usr/bin/env node
import { resolvePlaceholderJiraEpicsCli } from '../metadata/metadata-cli';

try {
  process.exitCode = resolvePlaceholderJiraEpicsCli();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
