import { resolveReportPaths } from '../reports/report-paths';

export interface RunnerOptions {
  baseUrl?: string;
  browser?: string;
  config: string[];
  cypressArgs: string[];
  dryRun: boolean;
  env: string[];
  headed: boolean;
  outputDir?: string;
  parallel: boolean;
  parallelScript?: string;
  reporter?: string;
  reporterOptions?: string;
  spec?: string;
  specsDir?: string;
  strictMode?: boolean;
  suite: string;
  testingType?: 'component' | 'e2e';
  threads?: number;
  weightsJson?: string;
}

export interface RunnerCommand {
  args: string[];
  binName: string;
  cwd: string;
  dryRun: boolean;
  env: Record<string, string>;
  packageName: string;
}

const DEFAULT_SUITE = 'functional';

export function parseRunnerArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): RunnerOptions {
  const options: RunnerOptions = {
    browser: env.CYPRESS_BROWSER,
    config: [],
    cypressArgs: [],
    dryRun: false,
    env: [],
    headed: false,
    parallel: false,
    suite: env.OPAL_CYPRESS_SUITE ?? DEFAULT_SUITE,
  };

  let suiteSeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === undefined) {
      continue;
    }

    if (token === '--') {
      options.cypressArgs.push(...argv.slice(index + 1));
      break;
    }

    const [flag, inlineValue] = splitInlineFlag(token);

    if (!flag.startsWith('-')) {
      if (!suiteSeen) {
        options.suite = flag;
        suiteSeen = true;
      } else {
        options.cypressArgs.push(flag);
      }
      continue;
    }

    const readValue = (): string => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }

      index += 1;
      const value = argv[index];

      if (value === undefined) {
        throw new Error(`Missing value for ${flag}`);
      }

      return value;
    };

    switch (flag) {
      case '--base-url':
        options.baseUrl = readValue();
        break;
      case '--browser':
        options.browser = readValue();
        break;
      case '--component':
        options.testingType = 'component';
        break;
      case '--config':
        options.config.push(readValue());
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--e2e':
        options.testingType = 'e2e';
        break;
      case '--env':
        options.env.push(readValue());
        break;
      case '--headed':
        options.headed = true;
        break;
      case '--headless':
        options.headed = false;
        break;
      case '--no-parallel':
        options.parallel = false;
        break;
      case '--output-dir':
        options.outputDir = readValue();
        break;
      case '--parallel':
        options.parallel = true;
        break;
      case '--reporter':
        options.reporter = readValue();
        break;
      case '--reporter-options':
        options.reporterOptions = readValue();
        break;
      case '--script':
        options.parallelScript = readValue();
        break;
      case '--spec':
        options.spec = readValue();
        break;
      case '--specs-dir':
        options.specsDir = readValue();
        break;
      case '--strict-mode':
        options.strictMode = parseBoolean(readValue());
        break;
      case '--testing-type':
        options.testingType = parseTestingType(readValue());
        break;
      case '--threads':
        options.threads = parsePositiveInteger(readValue(), '--threads');
        break;
      case '--weights-json':
        options.weightsJson = readValue();
        break;
      default:
        options.cypressArgs.push(token);
        if (inlineValue === undefined && argv[index + 1] !== undefined && !argv[index + 1]?.startsWith('-')) {
          index += 1;
          options.cypressArgs.push(argv[index] as string);
        }
        break;
    }
  }

  return options;
}

export function buildRunnerCommand(options: RunnerOptions, cwd = process.cwd()): RunnerCommand {
  const outputDir = resolveReportPaths({ cwd, outputDir: options.outputDir, suite: options.suite }).outputDir;
  const env = {
    OPAL_CYPRESS_OUTPUT_DIR: outputDir,
    OPAL_CYPRESS_SUITE: options.suite,
  };

  if (options.parallel) {
    const args = [
      '-s',
      options.parallelScript ?? 'cypress:run',
      '-t',
      String(options.threads ?? 2),
      '-d',
      options.specsDir ?? 'cypress/e2e',
    ];

    if (options.weightsJson !== undefined) {
      args.push('-w', options.weightsJson);
    }

    if (options.strictMode !== undefined) {
      args.push('-m', String(options.strictMode));
    }

    const cypressArgs = buildCypressRunArgs(options);
    if (cypressArgs.length > 1) {
      args.push('-a', quoteForCypressParallel(cypressArgs.slice(1).join(' ')));
    }

    return {
      args,
      binName: 'cypress-parallel',
      cwd,
      dryRun: options.dryRun,
      env,
      packageName: 'cypress-parallel',
    };
  }

  return {
    args: buildCypressRunArgs(options),
    binName: 'cypress',
    cwd,
    dryRun: options.dryRun,
    env,
    packageName: 'cypress',
  };
}

export function buildCypressRunArgs(options: RunnerOptions): string[] {
  const args = ['run'];

  if (options.testingType === 'component') {
    args.push('--component');
  }

  if (options.testingType === 'e2e') {
    args.push('--e2e');
  }

  if (options.browser !== undefined) {
    args.push('--browser', options.browser);
  }

  if (options.headed) {
    args.push('--headed');
  }

  if (options.spec !== undefined) {
    args.push('--spec', options.spec);
  }

  for (const config of options.config) {
    args.push('--config', config);
  }

  if (options.baseUrl !== undefined) {
    args.push('--config', `baseUrl=${options.baseUrl}`);
  }

  for (const env of options.env) {
    args.push('--env', env);
  }

  if (options.reporter !== undefined) {
    args.push('--reporter', options.reporter);
  }

  if (options.reporterOptions !== undefined) {
    args.push('--reporter-options', options.reporterOptions);
  }

  args.push(...options.cypressArgs);

  return args;
}

function parseBoolean(value: string): boolean {
  if (['1', 'true', 'yes'].includes(value.toLowerCase())) {
    return true;
  }

  if (['0', 'false', 'no'].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`Expected a boolean value, received "${value}"`);
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected ${flag} to be a positive integer, received "${value}"`);
  }

  return parsed;
}

function parseTestingType(value: string): 'component' | 'e2e' {
  if (value === 'component' || value === 'e2e') {
    return value;
  }

  throw new Error(`Expected --testing-type to be "component" or "e2e", received "${value}"`);
}

function quoteForCypressParallel(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function splitInlineFlag(token: string): [string, string | undefined] {
  const equalsIndex = token.indexOf('=');

  if (equalsIndex === -1 || !token.startsWith('-')) {
    return [token, undefined];
  }

  return [token.slice(0, equalsIndex), token.slice(equalsIndex + 1)];
}
