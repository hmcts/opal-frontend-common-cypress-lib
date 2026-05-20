/**
 * @file Helpers for finding step definitions that are not referenced by any feature step.
 */
import fs from 'node:fs';
import path from 'node:path';
import { listFilesRecursively } from '../utils/list-files-recursively';

const DEFAULT_FEATURE_ROOT = path.join('cypress', 'e2e');
const DEFAULT_STEP_ROOT = path.join('cypress', 'support', 'step_definitions');
const FEATURE_FILE_EXTENSION = '.feature';
const STEP_FILE_EXTENSION = '.ts';
const FEATURE_STEP_REGEX = /^\s*(?:Given|When|Then|And|But)\s+(.+?)\s*$/u;
const STEP_DEFINITION_REGEX =
  /\b(?:Given|When|Then|And|But)\s*\(\s*(?:'((?:\\.|[^'])*)'|"((?:\\.|[^"])*)"|`((?:\\.|[^`])*)`|\/((?:\\.|[^/])+?)\/([dgimsuvy]*))\s*,/gsu;

export interface UnusedStepDefinition {
  file: string;
  line: number;
  source: string;
}

export interface UnusedStepsResult {
  featureFilesScanned: number;
  stepFilesScanned: number;
  unusedSteps: UnusedStepDefinition[];
}

interface StepDefinitionMatcher extends UnusedStepDefinition {
  matcher: RegExp;
}

export interface FindUnusedStepsOptions {
  excludePathFragments?: string[];
  featureRoot?: string;
  stepRoot?: string;
}

/**
 * Scans feature files and step-definition files to find definitions that are never matched by any feature step.
 *
 * @param options - Optional roots and path exclusions that narrow the scan.
 * @param cwd - Base directory used to resolve relative roots and report relative file names.
 * @returns Counts of scanned files plus the unused step definitions that were found.
 */
export function findUnusedSteps(options: FindUnusedStepsOptions = {}, cwd = process.cwd()): UnusedStepsResult {
  const stepRoot = path.resolve(cwd, options.stepRoot ?? DEFAULT_STEP_ROOT);
  const featureRoot = path.resolve(cwd, options.featureRoot ?? DEFAULT_FEATURE_ROOT);
  const excludePathFragments = options.excludePathFragments ?? [];
  const stepFiles = listFilesRecursively(stepRoot, {
    excludePathFragments,
    includeFile: (filePath) => filePath.endsWith(STEP_FILE_EXTENSION),
  });
  const featureFiles = listFilesRecursively(featureRoot, {
    excludePathFragments,
    includeFile: (filePath) => filePath.endsWith(FEATURE_FILE_EXTENSION),
  });
  const featureSteps = featureFiles.flatMap((file) => extractFeatureSteps(fs.readFileSync(file, 'utf8')));
  const unusedSteps = stepFiles.flatMap((file) => {
    const relativeFilePath = path.relative(cwd, file).split(path.sep).join('/');
    const definitions = extractStepDefinitions(relativeFilePath, fs.readFileSync(file, 'utf8'));

    return definitions
      .filter((definition) => featureSteps.every((featureStep) => !definition.matcher.test(featureStep)))
      .map<UnusedStepDefinition>(({ file: definitionFile, line, source }) => ({
        file: definitionFile,
        line,
        source,
      }));
  });

  return {
    featureFilesScanned: featureFiles.length,
    stepFilesScanned: stepFiles.length,
    unusedSteps,
  };
}

/**
 * Extracts the step text from Gherkin step lines within a feature file.
 *
 * @param text - Raw feature-file content.
 * @returns Normalized step text entries in the order they appear.
 */
function extractFeatureSteps(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.match(FEATURE_STEP_REGEX)?.[1]?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0);
}

/**
 * Extracts step-definition matchers from a step-definition source file.
 *
 * @param file - Relative file path used in the reported results.
 * @param text - Raw step-definition source.
 * @returns Step definitions paired with the matcher used to test feature steps.
 */
