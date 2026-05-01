import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeBrowser, requireInstalledBrowser, resolveGenericBrowser } from '../browser/browser-support';
import { resolvePackageBin } from '../utils/resolve-package-bin';

interface OpalRunnerOptions {
  browser: string;
  dryRun: boolean;
  mode: string;
  noReports: boolean;
  parallel: boolean | null;
  passthroughArgs: string[];
  reset: boolean | null;
  suite: string;
  tags: boolean;
}

interface SuiteConfig {
  browser: string;
  combinedXmlCopyPath: string;
  combinedXmlPath: string;
  componentJsonDir: string;
  cucumberDir: string;
  cucumberSuite: string;
  isComponent: boolean;
  isLegacy: boolean;
  junitDir: string;
  junitMochaFile: string;
  leafScript: string;
  mode: 'opal' | 'legacy';
  outputRoot: string;
  screenshotsFolder: string;
  specPattern: string;
  suite: string;
  threads: number;
  weightsJson: string;
}

const nodeCommand = process.execPath;
const valueFlags = new Set(['--spec', '--config', '--env', '--reporter', '--reporter-options']);

export function parseOpalRunnerArgs(argv: string[]): OpalRunnerOptions {
  const options: OpalRunnerOptions = {
    browser: '',
    dryRun: false,
    mode: '',
    noReports: false,
    parallel: null,
    passthroughArgs: [],
    reset: null,
    suite: '',
    tags: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === undefined) {
      continue;
    }

    if (!options.suite && !arg.startsWith('--')) {
      options.suite = arg.trim().toLowerCase();
      continue;
    }

    if (arg === '--parallel') {
      options.parallel = true;
      continue;
    }

    if (arg === '--serial') {
      options.parallel = false;
      continue;
    }

    if (arg === '--tags') {
      options.tags = true;
      continue;
    }

    if (arg === '--reset') {
      options.reset = true;
      continue;
    }

    if (arg === '--no-reset') {
      options.reset = false;
      continue;
    }

    if (arg === '--no-reports') {
      options.noReports = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith('--browser=')) {
      options.browser = arg.split('=')[1] || '';
      continue;
    }

    if (arg === '--browser') {
      options.browser = argv[index + 1] || '';
      index += 1;
      continue;
    }

    if (arg.startsWith('--mode=')) {
      options.mode = arg.split('=')[1] || '';
      continue;
    }

    if (arg === '--mode') {
      options.mode = argv[index + 1] || '';
      index += 1;
      continue;
    }

    options.passthroughArgs.push(arg);

    if (valueFlags.has(arg) && index + 1 < argv.length) {
      options.passthroughArgs.push(argv[index + 1] as string);
      index += 1;
    }
  }

  return options;
}

export function runOpalSuite(argv = process.argv.slice(2), cwd = process.cwd(), baseEnv = process.env): number {
  const options = parseOpalRunnerArgs(argv);

  if (!options.suite) {
    throw new Error('A suite is required: component, smoke, functional, or fullfunctional');
  }

  if (options.suite === 'fullfunctional') {
    return executeFullFunctional(options, cwd, baseEnv);
  }

  if (!['component', 'smoke', 'functional'].includes(options.suite)) {
    throw new Error(`Unsupported suite requested: ${options.suite}`);
  }

  return executeSuite(options.suite, options, cwd, baseEnv);
}

function applyRunnerEnv(env: NodeJS.ProcessEnv, context: { mode: 'opal' | 'legacy'; suite: string; tags: boolean }) {
  env.TEST_MODE = context.mode.toUpperCase();

  if (context.mode === 'legacy') {
    env.LEGACY_ENABLED = 'true';
  }

  if (context.suite === 'functional' || context.suite === 'smoke') {
    env.TEST_STAGE = context.suite;
    env.CYPRESS_messagesEnabled = env.CYPRESS_messagesEnabled || 'true';
  } else if (context.suite === 'component') {
    env.TEST_STAGE = 'component';
  }

  const tagExpression = String(env.CYPRESS_TAGS || env.TAGS || '').trim();
  if ((context.tags || tagExpression) && context.suite !== 'component') {
    if (!env.CYPRESS_TAGS && env.TAGS) {
      env.CYPRESS_TAGS = env.TAGS;
    }
    env.CYPRESS_filterSpecs = env.CYPRESS_filterSpecs || 'true';
    env.CYPRESS_filterSpecsMixedMode = env.CYPRESS_filterSpecsMixedMode || 'hide';
  }
}

