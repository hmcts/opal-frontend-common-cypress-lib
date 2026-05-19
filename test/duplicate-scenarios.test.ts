import { afterEach, describe, expect, it } from 'vitest';
import { findDuplicateScenarios } from '../src/cucumber/find-duplicate-scenarios';
import { createTempProjectRoot, removeTempProjectRoot, writeProjectFile } from './test-files';

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();

    if (root) {
      removeTempProjectRoot(root);
    }
  }
});

describe('duplicate scenario detection', () => {
  it('reports duplicate scenario names and ignores commented lines', () => {
    const root = createTempProjectRoot('opal-cypress-duplicates-');
    roots.push(root);

    writeProjectFile(
      root,
      'cypress/e2e/a.feature',
      ['Feature: Accounts', '', 'Scenario: Reused name', '  Given I open the page', '', '# Scenario: Reused name'].join('\n'),
    );
    writeProjectFile(
      root,
      'cypress/e2e/nested/b.feature',
      ['Feature: Reports', '', 'Scenario Outline: Reused name', '  Given I open the page'].join('\n'),
    );

    const duplicates = findDuplicateScenarios('cypress/e2e', root);

    expect(duplicates).toEqual([
      {
        name: 'Reused name',
        occurrences: [
          { file: 'cypress/e2e/a.feature', line: 3 },
          { file: 'cypress/e2e/nested/b.feature', line: 3 },
        ],
      },
    ]);
  });
});
