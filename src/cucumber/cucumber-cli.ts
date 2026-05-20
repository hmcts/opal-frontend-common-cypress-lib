/**
 * @file CLI helpers for the duplicate-scenario and unused-step Cucumber utilities.
 */
import { findDuplicateScenarios } from './find-duplicate-scenarios';
import { findUnusedSteps } from './find-unused-steps';
import { splitInlineFlag } from '../utils/split-inline-flag';

interface DuplicateScenariosCliOptions {
  json: boolean;
  root?: string;
}

interface UnusedStepsCliOptions {
  excludePathFragments: string[];
  failOnUnused: boolean;
  featureRoot?: string;
  json: boolean;
  stepRoot?: string;
}

/**
 * Runs the duplicate-scenario report for the supplied CLI arguments and returns the intended process exit code.
 *
 * @param argv - CLI arguments to parse. Defaults to the current process arguments without the node and script paths.
 * @param cwd - Working directory used to resolve any supplied roots. Defaults to the current process directory.
 * @returns `1` when duplicate scenarios are found, otherwise `0`.
 */
export function findDuplicateScenariosCli(argv = process.argv.slice(2), cwd = process.cwd()): number {
  const options = parseDuplicateScenariosOptions(argv);
  const duplicates = findDuplicateScenarios(options.root, cwd);

  if (options.json) {
    console.log(JSON.stringify(duplicates, null, 2));
  } else if (duplicates.length === 0) {
    console.log('No duplicate scenario names found.');
  } else {
    console.log(`Found ${duplicates.length} duplicate scenario name(s):\n`);

    for (const duplicate of duplicates) {
      console.log(`"${duplicate.name}"`);
      duplicate.occurrences.forEach((occurrence) => {
        console.log(`  - ${occurrence.file}:${occurrence.line}`);
      });
      console.log('');
    }
  }

  return duplicates.length > 0 ? 1 : 0;
}

/**
 * Runs the unused-step report for the supplied CLI arguments and returns a failure code when requested.
 *
 * @param argv - CLI arguments to parse. Defaults to the current process arguments without the node and script paths.
 * @param cwd - Working directory used to resolve feature and step roots. Defaults to the current process directory.
 * @returns `1` when `--fail-on-unused` is set and unused steps are found, otherwise `0`.
 */
export function findUnusedStepsCli(argv = process.argv.slice(2), cwd = process.cwd()): number {
  const options = parseUnusedStepsOptions(argv);
  const result = findUnusedSteps(
    {
      excludePathFragments: options.excludePathFragments,
      featureRoot: options.featureRoot,
      stepRoot: options.stepRoot,
    },
    cwd,
  );

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Scanning ${result.stepFilesScanned} step files and ${result.featureFilesScanned} feature files.\n`);

    const unusedStepsByFile = new Map<string, { line: number; source: string }[]>();

    for (const unusedStep of result.unusedSteps) {
      if (!unusedStepsByFile.has(unusedStep.file)) {
        unusedStepsByFile.set(unusedStep.file, []);
      }

      unusedStepsByFile.get(unusedStep.file)?.push({ line: unusedStep.line, source: unusedStep.source });
    }

    for (const [file, unusedSteps] of unusedStepsByFile) {
      console.log(`=== ${file} ===`);

      for (const unusedStep of unusedSteps) {
        console.log(`  ❌ line ${unusedStep.line}: ${unusedStep.source}`);
      }

      console.log('');
    }

    console.log(`Total unused steps: ${result.unusedSteps.length}`);
  }

  return options.failOnUnused && result.unusedSteps.length > 0 ? 1 : 0;
}

/**
 * Parses duplicate-scenario flags, accepting both `--flag value` and `--flag=value` forms.
 *
 * @param argv - Raw CLI arguments passed to the duplicate-scenario command.
 * @returns Parsed duplicate-scenario options ready for execution.
 */
function parseDuplicateScenariosOptions(argv: string[]): DuplicateScenariosCliOptions {
  const options: DuplicateScenariosCliOptions = {
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === undefined) {
      continue;
    }

    const [flag, inlineValue] = splitInlineFlag(token);
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
      case '--json':
        options.json = true;
        break;
      case '--root':
        options.root = readValue();
        break;
      default:
        throw new Error(`Unknown duplicate-scenario option ${token}`);
    }
  }

  return options;
}

/**
 * Parses unused-step flags, including repeated exclusions and optional JSON output.
 *
 * @param argv - Raw CLI arguments passed to the unused-step command.
 * @returns Parsed unused-step options ready for execution.
 */
function parseUnusedStepsOptions(argv: string[]): UnusedStepsCliOptions {
  const options: UnusedStepsCliOptions = {
    excludePathFragments: [],
    failOnUnused: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === undefined) {
      continue;
    }

    const [flag, inlineValue] = splitInlineFlag(token);
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
      case '--exclude-path-fragment':
        options.excludePathFragments.push(readValue());
        break;
      case '--fail-on-unused':
        options.failOnUnused = true;
        break;
      case '--feature-root':
        options.featureRoot = readValue();
        break;
      case '--json':
        options.json = true;
        break;
      case '--step-root':
        options.stepRoot = readValue();
        break;
      default:
        throw new Error(`Unknown unused-step option ${token}`);
    }
  }

  return options;
}