function buildSuiteConfig(options: { browser: string; mode: 'opal' | 'legacy'; suite: string }): SuiteConfig {
  const { browser, mode, suite } = options;
  const isLegacy = mode === 'legacy';

  if (suite === 'component') {
    return {
      browser,
      combinedXmlCopyPath: '',
      combinedXmlPath: '',
      componentJsonDir: `functional-output/component/${browser}/json`,
      cucumberDir: '',
      cucumberSuite: '',
      isComponent: true,
      isLegacy: false,
      junitDir: `functional-output/component/${browser}/junit`,
      junitMochaFile: `functional-output/component/${browser}/junit/component-test-output-[hash].xml`,
      leafScript: 'test:component:leaf',
      mode,
      outputRoot: 'functional-output',
      screenshotsFolder: `functional-output/component/${browser}/screenshots`,
      specPattern: 'cypress/component/**/**.cy.ts',
      suite,
      threads: 3,
      weightsJson: 'cypress/parallel/weights/component-parallel-weights.json',
    };
  }

  const outputRoot = suite === 'smoke' ? 'smoke-output' : 'functional-output';
  const specPattern =
    suite === 'smoke'
      ? isLegacy
        ? 'cypress/e2e/smoke/legacy/**/*.feature'
        : 'cypress/e2e/smoke/opal/**/*.feature'
      : (process.env.TEST_SPECS || '').trim() || 'cypress/e2e/functional/opal/**/*.feature';
  const screenshotsFolder = isLegacy
    ? `${outputRoot}/screenshots/${browser}/legacy`
    : `${outputRoot}/screenshots/${browser}`;
  const junitDir = isLegacy ? `${outputRoot}/prod/${browser}/legacy` : `${outputRoot}/prod/${browser}`;
  const junitMochaFile = isLegacy
    ? `${junitDir}/legacy-mode-test-output-[hash].xml`
    : `${junitDir}/opal-mode-test-output-[hash].xml`;

  return {
    browser,
    combinedXmlCopyPath: isLegacy ? '' : `${outputRoot}/prod/test-result.xml`,
    combinedXmlPath: isLegacy ? `${junitDir}/legacy-test-result.xml` : `${outputRoot}/prod/${browser}/${browser}-test-result.xml`,
    componentJsonDir: '',
    cucumberDir: `${junitDir}/cucumber`,
    cucumberSuite: suite,
    isComponent: false,
    isLegacy,
    junitDir,
    junitMochaFile,
    leafScript: `test:${suite}:leaf`,
    mode,
    outputRoot,
    screenshotsFolder,
    specPattern,
    suite,
    threads: suite === 'smoke' ? 2 : 3,
    weightsJson:
      suite === 'smoke'
        ? 'cypress/parallel/weights/smoke-parallel-weights.json'
        : 'cypress/parallel/weights/functional-parallel-weights.json',
  };
}

function buildCucumberReports(config: SuiteConfig, cwd: string, env: NodeJS.ProcessEnv, dryRun: boolean): number {
  return runCommand(
    nodeCommand,
    [path.resolve(__dirname, '../bin/build-cucumber-report.js'), config.cucumberSuite, `--browser=${config.browser}`, `--mode=${config.mode}`],
    cwd,
    env,
    dryRun,
  );
}

function buildComponentReport(browser: string, cwd: string, env: NodeJS.ProcessEnv, dryRun: boolean): number {
  return runCommand(
    nodeCommand,
    [path.resolve(__dirname, '../bin/build-component-report.js'), `--browser=${browser}`],
    cwd,
    env,
    dryRun,
  );
}

function createComponentParallelReporterConfig(config: SuiteConfig): string {
  const reporterConfigPath = path.join(os.tmpdir(), `opal-component-parallel-${config.browser}.json`);
  const reporterConfig = {
    reporterEnabled:
      'cypress-parallel/json-stream.reporter.js,cypress-mochawesome-reporter,mocha-junit-reporter,@hmcts/zephyr-automation-nodejs/cypress/ZephyrReporter',
    mochaJunitReporterReporterOptions: {
      mochaFile: config.junitMochaFile,
      toConsole: false,
    },
    cypressMochawesomeReporterReporterOptions: {
      reportDir: config.componentJsonDir,
      overwrite: false,
      html: false,
      json: true,
    },
  };

  fs.writeFileSync(reporterConfigPath, JSON.stringify(reporterConfig, null, 2));
  return reporterConfigPath;
}

