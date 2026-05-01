import fs from 'node:fs';
import path from 'node:path';
import {
  findTestsMissingEpic,
  findTestsWithMultipleEpics,
  findTestsWithPlaceholderEpics,
  formatMetadataRows,
} from './metadata-checks';
import { findCypressTestFiles, scanCypressTestMetadata } from './scan-cypress-tests';
import { resolvePlaceholderEpicsInText, PlaceholderEpicMap } from './placeholder-epics';

interface MetadataCliOptions {
  json: boolean;
  root: string;
}

interface ResolveCliOptions extends MetadataCliOptions {
  mapping: string;
  write: boolean;
}

export function checkTestMetadataCli(argv = process.argv.slice(2), cwd = process.cwd()): number {
  const options = parseMetadataOptions(argv, cwd);
  const tests = scanCypressTestMetadata(options.root);
  const missing = findTestsMissingEpic(tests);
  const multiple = findTestsWithMultipleEpics(tests);
  const placeholders = findTestsWithPlaceholderEpics(tests);
  const failed = missing.length > 0 || multiple.length > 0 || placeholders.length > 0;

  if (options.json) {
    console.log(JSON.stringify({ missing, multiple, placeholders }, null, 2));
  } else {
    console.log('Tests missing Jira epic metadata:');
    console.log(formatMetadataRows(missing));
    console.log('\nTests with multiple Jira epics:');
    console.log(formatMetadataRows(multiple));
    console.log('\nTests with unresolved placeholder Jira epics:');
    console.log(formatMetadataRows(placeholders));
  }

  return failed ? 1 : 0;
}

export function findTestsMissingEpicCli(argv = process.argv.slice(2), cwd = process.cwd()): number {
  const options = parseMetadataOptions(argv, cwd);
  const findings = findTestsMissingEpic(scanCypressTestMetadata(options.root));
  printFindings(findings, options.json);
  return findings.length > 0 ? 1 : 0;
}

export function findTestsWithMultipleEpicsCli(argv = process.argv.slice(2), cwd = process.cwd()): number {
  const options = parseMetadataOptions(argv, cwd);
  const findings = findTestsWithMultipleEpics(scanCypressTestMetadata(options.root));
  printFindings(findings, options.json);
  return findings.length > 0 ? 1 : 0;
}

export function resolvePlaceholderJiraEpicsCli(argv = process.argv.slice(2), cwd = process.cwd()): number {
  const options = parseResolveOptions(argv, cwd);
  const mapping = readPlaceholderMapping(options.mapping);
  const results = findCypressTestFiles(options.root).map((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const resolution = resolvePlaceholderEpicsInText(text, mapping);

    if (options.write && resolution.replacements.length > 0) {
      fs.writeFileSync(file, resolution.text);
    }

    return {
      file: path.relative(options.root, file),
      replacements: resolution.replacements,
      unresolved: resolution.unresolved,
    };
  });

  const unresolvedCount = results.reduce((count, result) => count + result.unresolved.length, 0);

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const result of results) {
      for (const replacement of result.replacements) {
        console.log(`${result.file}:${replacement.line} ${replacement.from} -> ${replacement.to}`);
      }
      for (const unresolved of result.unresolved) {
        console.log(`${result.file}:${unresolved.line} unresolved ${unresolved.placeholder}`);
      }
    }
  }

  return unresolvedCount > 0 ? 1 : 0;
}

function parseMetadataOptions(argv: string[], cwd: string): MetadataCliOptions {
  const options: MetadataCliOptions = {
    json: false,
    root: cwd,
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
        options.root = path.resolve(cwd, readValue());
        break;
      default:
        throw new Error(`Unknown metadata option ${token}`);
    }
  }

  return options;
}

function parseResolveOptions(argv: string[], cwd: string): ResolveCliOptions {
  const options: ResolveCliOptions = {
    json: false,
    mapping: path.join(cwd, 'cypress', 'jira-epic-placeholders.json'),
    root: cwd,
    write: false,
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
      case '--mapping':
        options.mapping = path.resolve(cwd, readValue());
        break;
      case '--root':
        options.root = path.resolve(cwd, readValue());
        break;
      case '--write':
        options.write = true;
        break;
      default:
        throw new Error(`Unknown placeholder epic option ${token}`);
    }
  }

  return options;
}

function readPlaceholderMapping(mappingPath: string): PlaceholderEpicMap {
  if (!fs.existsSync(mappingPath)) {
    throw new Error(`Placeholder Jira epic mapping file not found at ${mappingPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(mappingPath, 'utf8')) as PlaceholderEpicMap | { epics?: unknown };

  if ('epics' in parsed && isPlaceholderEpicMap(parsed.epics)) {
    return parsed.epics;
  }

  return parsed as PlaceholderEpicMap;
}

function isPlaceholderEpicMap(value: unknown): value is PlaceholderEpicMap {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((mappingValue) => typeof mappingValue === 'string')
  );
}

function printFindings(findings: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    console.log(formatMetadataRows(findings as Parameters<typeof formatMetadataRows>[0]));
  }
}

function splitInlineFlag(token: string): [string, string | undefined] {
  const equalsIndex = token.indexOf('=');

  if (equalsIndex === -1 || !token.startsWith('-')) {
    return [token, undefined];
  }

  return [token.slice(0, equalsIndex), token.slice(equalsIndex + 1)];
}
