import { extractTestMetadataFromText } from '../src/metadata/extract-test-metadata';

describe('Cypress test metadata extraction', () => {
  it('extracts Jira epic tags from feature scenarios', () => {
    const metadata = extractTestMetadataFromText(
      'cypress/e2e/payments/payments.feature',
      [
        'Feature: Payments',
        '',
        '@smoke @jiraEpic(OPAL-123)',
        'Scenario: Pay a fine',
        '  Given I have a fine',
      ].join('\n'),
    );

    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({
      file: 'cypress/e2e/payments/payments.feature',
      name: 'Pay a fine',
      line: 4,
      epics: ['OPAL-123'],
    });
  });

  it('finds missing and multiple epic metadata in Cypress specs', () => {
    const metadata = extractTestMetadataFromText(
      'cypress/e2e/accounts/accounts.cy.ts',
      [
        'describe("accounts", () => {',
        '  it("loads the account", () => {})',
        '',
        '  /** @jiraEpic OPAL-123 @jiraEpic OPAL-456 */',
        '  it("updates the account", () => {})',
        '})',
      ].join('\n'),
    );

    expect(metadata.map((test) => ({ name: test.name, epics: test.epics }))).toEqual([
      { name: 'loads the account', epics: [] },
      { name: 'updates the account', epics: ['OPAL-123', 'OPAL-456'] },
    ]);
  });
});
