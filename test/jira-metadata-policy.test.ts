/**
 * @file Tests for Jira metadata policy validation across component and feature fixtures.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { validateJiraMetadataPolicy } from '../src/metadata/jira-metadata-policy';
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

describe('Jira metadata policy validation', () => {
  it('validates covered component and functional feature tests with excluded files', () => {
    const root = createTempProjectRoot('opal-cypress-jira-policy-');
    roots.push(root);

    writeProjectFile(
      root,
      'cypress/component/accounts.cy.ts',
      [
        'const buildTags = (...tags: string[]) => tags;',
        '',
        'describe("accounts", () => {',
        '  it("valid component", { tags: buildTags("@JIRA-EPIC:PO-100", "@JIRA-STORY:PO-200") }, () => {});',
        '  it("missing relationship", { tags: ["@JIRA-EPIC:PO-100"] }, () => {});',
        '});',
      ].join('\n'),
    );
    writeProjectFile(
      root,
      'cypress/e2e/functional/opal/features/payments.feature',
      [
        'Feature: Payments',
        '',
        '@JIRA-EPIC:PO-300',
        'Scenario: Missing story',
        '  Given I pay a fine',
        '',
        '@JIRA-EPIC:PO-301 @JIRA-STORY:PO-302',
        'Scenario Outline: Valid outline',
        '  Given I pay a fine',
        'Examples: Happy path',
        '  | amount |',
        '  | 100    |',
      ].join('\n'),
    );
    writeProjectFile(
      root,
      'cypress/e2e/functional/opal/features/reciprocalMaintenance/dummyTest.feature',
      [
        'Feature: Dummy',
        '',
        'Scenario: Ignored placeholder',
        '  Given I do nothing',
      ].join('\n'),
    );

    const result = validateJiraMetadataPolicy(
      {
        excludedFeatureFiles: ['cypress/e2e/functional/opal/features/reciprocalMaintenance/dummyTest.feature'],
        featureRoot: 'cypress/e2e/functional/opal/features',
      },
      root,
    );

    expect(result.tests.map((test) => ({ file: test.filePath, title: test.title }))).toEqual([
      { file: 'cypress/component/accounts.cy.ts', title: 'accounts > valid component' },
      { file: 'cypress/component/accounts.cy.ts', title: 'accounts > missing relationship' },
      { file: 'cypress/e2e/functional/opal/features/payments.feature', title: 'Missing story' },
      { file: 'cypress/e2e/functional/opal/features/payments.feature', title: 'Valid outline [Examples 1: Happy path]' },
    ]);
    expect(result.failures.map((failure) => ({ missing: failure.missing, title: failure.title }))).toEqual([
      { missing: ['@JIRA-STORY or @JIRA-DEFECT'], title: 'accounts > missing relationship' },
      { missing: ['@JIRA-STORY or @JIRA-NFR or @JIRA-DEFECT'], title: 'Missing story' },
    ]);
  });
});
