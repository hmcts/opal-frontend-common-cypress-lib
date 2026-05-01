import path from 'node:path';

export interface ReportPathOptions {
  cwd?: string;
  outputDir?: string;
  suite?: string;
}

export interface ReportPaths {
  cucumberHtml: string;
  cucumberJson: string;
  htmlDir: string;
  junitMergedXml: string;
  junitPattern: string;
  mergedJson: string;
  mochawesomePattern: string;
  outputDir: string;
}

export function defaultOutputDirForSuite(suite = 'functional'): string {
  const normalizedSuite = suite.toLowerCase();

  if (normalizedSuite === 'functional') {
    return 'functional-output';
  }

  if (normalizedSuite === 'smoke') {
    return 'smoke-output';
  }

  if (normalizedSuite === 'component') {
    return 'component-output';
  }

  return `${normalizedSuite}-output`;
}

export function resolveReportPaths(options: ReportPathOptions = {}): ReportPaths {
  const cwd = options.cwd ?? process.cwd();
  const outputDir = path.resolve(cwd, options.outputDir ?? defaultOutputDirForSuite(options.suite));
  const junitDir = path.join(outputDir, 'junit');

  return {
    cucumberHtml: path.join(outputDir, 'cucumber-report.html'),
    cucumberJson: path.join(outputDir, 'cucumber-report.json'),
    htmlDir: path.join(outputDir, 'html'),
    junitMergedXml: path.join(junitDir, 'results.xml'),
    junitPattern: path.join(junitDir, '*.xml'),
    mergedJson: path.join(outputDir, 'mochawesome.json'),
    mochawesomePattern: path.join(outputDir, '**/*.json'),
    outputDir,
  };
}
