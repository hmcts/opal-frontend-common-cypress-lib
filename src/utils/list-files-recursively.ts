/**
 * @file Filesystem helpers for recursively listing files with optional inclusion and exclusion rules.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Options that control which files and directories are included in a recursive walk.
 */
export interface ListFilesRecursivelyOptions {
  excludeDirectoryNames?: Iterable<string>;
  excludePathFragments?: Iterable<string>;
  includeFile?: (filePath: string) => boolean;
}

/**
 * Recursively lists files beneath a root directory while honoring optional directory and path filters.
 *
 * @param rootDirectory - Root directory to traverse.
 * @param options - Optional filters and inclusion rules for the traversal.
 * @returns Sorted absolute file paths that match the supplied options.
 */
export function listFilesRecursively(rootDirectory: string, options: ListFilesRecursivelyOptions = {}): string[] {
  if (!fs.existsSync(rootDirectory)) {
    return [];
  }

  const excludedDirectoryNames = new Set(options.excludeDirectoryNames ?? []);
  const excludedPathFragments = [...(options.excludePathFragments ?? [])]
    .filter((fragment) => fragment.length > 0)
    .map(normalizePathForComparison);
  const files: string[] = [];

  /**
   * Walks a directory tree depth-first and appends matching files to `files`.
   *
   * @param directory - Directory to traverse.
   * @returns Nothing. Matching files are appended to `files`.
   */
  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      const normalizedPath = normalizePathForComparison(fullPath);

      if (excludedPathFragments.some((fragment) => normalizedPath.includes(fragment))) {
        continue;
      }

      if (entry.isDirectory()) {
        if (!excludedDirectoryNames.has(entry.name)) {
          walk(fullPath);
        }
        continue;
      }

      if (entry.isFile() && (options.includeFile?.(fullPath) ?? true)) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDirectory);

  return files.sort((left, right) => left.localeCompare(right));
}

/**
 * Normalizes a file path to a slash-delimited form suitable for cross-platform substring checks.
 *
 * @param filePath - File path to normalize.
 * @returns The normalized path.
 */
export function normalizePathForComparison(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
