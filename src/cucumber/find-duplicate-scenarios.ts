/**
 * @file Helpers for scanning Gherkin feature files for duplicate scenario titles.
 */
import fs from 'node:fs';
import path from 'node:path';
import { listFilesRecursively } from '../utils/list-files-recursively';

const DEFAULT_FEATURE_ROOT = path.join('cypress', 'e2e');
const FEATURE_FILE_EXTENSION = '.feature';
const FEATURE_GLOB_SUFFIXES = [/\/\*\*\/\*\.feature$/, /\/\*\.feature$/];
const SCENARIO_REGEX = /^\s*Scenario(?:\s+Outline)?:\s*(.+)$/u;

export interface ScenarioOccurrence {
  file: string;
  line: number;
}

export interface DuplicateScenario {
  name: string;
  occurrences: ScenarioOccurrence[];
}

/**
 * Resolves the feature directory used for duplicate-scenario scanning.
 *
 * @param featureRoot - Optional feature root supplied by the caller.
 * @param cwd - Base directory used to resolve relative paths.
 * @returns An absolute path to the feature directory that should be scanned.
 */
export function resolveDuplicateScenarioRoot(featureRoot: string | undefined, cwd = process.cwd()): string {
  if (featureRoot && featureRoot.length > 0) {
    return path.resolve(cwd, featureRoot);
  }

  const envFeatureGlob = process.env.FEATURE_GLOB;

  if (envFeatureGlob && envFeatureGlob.length > 0) {
    return path.resolve(cwd, stripFeatureGlobSuffix(envFeatureGlob));
  }

  return path.resolve(cwd, DEFAULT_FEATURE_ROOT);
}

/**
 * Finds scenario names that appear more than once across the resolved feature files.
 *
 * @param featureRoot - Optional feature root supplied by the caller.
 * @param cwd - Base directory used to resolve relative paths and report relative file names.
 * @returns Duplicate scenario names with every file and line where they occur.
 */
export function findDuplicateScenarios(featureRoot: string | undefined, cwd = process.cwd()): DuplicateScenario[] {
  const root = resolveDuplicateScenarioRoot(featureRoot, cwd);
  const occurrences = new Map<string, ScenarioOccurrence[]>();

  for (const file of listFilesRecursively(root, { includeFile: (filePath) => filePath.endsWith(FEATURE_FILE_EXTENSION) })) {
    const relativeFilePath = path.relative(cwd, file).split(path.sep).join('/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/u);

    lines.forEach((line, index) => {
      if (line.trim().startsWith('#')) {
        return;
      }

      const match = line.match(SCENARIO_REGEX);

      if (!match) {
        return;
      }

      // Normalize whitespace so formatting differences do not hide a duplicate title.
      const scenarioName = match[1]?.trim().replace(/\s+/gu, ' ');

      if (!scenarioName) {
        return;
      }

      if (!occurrences.has(scenarioName)) {
        occurrences.set(scenarioName, []);
      }

      occurrences.get(scenarioName)?.push({ file: relativeFilePath, line: index + 1 });
    });
  }

  return [...occurrences.entries()]
    .filter(([, scenarioOccurrences]) => scenarioOccurrences.length > 1)
    .map(([name, scenarioOccurrences]) => ({ name, occurrences: scenarioOccurrences }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Removes known `.feature` glob suffixes from a configured feature glob so only the directory remains.
 *
 * @param featureGlob - Feature glob value, typically from `FEATURE_GLOB`.
 * @returns The feature root directory implied by the glob.
 */
function stripFeatureGlobSuffix(featureGlob: string): string {
  return FEATURE_GLOB_SUFFIXES.reduce((value, suffix) => value.replace(suffix, ''), featureGlob);
}
