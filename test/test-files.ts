/**
 * @file Test helpers for creating and cleaning up temporary project fixtures.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Creates a temporary project root for an isolated test fixture.
 *
 * @param prefix - Prefix used when creating the temporary directory.
 * @returns The absolute path to the temporary project root.
 */
export function createTempProjectRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Removes a temporary project root and everything beneath it.
 *
 * @param root - Temporary project root to remove.
 * @returns Nothing. The directory is removed recursively when it exists.
 */
export function removeTempProjectRoot(root: string): void {
  fs.rmSync(root, { force: true, recursive: true });
}

/**
 * Writes a file into a temporary project fixture, creating parent directories when needed.
 *
 * @param root - Temporary project root that should contain the file.
 * @param relativePath - Relative path to create beneath the root.
 * @param content - File contents to write.
 * @returns Nothing. The file is created or overwritten.
 */
export function writeProjectFile(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}
