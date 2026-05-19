/**
 * @file Tests for Jira test key extraction and CSV formatting helpers.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { extractJiraTestKeys, formatJiraTestKeysCsv } from '../src/metadata/jira-test-key-extraction';
import { createTempProjectRoot, removeTempProjectRoot, writeProjectFile } from './test-files';

const roots: string[] = [];

/**
 * Removes any temporary project roots created by the current test.
 *
 * @returns Nothing. Tracked roots are removed in place.
 */
function cleanupRoots(): void {
  while (roots.length > 0) {
    const root = roots.pop();

    if (root) {
      removeTempProjectRoot(root);
    }
  }
}

afterEach(cleanupRoots);

describe('Jira test key extraction', () => {
  it('extracts both legacy and current Jira test key tags from Cypress tests', () => {
    const root = createTempProjectRoot('opal-cypress-jira-keys-');
    roots.push(root);

    writeProjectFile(
      root,
      'cypress/component/accounts.cy.ts',
      [
        'describe("accounts", () => {',
        '  it("opens the page", { tags: ["@JIRA-TEST-KEY:PO-1234", "@JIRA-KEY:PO-9999"] }, () => {});',
        '});',
      ].join('\n'),
    );
    writeProjectFile(
      root,
      'cypress/e2e/accounts.feature',
      ['@JIRA-TEST-KEY:PO-4321', 'Scenario: Open an account', '  Given I open the page'].join('\n'),
    );

    const matches = extractJiraTestKeys('cypress', root);

    expect(matches.map((match) => ({ file: match.file, key: match.key, line: match.line }))).toEqual([
      { file: 'cypress/component/accounts.cy.ts', key: 'PO-1234', line: 2 },
      { file: 'cypress/component/accounts.cy.ts', key: 'PO-9999', line: 2 },
      { file: 'cypress/e2e/accounts.feature', key: 'PO-4321', line: 1 },
    ]);
    expect(formatJiraTestKeysCsv(matches)).toBe('"PO-1234","PO-9999","PO-4321"');
  });
});
