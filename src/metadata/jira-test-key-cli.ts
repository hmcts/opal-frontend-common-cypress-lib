/**
 * @file CLI helpers for extracting Jira test keys from Cypress source files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { extractJiraTestKeys, formatJiraTestKeysCsv } from './jira-test-key-extraction';
import { splitInlineFlag } from '../utils/split-inline-flag';

/**
 * CLI-specific options for Jira test key extraction output and scan scope.
 */
interface JiraTestKeyCliOptions {
  json: boolean;
  output: string;
  root: string;
}

/**
 * Runs the Jira test key extraction CLI and returns the intended process exit code.
 *
 * @param argv - CLI arguments to parse. Defaults to the current process arguments without the node and script paths.
 * @param cwd - Working directory used to resolve relative CLI paths. Defaults to the current process directory.
 * @returns Always `0` after writing or printing the extracted keys.
 */
export function extractJiraTestKeysCli(argv = process.argv.slice(2), cwd = process.cwd()): number {
  const options = parseJiraTestKeyOptions(argv, cwd);
  const matches = extractJiraTestKeys(options.root, cwd);

  if (options.json) {
    console.log(JSON.stringify(matches, null, 2));
    return 0;
  }

  const outputPath = path.resolve(cwd, options.output);
  fs.writeFileSync(outputPath, formatJiraTestKeysCsv(matches));
  console.log(`Wrote ${matches.length} matches to ${path.relative(cwd, outputPath) || options.output}`);

  return 0;
}

/**
 * Parses CLI options for the Jira test key extractor.
 *
 * @param argv - Raw CLI arguments to parse.
 * @param cwd - Working directory used to normalize relative paths.
 * @returns Parsed CLI options ready for extraction.
 */
function parseJiraTestKeyOptions(argv: string[], cwd: string): JiraTestKeyCliOptions {
  const options: JiraTestKeyCliOptions = {
    json: false,
    output: 'matches.csv',
    root: 'cypress',
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
      case '--output':
        options.output = path.relative(cwd, path.resolve(cwd, readValue())).split(path.sep).join('/');
        break;
      case '--root':
        options.root = path.relative(cwd, path.resolve(cwd, readValue())).split(path.sep).join('/');
        break;
      default:
        throw new Error(`Unknown Jira test key option ${token}`);
    }
  }

  return options;
}
