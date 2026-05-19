/**
 * @file CLI helpers for validating Jira metadata across covered Cypress tests.
 */
import path from 'node:path';
import {
  DEFAULT_COMPONENT_ROOT,
  DEFAULT_FEATURE_ROOT,
  JiraMetadataFailure,
  JiraMetadataPolicyOptions,
  validateJiraMetadataPolicy,
} from './jira-metadata-policy';
import { splitInlineFlag } from '../utils/split-inline-flag';

/**
 * CLI-specific options for Jira metadata validation output and path overrides.
 */
interface JiraMetadataPolicyCliOptions extends JiraMetadataPolicyOptions {
  json: boolean;
}

/**
 * Runs the Jira metadata validation CLI and returns the intended process exit code.
 *
 * @param argv - CLI arguments to parse. Defaults to the current process arguments without the node and script paths.
 * @param cwd - Working directory used to resolve relative CLI paths. Defaults to the current process directory.
 * @returns `1` when validation failures are found, otherwise `0`.
 */
export function checkNewTestsJiraMetadataCli(argv = process.argv.slice(2), cwd = process.cwd()): number {
  const options = parseJiraMetadataPolicyOptions(argv, cwd);
  const result = validateJiraMetadataPolicy(options, cwd);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.failures.length > 0) {
    printJiraMetadataFailures(result.failures, result.tests.length);
  } else {
    printJiraMetadataSuccess(result.tests.length);
  }

  return result.failures.length > 0 ? 1 : 0;
}

/**
 * Parses CLI options for the Jira metadata validator.
 *
 * @param argv - Raw CLI arguments to parse.
 * @param cwd - Working directory used to normalize relative paths.
 * @returns Parsed CLI options ready for validation.
 */
function parseJiraMetadataPolicyOptions(argv: string[], cwd: string): JiraMetadataPolicyCliOptions {
  const options: JiraMetadataPolicyCliOptions = {
    componentRoot: DEFAULT_COMPONENT_ROOT,
    excludedFeatureFiles: [],
    featureRoot: DEFAULT_FEATURE_ROOT,
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
      case '--component-root':
        options.componentRoot = normalizeRelativeCliPath(readValue(), cwd);
        break;
      case '--exclude-file':
        options.excludedFeatureFiles.push(normalizeRelativeCliPath(readValue(), cwd));
        break;
      case '--feature-root':
        options.featureRoot = normalizeRelativeCliPath(readValue(), cwd);
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown Jira metadata option ${token}`);
    }
  }

  return options;
}

/**
 * Prints the success summary for a Jira metadata validation run.
 *
 * @param testCount - Number of covered tests that were checked.
 * @returns Nothing. Output is written to stdout.
 */
function printJiraMetadataSuccess(testCount: number): void {
  if (testCount === 0) {
    console.log('No covered component or functional E2E tests were found.');
    return;
  }

  console.log(`Checked ${testCount} covered component/functional E2E tests.`);
  console.log(
    'Component tests include @JIRA-EPIC and either @JIRA-STORY or @JIRA-DEFECT. Functional E2E tests include @JIRA-EPIC and at least one of @JIRA-STORY, @JIRA-NFR, or @JIRA-DEFECT.',
  );
}

/**
 * Prints the failure summary for a Jira metadata validation run.
 *
 * @param failures - Validation failures to print.
 * @param testCount - Total number of covered tests that were checked.
 * @returns Nothing. Output is written to stderr.
 */
function printJiraMetadataFailures(failures: JiraMetadataFailure[], testCount: number): void {
  console.error(
    `FAIL: ${failures.length} of ${testCount} covered component/functional E2E tests are missing required Jira metadata.`,
  );

  for (const failure of failures.sort((left, right) => {
    if (left.filePath !== right.filePath) {
      return left.filePath.localeCompare(right.filePath);
    }

    return left.line - right.line;
  })) {
    console.error(`- ${failure.filePath}:${failure.line} [${failure.kind}] ${failure.title} | missing ${failure.missing.join(', ')}`);
  }
}

/**
 * Normalizes a CLI path to a slash-delimited path relative to the working directory.
 *
 * @param value - CLI path value supplied by the caller.
 * @param cwd - Working directory used to resolve the path.
 * @returns The normalized relative path.
 */
function normalizeRelativeCliPath(value: string, cwd: string): string {
  return path.relative(cwd, path.resolve(cwd, value)).split(path.sep).join('/');
}
