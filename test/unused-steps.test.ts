/**
 * @file Tests for the unused step-definition detector.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { findUnusedSteps } from '../src/cucumber/find-unused-steps';
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

describe('unused step detection', () => {
  it('matches string and regex step definitions and honours excluded paths', () => {
    const root = createTempProjectRoot('opal-cypress-unused-steps-');
    roots.push(root);

    writeProjectFile(
      root,
      'cypress/support/step_definitions/common.steps.ts',
      [
        'import { Given, Then, When } from "@badeball/cypress-cucumber-preprocessor";',
        '',
        'Given("I open account {string}", () => {});',
        'Then(/^I should see the page header contains "([^"]+)"$/, () => {});',
        'When("I never use this step", () => {});',
      ].join('\n'),
    );
    writeProjectFile(
      root,
      'cypress/support/step_definitions/manual-account-creation/excluded.steps.ts',
      ['Given("I only exist in an excluded path", () => {});'].join('\n'),
    );
    writeProjectFile(
      root,
      'cypress/e2e/accounts.feature',
      [
        'Scenario: Open account',
        '  Given I open account "12345"',
        '  Then I should see the page header contains "Account summary"',
      ].join('\n'),
    );

    const result = findUnusedSteps(
      {
        excludePathFragments: ['manual-account-creation'],
      },
      root,
    );

    expect(result.stepFilesScanned).toBe(1);
    expect(result.featureFilesScanned).toBe(1);
    expect(result.unusedSteps).toEqual([
      {
        file: 'cypress/support/step_definitions/common.steps.ts',
        line: 5,
        source: 'I never use this step',
      },
    ]);
  });
});