function executeFullFunctional(options: OpalRunnerOptions, cwd: string, baseEnv: NodeJS.ProcessEnv): number {
  resetOutputs(cwd, options.dryRun);

  const componentExitCode = executeSuite(
    'component',
    {
      ...options,
      parallel: options.parallel === true,
      reset: false,
    },
    cwd,
    baseEnv,
  );
  const functionalExitCode = executeSuite(
    'functional',
    {
      ...options,
      parallel: options.parallel === false ? false : true,
      reset: false,
    },
    cwd,
    baseEnv,
  );

  return componentExitCode || functionalExitCode || 0;
}

function executeSuite(suite: string, options: OpalRunnerOptions, cwd: string, baseEnv: NodeJS.ProcessEnv): number {
  const env = { ...baseEnv };
  const mode = normalizeMode(options.mode);
  const browser = resolveBrowser(options.browser);
  const config = buildSuiteConfig({ browser, mode, suite });

  env.BROWSER_TO_RUN = browser;
  applyRunnerEnv(env, { mode, suite, tags: options.tags });

  if (options.reset === true || (options.reset === null && suite === 'component')) {
    resetOutputs(cwd, options.dryRun);
  }

  if (shouldSkipSuite(env, suite)) {
    console.log('[run-test-suite] skipping smoke stage because SKIP_SMOKE=true.');
    return 0;
  }

  const parallel = resolveParallelMode(suite, options.parallel);
  const testExitCode = parallel
    ? runParallelSuite(config, cwd, env, options.passthroughArgs, options.dryRun)
    : runSerialSuite(config, cwd, env, options.passthroughArgs, options.dryRun);

  if (options.noReports) {
    return testExitCode;
  }

  if (config.isComponent) {
    return testExitCode || buildComponentReport(browser, cwd, env, options.dryRun) || 0;
  }

  const { hasNdjson, hasXml } = getSuiteArtifacts(config, cwd);
  const hasTagFiltering = Boolean(String(env.CYPRESS_TAGS || env.TAGS || '').trim());

  if (!hasXml && !hasNdjson) {
    if (testExitCode === 0 && hasTagFiltering) {
      console.log(`[run-test-suite] no ${suite} scenarios matched the active tag filter; skipping report generation.`);
      return 0;
    }

    return testExitCode;
  }

  const combineXmlExitCode = hasXml ? mergeJUnitReports(config, cwd, env, options.dryRun) : 0;
  const cucumberExitCode = hasNdjson ? buildCucumberReports(config, cwd, env, options.dryRun) : 0;

  return testExitCode || combineXmlExitCode || cucumberExitCode || 0;
}

function getOptionValue(args: string[], optionName: string): string {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === optionName) {
      return args[index + 1] || '';
    }

    if (arg?.startsWith(`${optionName}=`)) {
      return arg.slice(optionName.length + 1);
    }
  }

  return '';
}

function getSuiteArtifacts(config: SuiteConfig, cwd: string): { hasNdjson: boolean; hasXml: boolean } {
  return {
    hasNdjson: listFiles(path.resolve(cwd, config.cucumberDir), '.ndjson').length > 0,
    hasXml: listFiles(path.resolve(cwd, config.junitDir), '.xml').length > 0,
  };
}

function hasOption(args: string[], optionName: string): boolean {
  return args.some((arg) => arg === optionName || arg.startsWith(`${optionName}=`));
}

function listFiles(directory: string, extension: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory)
    .filter((filename) => filename.endsWith(extension))
    .map((filename) => path.join(directory, filename))
    .sort();
}

function mergeJUnitReports(config: SuiteConfig, cwd: string, env: NodeJS.ProcessEnv, dryRun: boolean): number {
  const excludedFilename = path.basename(config.combinedXmlPath);
  const xmlFiles = listFiles(path.resolve(cwd, config.junitDir), '.xml').filter(
    (filePath) => path.basename(filePath) !== excludedFilename,
  );

  if (xmlFiles.length === 0) {
    return 0;
  }

  const jrmBin = resolvePackageBin(cwd, 'junit-report-merger', 'jrm');
  const exitCode = runCommand(jrmBin, [config.combinedXmlPath, ...xmlFiles], cwd, env, dryRun);
  if (exitCode !== 0) {
    return exitCode;
  }

  if (config.combinedXmlCopyPath) {
    const copyPath = path.resolve(cwd, config.combinedXmlCopyPath);
    fs.mkdirSync(path.dirname(copyPath), { recursive: true });
    fs.copyFileSync(path.resolve(cwd, config.combinedXmlPath), copyPath);
  }

  return 0;
}

