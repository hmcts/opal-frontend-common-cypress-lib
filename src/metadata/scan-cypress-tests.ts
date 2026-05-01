import fs from 'node:fs';
import path from 'node:path';
import { extractTestMetadataFromText, TestMetadata } from './extract-test-metadata';

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'component-output',
  'coverage',
  'dist',
  'functional-output',
  'node_modules',
  'smoke-output',
]);

export function scanCypressTestMetadata(cwd = process.cwd()): TestMetadata[] {
  return findCypressTestFiles(cwd).flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8');
    return extractTestMetadataFromText(path.relative(cwd, file), text);
  });
}

export function findCypressTestFiles(cwd = process.cwd()): string[] {
  const cypressRoot = path.join(cwd, 'cypress');

  if (!fs.existsSync(cypressRoot)) {
    return [];
  }

  return walk(cypressRoot)
    .filter(isCypressTestFile)
    .sort((left, right) => left.localeCompare(right));
}

function walk(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        files.push(...walk(fullPath));
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function isCypressTestFile(file: string): boolean {
  return (
    file.endsWith('.feature') ||
    file.endsWith('.cy.ts') ||
    file.endsWith('.cy.tsx') ||
    file.endsWith('.cy.js') ||
    file.endsWith('.cy.jsx')
  );
}
