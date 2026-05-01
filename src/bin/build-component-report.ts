#!/usr/bin/env node
import { buildMochawesomeReportCli } from '../reports/report-cli';

buildMochawesomeReportCli()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