function normalizeMode(mode: string): 'opal' | 'legacy' {
  const normalizedMode = String(mode || process.env.TEST_MODE || 'OPAL')
    .trim()
    .toLowerCase();

  if (!normalizedMode || normalizedMode === 'opal') {
    return 'opal';
  }

  if (normalizedMode === 'legacy') {
    return 'legacy';
  }

  throw new Error(`Unsupported TEST_MODE requested: ${mode}`);
}

function removeOption(args: string[], optionName: string): string[] {
  const filteredArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;

    if (arg === optionName) {
      index += 1;
      continue;
    }

    if (arg.startsWith(`${optionName}=`)) {
      continue;
    }

    filteredArgs.push(arg);
  }

  return filteredArgs;
}

function resetOutputs(cwd: string, dryRun: boolean): void {
  for (const outputDir of ['functional-output', 'smoke-output']) {
    const target = path.resolve(cwd, outputDir);
    if (dryRun) {
      console.log(`rm -rf ${outputDir}`);
    } else if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

function resolveBrowser(browser: string): string {
  const normalizedBrowser = normalizeBrowser(browser);

  if (normalizedBrowser) {
    return requireInstalledBrowser(normalizedBrowser);
  }

  return resolveGenericBrowser(process.env.BROWSER_TO_RUN);
}

function resolveParallelMode(suite: string, requestedParallel: boolean | null): boolean {
  if (requestedParallel !== null) {
    return requestedParallel;
  }

  return suite === 'smoke' || suite === 'functional';
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  dryRun: boolean,
): number {
  if (dryRun) {
    console.log([command, ...args].join(' '));
    return 0;
  }

  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  });

  if (typeof result.status === 'number') {
    return result.status;
  }

  return result.error ? 1 : 0;
}

function runParallelSuite(
  config: SuiteConfig,
  cwd: string,
  env: NodeJS.ProcessEnv,
  passthroughArgs: string[],
  dryRun: boolean,
): number {
  const specOverride = getOptionValue(passthroughArgs, '--spec');
  const forwardedArgs = removeOption(passthroughArgs, '--spec');
  const commandArgs = ['-s', config.leafScript, '-m', 'false', '-t', String(config.threads)];

  if (specOverride) {
    if (specOverride.includes('*')) {
      commandArgs.push('-d', specOverride);
    } else {
      commandArgs.push('--spec', specOverride);
    }
  } else {
    commandArgs.push('-d', config.specPattern);
  }

  if (config.weightsJson) {
    commandArgs.push('-w', config.weightsJson);
  }

  if (config.isComponent) {
    commandArgs.push('-p', createComponentParallelReporterConfig(config));
  } else {
    commandArgs.push('-r', 'mocha-junit-reporter', '-o', `mochaFile=${config.junitMochaFile}`);
  }

  if (forwardedArgs.length > 0) {
    commandArgs.push('-a', forwardedArgs.join(' '));
  }

  return runCommand(resolvePackageBin(cwd, 'cypress-parallel', 'cypress-parallel'), commandArgs, cwd, env, dryRun);
}

function runSerialSuite(
  config: SuiteConfig,
  cwd: string,
  env: NodeJS.ProcessEnv,
  passthroughArgs: string[],
  dryRun: boolean,
): number {
  const commandArgs = ['run', '--browser', config.browser];

  if (config.isComponent) {
    commandArgs.push('--component');
  }

  if (!hasOption(passthroughArgs, '--spec')) {
    commandArgs.push('--spec', config.specPattern);
  }

  commandArgs.push('--config', `screenshotsFolder=${config.screenshotsFolder}`);

  if (!config.isComponent && !hasOption(passthroughArgs, '--reporter-options')) {
    commandArgs.push('--reporter-options', `mochaFile=${config.junitMochaFile}`);
  }

  commandArgs.push(...passthroughArgs);

  return runCommand(resolvePackageBin(cwd, 'cypress', 'cypress'), commandArgs, cwd, env, dryRun);
}

function shouldSkipSuite(env: NodeJS.ProcessEnv, suite: string): boolean {
  if (suite !== 'smoke') {
    return false;
  }

  return (
    String(env.SKIP_SMOKE || '')
      .trim()
      .toLowerCase() === 'true'
  );
}