function extractStepDefinitions(file: string, text: string): StepDefinitionMatcher[] {
  const lineStarts = getLineStarts(text);
  const definitions: StepDefinitionMatcher[] = [];
  let match: RegExpExecArray | null;

  while ((match = STEP_DEFINITION_REGEX.exec(text)) !== null) {
    const source = readStepDefinitionSource(match);

    if (!source) {
      continue;
    }

    definitions.push({
      file,
      line: lineNumberForIndex(lineStarts, match.index),
      matcher: source.kind === 'regex' ? buildRegexStepMatcher(source.value, source.flags) : buildStringStepMatcher(source.value),
      source: source.kind === 'regex' ? `/${source.value}/${source.flags}` : source.value,
    });
  }

  return definitions;
}

/**
 * Reads the string or regex source captured by a step-definition match.
 *
 * @param match - Regex match produced from the step-definition source text.
 * @returns The extracted matcher source, or `null` when no supported source is present.
 */
function readStepDefinitionSource(
  match: RegExpExecArray,
): { flags: string; kind: 'regex'; value: string } | { kind: 'string'; value: string } | null {
  const singleQuoted = match[1];

  if (singleQuoted !== undefined) {
    return { kind: 'string', value: unescapeQuotedStepText(singleQuoted, '\'') };
  }

  const doubleQuoted = match[2];

  if (doubleQuoted !== undefined) {
    return { kind: 'string', value: unescapeQuotedStepText(doubleQuoted, '"') };
  }

  const templateLiteral = match[3];

  if (templateLiteral !== undefined) {
    return { kind: 'string', value: unescapeQuotedStepText(templateLiteral, '`') };
  }

  const regexValue = match[4];

  if (regexValue !== undefined) {
    return { flags: match[5] ?? '', kind: 'regex', value: regexValue };
  }

  return null;
}

/**
 * Converts a Cucumber expression string into a regular expression that can be matched against feature steps.
 *
 * @param stepText - Step text extracted from a string-based step definition.
 * @returns A matcher that mirrors the supported placeholder syntax in the source step.
 */
function buildStringStepMatcher(stepText: string): RegExp {
  const expectsTrailingColon = stepText.endsWith(':');
  const normalizedStepText = expectsTrailingColon ? stepText.slice(0, -1) : stepText;
  // Translate the common Cucumber placeholders into simple regex fragments for matching.
  const pattern = escapeForRegExp(normalizedStepText)
    .replace(/\\\{string\\\}/gu, '("[^"]*"|\'[^\']*\'|\\S+)')
    .replace(/\\\{int\\\}/gu, '-?\\d+')
    .replace(/\\\{float\\\}/gu, '-?\\d+(?:\\.\\d+)?')
    .replace(/\\\{word\\\}/gu, '\\w+');
  const trailingColonPattern = expectsTrailingColon ? ':' : ':?';

  return new RegExp(`^\\s*${pattern}\\s*${trailingColonPattern}\\s*$`, 'u');
}

/**
 * Rebuilds a regex-based step matcher while removing stateful flags that would break repeated `.test()` calls.
 *
 * @param source - Regex source extracted from the step definition.
 * @param flags - Regex flags extracted from the step definition.
 * @returns A regular expression safe to reuse across multiple feature steps.
 */
function buildRegexStepMatcher(source: string, flags: string): RegExp {
  // `g` and `y` mutate `lastIndex`, which would make repeated tests report false negatives.
  const normalizedFlags = flags.replace(/[gy]/gu, '');

  return new RegExp(source, normalizedFlags);
}

/**
 * Escapes regex metacharacters in plain text so it can be embedded safely in a pattern.
 *
 * @param value - Plain text that should be matched literally.
 * @returns The escaped text.
 */
function escapeForRegExp(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/gu, '\\$&');
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

/**
 * Unescapes a quoted step-definition string using the quoting rules for the original literal.
 *
 * @param value - Raw text captured from the quoted literal.
 * @param quote - Quote character used by the original literal.
 * @returns The unescaped step text.
 */
function unescapeQuotedStepText(value: string, quote: '\'' | '"' | '`'): string {
  return value
    .replace(/\\n/gu, '\n')
    .replace(/\\r/gu, '\r')
    .replace(/\\t/gu, '\t')
    .replace(new RegExp(`\\\\${escapeForRegExp(quote)}`, 'gu'), quote)
    .replace(/\\\\/gu, '\\');
}
