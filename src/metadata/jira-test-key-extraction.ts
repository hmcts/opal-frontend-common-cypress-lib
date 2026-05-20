/**
 * @file Helpers for extracting Jira test key tags from Cypress component and feature tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { listFilesRecursively } from '../utils/list-files-recursively';

const DEFAULT_CYPRESS_ROOT = 'cypress';
const DEFAULT_JIRA_TEST_KEY_REGEX = /@JIRA-(?:TEST-)?KEY:([A-Z][A-Z0-9]+-\d+)/gu;

/**
 * A single Jira test key tag match extracted from a supported test file.
 */
export interface JiraTestKeyMatch {
  file: string;
  key: string;
  line: number;
  tag: string;
}

/**
 * Extracts Jira test key tags from supported Cypress test files under the given root.
 *
 * @param root - Root directory to scan. Defaults to the Cypress root.
 * @param cwd - Base directory used to resolve the root and report relative file names.
 * @returns All Jira test key matches found in supported test files.
 */
export function extractJiraTestKeys(root = DEFAULT_CYPRESS_ROOT, cwd = process.cwd()): JiraTestKeyMatch[] {
  const absoluteRoot = path.resolve(cwd, root);
  const matches: JiraTestKeyMatch[] = [];

  for (const file of listFilesRecursively(absoluteRoot, { includeFile: isSupportedTestFile })) {
    const relativeFilePath = path.relative(cwd, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    const lineStarts = getLineStarts(text);
    let match: RegExpExecArray | null;

    while ((match = DEFAULT_JIRA_TEST_KEY_REGEX.exec(text)) !== null) {
      const key = match[1];

      if (!key) {
        continue;
      }

      matches.push({
        file: relativeFilePath,
        key,
        line: lineNumberForIndex(lineStarts, match.index),
        tag: match[0],
      });
    }
  }

  return matches;
}

/**
 * Formats extracted Jira test keys as a single CSV row.
 *
 * @param matches - Extracted Jira test key matches to serialize.
 * @returns A CSV string containing the matched keys.
 */
export function formatJiraTestKeysCsv(matches: JiraTestKeyMatch[]): string {
  return matches.map((match) => `"${match.key.replace(/"/gu, '""')}"`).join(',');
}

/**
 * Determines whether a file path points to a supported component or feature test file.
 *
 * @param filePath - File path to inspect.
 * @returns `true` when the file should be scanned for Jira test keys.
 */
function isSupportedTestFile(filePath: string): boolean {
  return (
    filePath.endsWith('.feature') ||
    filePath.endsWith('.cy.ts') ||
    filePath.endsWith('.cy.tsx') ||
    filePath.endsWith('.cy.js') ||
    filePath.endsWith('.cy.jsx')
  );
}

/**
 * Records the character index where each line in the text begins.
 *
 * @param text - Source text whose line boundaries should be indexed.
 * @returns Zero-based character offsets for every line start.
 */
function getLineStarts(text: string): number[] {
  const starts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      starts.push(index + 1);
    }
  }

  return starts;
}

/**
 * Converts a character index into a one-based line number using a precomputed line-start table.
 *
 * @param lineStarts - Character offsets for the start of each line.
 * @param index - Character index to convert.
 * @returns The one-based line number containing the index.
 */
function lineNumberForIndex(lineStarts: number[], index: number): number {
  let line = 1;

  for (let current = 0; current < lineStarts.length; current += 1) {
    const start = lineStarts[current];

    if (start === undefined || start > index) {
      break;
    }

    line = current + 1;
  }

  return line;
}
