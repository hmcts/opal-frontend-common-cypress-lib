#!/usr/bin/env node
import { buildCucumberReportCli } from '../reports/report-cli';

buildCucumberReportCli()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
