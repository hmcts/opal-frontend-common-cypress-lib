#!/usr/bin/env node
import { runTestSuiteCli } from '../runner/run-test-suite-cli';

runTestSuiteCli()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
